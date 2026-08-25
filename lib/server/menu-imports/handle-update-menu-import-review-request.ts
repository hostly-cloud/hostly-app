import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  buildMenuImportLearningSignal,
  persistMenuImportLearningSignals,
  type MenuImportLearningSignal,
} from "./menu-import-local-learning";

type ReviewStation = "kitchen" | "bar" | "cocktail" | "none";

export type MenuImportReviewItemPatch = {
  id: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  suggestedCategory?: string;
  suggestedStation?: ReviewStation;
  selectedForPublish?: boolean;
};

export class MenuImportReviewUpdateError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = "MenuImportReviewUpdateError";
  }
}

const REVIEW_PATCH_KEYS = new Set([
  "id",
  "name",
  "description",
  "price",
  "suggestedCategory",
  "suggestedStation",
  "selectedForPublish",
]);

function invalidPatch(): never {
  throw new MenuImportReviewUpdateError("INVALID_REVIEW_PATCH", 400);
}

function isReviewStation(value: unknown): value is ReviewStation {
  return (
    value === "kitchen" ||
    value === "bar" ||
    value === "cocktail" ||
    value === "none"
  );
}

function parseReviewPatches(raw: unknown): MenuImportReviewItemPatch[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 500) {
    return invalidPatch();
  }
  const seen = new Set<string>();
  return raw.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return invalidPatch();
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => !REVIEW_PATCH_KEYS.has(key))) {
      return invalidPatch();
    }
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id || seen.has(id)) return invalidPatch();
    seen.add(id);

    const patch: MenuImportReviewItemPatch = { id };
    if ("name" in record) {
      if (typeof record.name !== "string") return invalidPatch();
      const name = record.name.trim();
      if (!name || name.length > 160) return invalidPatch();
      patch.name = name;
    }
    if ("description" in record) {
      if (
        record.description !== null &&
        typeof record.description !== "string"
      ) {
        return invalidPatch();
      }
      if (
        typeof record.description === "string" &&
        record.description.length > 2_000
      ) {
        return invalidPatch();
      }
      patch.description = record.description as string | null;
    }
    if ("price" in record) {
      if (
        record.price !== null &&
        (typeof record.price !== "number" ||
          !Number.isFinite(record.price) ||
          record.price < 0 ||
          record.price > 1_000_000)
      ) {
        return invalidPatch();
      }
      patch.price = record.price as number | null;
    }
    if ("suggestedCategory" in record) {
      if (
        typeof record.suggestedCategory !== "string" ||
        record.suggestedCategory.length > 160
      ) {
        return invalidPatch();
      }
      patch.suggestedCategory = record.suggestedCategory.trim();
    }
    if ("suggestedStation" in record) {
      if (!isReviewStation(record.suggestedStation)) {
        return invalidPatch();
      }
      patch.suggestedStation = record.suggestedStation;
    }
    if ("selectedForPublish" in record) {
      if (typeof record.selectedForPublish !== "boolean") {
        return invalidPatch();
      }
      patch.selectedForPublish = record.selectedForPublish;
    }
    if (Object.keys(patch).length === 1) return invalidPatch();
    return patch;
  });
}

function itemRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MenuImportReviewUpdateError("DRAFT_ITEMS_INCONSISTENT", 409);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id.trim()) {
    throw new MenuImportReviewUpdateError("DRAFT_ITEMS_INCONSISTENT", 409);
  }
  return record;
}

function applyReviewPatch(
  item: Record<string, unknown>,
  patch: MenuImportReviewItemPatch,
): Record<string, unknown> {
  const next = { ...item };
  if (patch.name !== undefined) next.name = patch.name;
  if (patch.description === null) delete next.description;
  else if (patch.description !== undefined) next.description = patch.description;
  if (patch.price === null) delete next.price;
  else if (patch.price !== undefined) next.price = patch.price;
  if (patch.suggestedCategory !== undefined) {
    next.suggestedCategory = patch.suggestedCategory;
  }
  if (patch.suggestedStation !== undefined) {
    next.suggestedStation = patch.suggestedStation;
  }
  if (patch.selectedForPublish !== undefined) {
    next.selectedForPublish = patch.selectedForPublish;
  }
  return next;
}

export async function updateMenuImportReview(input: {
  db: Firestore;
  restaurantId: string;
  draftId: string;
  userId: string;
  patches: MenuImportReviewItemPatch[];
}): Promise<void> {
  const ref = input.db
    .collection("restaurants")
    .doc(input.restaurantId)
    .collection("menuImportDrafts")
    .doc(input.draftId);
  const patchesById = new Map(input.patches.map((patch) => [patch.id, patch]));

  const learningSignals = await input.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new MenuImportReviewUpdateError("DRAFT_NOT_FOUND", 404);
    }
    const data = snapshot.data() as Record<string, unknown>;
    if (data.restaurantId !== input.restaurantId) {
      throw new MenuImportReviewUpdateError("TENANT_MISMATCH", 403);
    }
    if (data.status !== "ready" || data.publishInProgress === true) {
      throw new MenuImportReviewUpdateError("DRAFT_NOT_EDITABLE", 409);
    }
    if (!Array.isArray(data.sections) || !Array.isArray(data.items)) {
      throw new MenuImportReviewUpdateError("DRAFT_ITEMS_INCONSISTENT", 409);
    }

    const sectionItemIds = new Set<string>();
    const sections = data.sections.map((sectionValue) => {
      if (
        !sectionValue ||
        typeof sectionValue !== "object" ||
        Array.isArray(sectionValue)
      ) {
        throw new MenuImportReviewUpdateError(
          "DRAFT_ITEMS_INCONSISTENT",
          409,
        );
      }
      const section = sectionValue as Record<string, unknown>;
      if (!Array.isArray(section.items)) {
        throw new MenuImportReviewUpdateError(
          "DRAFT_ITEMS_INCONSISTENT",
          409,
        );
      }
      const items = section.items.map((itemValue) => {
        const item = itemRecord(itemValue);
        const id = String(item.id).trim();
        if (sectionItemIds.has(id)) {
          throw new MenuImportReviewUpdateError(
            "DRAFT_ITEMS_INCONSISTENT",
            409,
          );
        }
        sectionItemIds.add(id);
        const patch = patchesById.get(id);
        return patch ? applyReviewPatch(item, patch) : item;
      });
      return { ...section, items };
    });

    const signals: MenuImportLearningSignal[] = [];
    const topLevelIds = new Set<string>();
    const items = data.items.map((itemValue) => {
      const item = itemRecord(itemValue);
      const id = String(item.id).trim();
      if (topLevelIds.has(id)) {
        throw new MenuImportReviewUpdateError(
          "DRAFT_ITEMS_INCONSISTENT",
          409,
        );
      }
      topLevelIds.add(id);
      const patch = patchesById.get(id);
      if (patch) {
        const signal = buildMenuImportLearningSignal({
          restaurantId: input.restaurantId,
          draftId: input.draftId,
          itemId: id,
          itemName:
            patch.name ?? (typeof item.name === "string" ? item.name : ""),
          userId: input.userId,
          stationBefore: isReviewStation(item.suggestedStation)
            ? item.suggestedStation
            : undefined,
          stationAfter: patch.suggestedStation,
          categoryBefore:
            typeof item.suggestedCategory === "string"
              ? item.suggestedCategory
              : undefined,
          categoryAfter: patch.suggestedCategory,
        });
        if (signal) signals.push(signal);
      }
      return patch ? applyReviewPatch(item, patch) : item;
    });
    if (
      sectionItemIds.size !== topLevelIds.size ||
      [...sectionItemIds].some((id) => !topLevelIds.has(id)) ||
      [...patchesById.keys()].some(
        (id) => !sectionItemIds.has(id) || !topLevelIds.has(id),
      )
    ) {
      throw new MenuImportReviewUpdateError(
        "DRAFT_ITEMS_INCONSISTENT",
        409,
      );
    }

    transaction.update(ref, {
      sections,
      items,
      updatedAt: Date.now(),
      updatedBy: input.userId,
      serverSavedAt: FieldValue.serverTimestamp(),
    });

    return signals;
  });

  if (learningSignals.length > 0) {
    await persistMenuImportLearningSignals({
      db: input.db,
      restaurantId: input.restaurantId,
      signals: learningSignals,
    }).catch((error) => {
      console.warn("[Hostly][MenuImport Learning] signal persistence failed", {
        restaurantId: input.restaurantId,
        draftId: input.draftId,
        signalCount: learningSignals.length,
        error: error instanceof Error ? error.message : "LEARNING_SIGNAL_WRITE_FAILED",
      });
    });
  }
}

export type UpdateMenuImportReviewDependencies =
  AuthenticatedRestaurantDependencies & {
    updateReview?: typeof updateMenuImportReview;
  };

export async function handleUpdateMenuImportReviewRequest(
  req: Request,
  dependencies?: UpdateMenuImportReviewDependencies,
) {
  const authContext = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authContext)) return authContext;
  if (!serverRoleHasCapability(authContext.role, "settings.manage")) {
    return NextResponse.json(
      { ok: false, error: "SETTINGS_MANAGE_REQUIRED" },
      { status: 403 },
    );
  }

  try {
    const body = (await req.json().catch(() => null)) as
      | { draftId?: unknown; items?: unknown }
      | null;
    const draftId =
      typeof body?.draftId === "string" ? body.draftId.trim() : "";
    if (!draftId) {
      throw new MenuImportReviewUpdateError("MISSING_DRAFT_ID", 400);
    }
    const patches = parseReviewPatches(body?.items);
    await (dependencies?.updateReview ?? updateMenuImportReview)({
      db: authContext.db,
      restaurantId: authContext.restaurantId,
      draftId,
      userId: authContext.uid,
      patches,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MenuImportReviewUpdateError) {
      return NextResponse.json(
        { ok: false, error: error.code },
        { status: error.httpStatus },
      );
    }
    console.error("[api/menu-imports/review]", {
      code: "REVIEW_UPDATE_FAILED",
    });
    return NextResponse.json(
      { ok: false, error: "REVIEW_UPDATE_FAILED" },
      { status: 500 },
    );
  }
}
