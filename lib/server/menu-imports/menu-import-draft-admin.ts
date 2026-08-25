import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  MENU_IMPORT_DRAFTS_SUBCOLLECTION,
  type MenuImportDraftDocument,
  type MenuImportDraftStatus,
  type MenuImportMenuType,
} from "@/lib/firestore/menu-import-drafts";
import type { MenuImportPublishLogEntry } from "@/lib/carta/publish-result-types";
import { sanitizeMenuImportDraftUpdatePatch } from "@/lib/carta/sanitize-menu-import-draft-payload";
import { readMenuImportSourceFiles } from "@/lib/carta/menu-import-source-files";
import type {
  ImportedMenuItem,
  ImportedMenuSection,
  ImportedMenuSourceType,
} from "@/lib/carta/imported-menu-types";

function readTsMs(data: Record<string, unknown>, key: string): number {
  const v = data[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "toMillis" in v && typeof (v as Timestamp).toMillis === "function") {
    return (v as Timestamp).toMillis();
  }
  return 0;
}

function readSourceType(raw: unknown): ImportedMenuSourceType {
  if (raw === "image" || raw === "pdf" || raw === "qr_url") return raw;
  return "image";
}

function readMenuType(raw: unknown): MenuImportMenuType {
  if (raw === "food" || raw === "drinks" || raw === "wine" || raw === "cocktails" || raw === "mixed") {
    return raw;
  }
  return "mixed";
}

function readStatus(raw: unknown): MenuImportDraftStatus {
  if (
    raw === "draft" ||
    raw === "analyzing" ||
    raw === "ready" ||
    raw === "failed" ||
    raw === "partially_published" ||
    raw === "published"
  ) {
    return raw;
  }
  return "draft";
}

function readSections(raw: unknown): ImportedMenuSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedMenuSection[] = [];
  for (const s of raw) {
    if (s == null || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const items = readItems(rec.items);
    if (!name && items.length === 0) continue;
    out.push({
      id: id || `section-${out.length}`,
      name: name || "General",
      items,
    });
  }
  return out;
}

function readStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  return out.length > 0 ? out : undefined;
}

function readInferredAttributes(raw: unknown): ImportedMenuItem["inferredAttributes"] {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const out: NonNullable<ImportedMenuItem["inferredAttributes"]> = {};
  if (rec.wineByGlass === true) out.wineByGlass = true;
  if (rec.bottle === true) out.bottle = true;
  if (rec.spicy === true) out.spicy = true;
  if (rec.vegetarian === true) out.vegetarian = true;
  if (rec.vegan === true) out.vegan = true;
  if (rec.cocktail === true) out.cocktail = true;
  if (rec.coffee === true) out.coffee = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

function readItems(raw: unknown): ImportedMenuItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportedMenuItem[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!id || !name) continue;
    out.push({
      id,
      sourceType: readSourceType(rec.sourceType),
      name,
      description: typeof rec.description === "string" ? rec.description : undefined,
      price: typeof rec.price === "number" && Number.isFinite(rec.price) ? rec.price : undefined,
      sectionName: typeof rec.sectionName === "string" ? rec.sectionName : "",
      suggestedCategory: typeof rec.suggestedCategory === "string" ? rec.suggestedCategory : "",
      suggestedStation:
        rec.suggestedStation === "kitchen" ||
        rec.suggestedStation === "bar" ||
        rec.suggestedStation === "cocktail" ||
        rec.suggestedStation === "none"
          ? rec.suggestedStation
          : "none",
      confidence:
        typeof rec.confidence === "number" && Number.isFinite(rec.confidence) ? rec.confidence : 0,
      rawText: typeof rec.rawText === "string" ? rec.rawText : undefined,
      needsReview: rec.needsReview === true,
      selectedForPublish: rec.selectedForPublish !== false,
      inferredAttributes: readInferredAttributes(rec.inferredAttributes),
      duplicateOf: typeof rec.duplicateOf === "string" && rec.duplicateOf.trim() ? rec.duplicateOf.trim() : undefined,
      aiWarnings: readStringArray(rec.aiWarnings),
      aiConfidence:
        typeof rec.aiConfidence === "number" && Number.isFinite(rec.aiConfidence)
          ? rec.aiConfidence
          : undefined,
      aiEnriched: rec.aiEnriched === true,
      publishedProductId:
        typeof rec.publishedProductId === "string" && rec.publishedProductId.trim()
          ? rec.publishedProductId.trim()
          : undefined,
      publishedAt:
        typeof rec.publishedAt === "number" && Number.isFinite(rec.publishedAt)
          ? rec.publishedAt
          : undefined,
      publishStatus:
        rec.publishStatus === "published" ||
        rec.publishStatus === "skipped" ||
        rec.publishStatus === "error"
          ? rec.publishStatus
          : undefined,
    });
  }
  return out;
}

function readPublishLogs(raw: unknown): MenuImportPublishLogEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: MenuImportPublishLogEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.at !== "number" || !Number.isFinite(rec.at)) continue;
    if (typeof rec.by !== "string") continue;
    out.push({
      at: rec.at,
      by: rec.by,
      createdCount: typeof rec.createdCount === "number" ? rec.createdCount : 0,
      skippedCount: typeof rec.skippedCount === "number" ? rec.skippedCount : 0,
      alreadyPublishedCount:
        typeof rec.alreadyPublishedCount === "number" ? rec.alreadyPublishedCount : 0,
      confirmedDuplicateCount:
        typeof rec.confirmedDuplicateCount === "number" ? rec.confirmedDuplicateCount : 0,
      errorCount: typeof rec.errorCount === "number" ? rec.errorCount : 0,
      itemIds: Array.isArray(rec.itemIds)
        ? rec.itemIds.filter((id): id is string => typeof id === "string")
        : [],
    });
  }
  return out.length > 0 ? out : undefined;
}

export function parseMenuImportDraftAdmin(
  restaurantId: string,
  draftId: string,
  data: Record<string, unknown>,
): MenuImportDraftDocument {
  const docRestaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRestaurantId !== restaurantId.trim()) {
    throw new Error("TENANT_MISMATCH");
  }

  const sections = readSections(data.sections);
  const itemsRaw = readItems(data.items);
  const items = itemsRaw.length > 0 ? itemsRaw : sections.flatMap((s) => s.items);

  const createdAt = readTsMs(data, "createdAt");
  const updatedAt = readTsMs(data, "updatedAt") || createdAt;

  return {
    id: draftId,
    restaurantId: docRestaurantId,
    sourceType: readSourceType(data.sourceType),
    sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : undefined,
    storagePath: typeof data.storagePath === "string" ? data.storagePath : undefined,
    originalFileName: typeof data.originalFileName === "string" ? data.originalFileName : undefined,
    sourceFiles: readMenuImportSourceFiles(data.sourceFiles),
    menuType: readMenuType(data.menuType),
    status: readStatus(data.status),
    sections,
    items,
    rawText: typeof data.rawText === "string" ? data.rawText : undefined,
    parserWarnings: readStringArray(data.parserWarnings),
    aiWarnings: readStringArray(data.aiWarnings),
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : undefined,
    publishedItemsCount:
      typeof data.publishedItemsCount === "number" && Number.isFinite(data.publishedItemsCount)
        ? data.publishedItemsCount
        : undefined,
    lastPublishedAt:
      typeof data.lastPublishedAt === "number" && Number.isFinite(data.lastPublishedAt)
        ? data.lastPublishedAt
        : undefined,
    publishInProgress: data.publishInProgress === true,
    publishLogs: readPublishLogs(data.publishLogs),
    createdAt,
    updatedAt,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : undefined,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
  };
}

function draftDocRef(db: Firestore, restaurantId: string, draftId: string) {
  return db
    .collection("restaurants")
    .doc(restaurantId.trim())
    .collection(MENU_IMPORT_DRAFTS_SUBCOLLECTION)
    .doc(draftId.trim());
}

export async function getMenuImportDraftAdmin(
  db: Firestore,
  restaurantId: string,
  draftId: string,
): Promise<MenuImportDraftDocument | null> {
  const did = draftId.trim();
  if (!did) return null;
  const snap = await draftDocRef(db, restaurantId, did).get();
  if (!snap.exists) return null;
  return parseMenuImportDraftAdmin(restaurantId, snap.id, snap.data() as Record<string, unknown>);
}

export async function updateMenuImportDraftAdmin(
  db: Firestore,
  restaurantId: string,
  draftId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const ref = draftDocRef(db, restaurantId, draftId);
  const existing = await ref.get();
  if (!existing.exists) {
    throw new Error("DRAFT_NOT_FOUND");
  }
  const data = existing.data() as Record<string, unknown>;
  const docRid = typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRid !== restaurantId.trim()) {
    throw new Error("TENANT_MISMATCH");
  }
  await ref.update(
    sanitizeMenuImportDraftUpdatePatch({
      ...patch,
      updatedAt: Date.now(),
      serverSavedAt: FieldValue.serverTimestamp(),
    }),
  );
}
