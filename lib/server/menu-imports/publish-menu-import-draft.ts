import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import { mapStationToPreparationArea } from "@/lib/carta/map-station-to-preparation-area";
import { inferTipoVentaFromCartaText } from "@/lib/platos-local";
import type { ImportedMenuItem, ImportedMenuSection } from "@/lib/carta/imported-menu-types";
import type {
  MenuImportPublishItemResult,
  MenuImportPublishLogEntry,
  MenuImportPublishResult,
} from "@/lib/carta/publish-result-types";
import {
  canPublishEvaluation,
  evaluateImportItemForPublish,
  publishSkipMessage,
} from "./evaluate-import-item-for-publish";
import { getMenuImportDraftAdmin, updateMenuImportDraftAdmin } from "./menu-import-draft-admin";
import { loadCentralProductsAdmin } from "./load-central-products-admin";
import { loadHostlyCartaCategories } from "./load-hostly-carta-categories";
import {
  logPublishFlowCandidateEvaluation,
  logPublishFlowCreated,
  logPublishFlowDetected,
  logPublishFlowPendingWrites,
  logPublishFlowSelected,
} from "./publish-flow-diagnostics";

const PUBLISH_LOCK_MS = 2 * 60 * 1000;
const BATCH_CHUNK_SIZE = 100;

export class PublishMenuImportDraftError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "PublishMenuImportDraftError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function flattenDraftItems(sections: ImportedMenuSection[], items: ImportedMenuItem[]): ImportedMenuItem[] {
  if (items.length > 0) return items;
  return sections.flatMap((s) => s.items);
}

function updateItemInCollections(
  sections: ImportedMenuSection[],
  items: ImportedMenuItem[],
  itemId: string,
  patch: Partial<ImportedMenuItem>,
): { sections: ImportedMenuSection[]; items: ImportedMenuItem[] } {
  const mapItem = (item: ImportedMenuItem) => (item.id === itemId ? { ...item, ...patch } : item);
  return {
    sections: sections.map((s) => ({ ...s, items: s.items.map(mapItem) })),
    items: items.map(mapItem),
  };
}

async function productExists(
  db: Firestore,
  restaurantId: string,
  productId: string,
): Promise<boolean> {
  const snap = await db
    .collection("restaurants")
    .doc(restaurantId.trim())
    .collection("products")
    .doc(productId.trim())
    .get();
  return snap.exists;
}

async function findProductByImportKey(
  db: Firestore,
  restaurantId: string,
  draftId: string,
  itemId: string,
): Promise<string | null> {
  try {
    const snap = await db
      .collection("restaurants")
      .doc(restaurantId.trim())
      .collection("products")
      .where("importedFromMenuDraftId", "==", draftId)
      .where("importedMenuItemId", "==", itemId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch {
    return null;
  }
}

function buildProductDocument(args: {
  restaurantId: string;
  draftId: string;
  item: ImportedMenuItem;
  evaluation: ReturnType<typeof evaluateImportItemForPublish>;
  userId: string;
  now: number;
}): Record<string, unknown> {
  const category = args.evaluation.resolvedCategory!;
  const preparationArea = mapStationToPreparationArea(args.evaluation.productStation);
  const tipoVenta = inferTipoVentaFromCartaText(category.name, args.evaluation.name);

  const familyFields =
    category.productFamilyId && category.productFamilyType
      ? {
          productFamilyId: category.productFamilyId,
          ...(category.productFamilyName?.trim()
            ? { productFamilyName: category.productFamilyName.trim() }
            : {}),
          productFamilyType: category.productFamilyType,
        }
      : {};

  return {
    restaurantId: args.restaurantId.trim(),
    name: args.evaluation.name,
    normalizedName: normalizeProductName(args.evaluation.name),
    ...(args.item.description?.trim() ? { description: args.item.description.trim() } : {}),
    categoryId: category.id,
    categoryName: category.name,
    ...familyFields,
    price: args.item.price,
    station: args.evaluation.productStation,
    ...(preparationArea ? { preparationArea } : {}),
    tipoVenta,
    visibleOnMenu: true,
    active: true,
    importedFromMenuDraftId: args.draftId,
    importedMenuItemId: args.item.id,
    importedAt: args.now,
    importedBy: args.userId,
    aiGenerated: args.item.aiEnriched === true,
    aiConfidence: args.evaluation.confidence,
    sourceType: args.item.sourceType,
    inventory: {
      enabled: false,
      unit: "ud",
      currentStock: 0,
      minStock: 0,
      costPerUnit: 0,
    },
    recipe: {
      enabled: false,
      ingredients: [],
    },
    createdAt: args.now,
    updatedAt: args.now,
  };
}

function computeDraftStatus(
  allItems: ImportedMenuItem[],
  updatedItems: ImportedMenuItem[],
): "ready" | "partially_published" | "published" {
  const updatedById = new Map(updatedItems.map((i) => [i.id, i]));
  const selected = allItems.filter((i) => i.selectedForPublish && i.name.trim());
  if (selected.length === 0) return "ready";

  const publishedCount = selected.filter((i) => {
    const current = updatedById.get(i.id) ?? i;
    return current.publishStatus === "published";
  }).length;

  if (publishedCount === 0) return "ready";
  if (publishedCount >= selected.length) return "published";
  return "partially_published";
}

export async function publishMenuImportDraft(params: {
  db: Firestore;
  restaurantId: string;
  draftId: string;
  userId: string;
  itemIds?: string[];
  confirmDuplicates?: string[];
  confirmReviews?: string[];
}): Promise<MenuImportPublishResult> {
  const { db, restaurantId, userId } = params;
  const draftId = params.draftId.trim();
  if (!draftId) {
    throw new PublishMenuImportDraftError("INVALID_DRAFT_ID", "draftId obligatorio", 400);
  }

  const publishConfirmations = {
    confirmDuplicates: new Set(
      (params.confirmDuplicates ?? []).map((id) => id.trim()).filter(Boolean),
    ),
    confirmReviews: new Set(
      (params.confirmReviews ?? []).map((id) => id.trim()).filter(Boolean),
    ),
  };

  const draft = await getMenuImportDraftAdmin(db, restaurantId, draftId);
  if (!draft) {
    throw new PublishMenuImportDraftError("DRAFT_NOT_FOUND", "Borrador no encontrado", 404);
  }
  if (draft.restaurantId !== restaurantId.trim()) {
    throw new PublishMenuImportDraftError("TENANT_MISMATCH", "Borrador fuera del tenant", 403);
  }
  if (
    draft.status !== "ready" &&
    draft.status !== "partially_published" &&
    draft.status !== "published"
  ) {
    throw new PublishMenuImportDraftError(
      "DRAFT_NOT_READY",
      "El borrador no está listo para publicar",
      409,
    );
  }

  if (draft.publishInProgress === true) {
    const ageMs = Date.now() - draft.updatedAt;
    if (ageMs < PUBLISH_LOCK_MS) {
      throw new PublishMenuImportDraftError(
        "PUBLISH_IN_PROGRESS",
        "Ya hay una publicación en curso. Espera unos segundos.",
        409,
      );
    }
  }

  await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
    publishInProgress: true,
    updatedBy: userId,
  });

  const now = Date.now();
  const created: MenuImportPublishItemResult[] = [];
  const skipped: MenuImportPublishItemResult[] = [];
  const alreadyPublished: MenuImportPublishItemResult[] = [];
  const confirmedDuplicates: MenuImportPublishItemResult[] = [];
  const errors: MenuImportPublishItemResult[] = [];

  let sections = draft.sections;
  let items = draft.items;

  try {
    const allItems = flattenDraftItems(sections, items);
    const itemIdFilter =
      params.itemIds && params.itemIds.length > 0
        ? new Set(params.itemIds.map((id) => id.trim()).filter(Boolean))
        : null;

    logPublishFlowDetected({ draftId, restaurantId, allItems });

    const candidates = allItems.filter((item) => {
      if (!item.selectedForPublish) return false;
      if (!item.name.trim()) return false;
      if (itemIdFilter && !itemIdFilter.has(item.id)) return false;
      return true;
    });

    logPublishFlowSelected({ draftId, candidates });

    const [categories, catalog] = await Promise.all([
      loadHostlyCartaCategories(db, restaurantId),
      loadCentralProductsAdmin(db, restaurantId),
    ]);
    const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

    type PendingWrite = {
      item: ImportedMenuItem;
      evaluation: ReturnType<typeof evaluateImportItemForPublish>;
      productRef: DocumentReference;
      isConfirmedDuplicate: boolean;
    };

    const pendingWrites: PendingWrite[] = [];

    for (const item of candidates) {
      if (item.publishStatus === "published" && item.publishedProductId?.trim()) {
        const exists = await productExists(db, restaurantId, item.publishedProductId);
        if (exists) {
        alreadyPublished.push({
          itemId: item.id,
          itemName: item.name,
          outcome: "already_published",
          productId: item.publishedProductId,
          message: "Ya publicado previamente",
          visibleInTpv: true,
        });
          continue;
        }
      }

      const existingByKey = await findProductByImportKey(db, restaurantId, draftId, item.id);
      if (existingByKey) {
        const patch = {
          publishStatus: "published" as const,
          publishedProductId: existingByKey,
          publishedAt: item.publishedAt ?? now,
        };
        ({ sections, items } = updateItemInCollections(sections, items, item.id, patch));
        alreadyPublished.push({
          itemId: item.id,
          itemName: item.name,
          outcome: "already_published",
          productId: existingByKey,
          message: "Producto ya vinculado a este borrador",
          visibleInTpv: true,
        });
        continue;
      }

      const evaluation = evaluateImportItemForPublish({
        item,
        menuType: draft.menuType,
        categories,
        categoryNameById,
        catalog,
        confirmDuplicates: publishConfirmations.confirmDuplicates,
      });

      const isConfirmedDuplicate =
        evaluation.action === "possible_duplicate" &&
        publishConfirmations.confirmDuplicates.has(item.id);

      const skipMessage = !canPublishEvaluation(evaluation, publishConfirmations)
        ? publishSkipMessage(evaluation, publishConfirmations)
        : undefined;

      logPublishFlowCandidateEvaluation({
        draftId,
        item,
        evaluation,
        canPublish: !skipMessage,
        skipMessage,
      });

      if (skipMessage) {
        skipped.push({
          itemId: item.id,
          itemName: item.name,
          outcome: "skipped",
          message: skipMessage,
        });
        continue;
      }

      const productRef = db
        .collection("restaurants")
        .doc(restaurantId.trim())
        .collection("products")
        .doc();

      pendingWrites.push({ item, evaluation, productRef, isConfirmedDuplicate });
    }

    logPublishFlowPendingWrites({
      draftId,
      count: pendingWrites.length,
      itemIds: pendingWrites.map((entry) => entry.item.id),
      names: pendingWrites.map((entry) => entry.item.name),
    });

    for (let i = 0; i < pendingWrites.length; i += BATCH_CHUNK_SIZE) {
      const chunk = pendingWrites.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = db.batch();

      for (const entry of chunk) {
        batch.set(
          entry.productRef,
          buildProductDocument({
            restaurantId,
            draftId,
            item: entry.item,
            evaluation: entry.evaluation,
            userId,
            now,
          }),
        );
      }

      await batch.commit();

      for (const entry of chunk) {
        const productId = entry.productRef.id;
        const patch = {
          publishStatus: "published" as const,
          publishedProductId: productId,
          publishedAt: now,
          selectedForPublish: false,
        };
        ({ sections, items } = updateItemInCollections(sections, items, entry.item.id, patch));

        const result: MenuImportPublishItemResult = {
          itemId: entry.item.id,
          itemName: entry.item.name,
          outcome: entry.isConfirmedDuplicate ? "confirmed_duplicate" : "created",
          productId,
          visibleInTpv: true,
        };

        if (entry.isConfirmedDuplicate) {
          confirmedDuplicates.push(result);
        } else {
          created.push(result);
        }
      }
    }

    const flatItems = flattenDraftItems(sections, items);
    const draftStatus = computeDraftStatus(allItems, flatItems);
    const publishedItemsCount = flatItems.filter((i) => i.publishStatus === "published").length;

    const logEntry: MenuImportPublishLogEntry = {
      at: now,
      by: userId,
      createdCount: created.length,
      skippedCount: skipped.length,
      alreadyPublishedCount: alreadyPublished.length,
      confirmedDuplicateCount: confirmedDuplicates.length,
      errorCount: errors.length,
      itemIds: [
        ...created,
        ...confirmedDuplicates,
        ...alreadyPublished,
        ...skipped,
        ...errors,
      ].map((r) => r.itemId),
    };

    const existingLogs = Array.isArray(draft.publishLogs) ? draft.publishLogs : [];

    await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
      sections,
      items,
      status: draftStatus,
      publishedItemsCount,
      lastPublishedAt: now,
      publishInProgress: false,
      publishLogs: [...existingLogs, logEntry].slice(-20),
      updatedBy: userId,
    });

    logPublishFlowCreated({
      draftId,
      created: created.map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        productId: r.productId ?? "",
      })),
      skipped: skipped.map((r) => ({
        itemId: r.itemId,
        itemName: r.itemName,
        message: r.message,
      })),
      alreadyPublished: alreadyPublished.length,
      errors: errors.length,
      confirmReviews: [...publishConfirmations.confirmReviews],
      confirmDuplicates: [...publishConfirmations.confirmDuplicates],
    });

    return {
      draftId,
      publishedAt: now,
      draftStatus,
      created,
      skipped,
      alreadyPublished,
      confirmedDuplicates,
      errors,
      totals: {
        createdCount: created.length,
        skippedCount: skipped.length,
        alreadyPublishedCount: alreadyPublished.length,
        confirmedDuplicateCount: confirmedDuplicates.length,
        errorCount: errors.length,
      },
    };
  } catch (e) {
    await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
      publishInProgress: false,
      updatedBy: userId,
    }).catch(() => {
      /* ignore */
    });
    throw e;
  }
}
