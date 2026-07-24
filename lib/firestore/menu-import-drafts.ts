import { FirebaseError } from "firebase/app";
import {
  Timestamp,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  logMenuImportDraftSaveError,
} from "@/lib/carta/menu-import-draft-save-diagnostics";
import { sanitizeMenuImportDraftUpdatePatch } from "@/lib/carta/sanitize-menu-import-draft-payload";
import { auth, db } from "@/lib/firebase/client";
import type { MenuImportPublishLogEntry } from "@/lib/carta/publish-result-types";
import type {
  ImportedMenuItem,
  ImportedMenuSection,
  ImportedMenuSourceType,
} from "@/lib/carta/imported-menu-types";

export const MENU_IMPORT_DRAFTS_SUBCOLLECTION = "menuImportDrafts";

export type MenuImportDraftStatus =
  | "draft"
  | "analyzing"
  | "ready"
  | "failed"
  | "partially_published"
  | "published";

export type MenuImportMenuType = "food" | "drinks" | "wine" | "cocktails" | "mixed";

export type MenuImportDraftDocument = {
  id: string;
  restaurantId: string;
  sourceType: ImportedMenuSourceType;
  sourceUrl?: string;
  storagePath?: string;
  originalFileName?: string;
  menuType: MenuImportMenuType;
  status: MenuImportDraftStatus;
  sections: ImportedMenuSection[];
  items: ImportedMenuItem[];
  rawText?: string;
  parserWarnings?: string[];
  aiWarnings?: string[];
  errorMessage?: string;
  publishedItemsCount?: number;
  lastPublishedAt?: number;
  publishInProgress?: boolean;
  publishLogs?: MenuImportPublishLogEntry[];
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
};

export type MenuImportDraftSummary = Omit<
  MenuImportDraftDocument,
  "sections" | "items" | "rawText"
> & {
  itemsCount: number;
  sectionsCount: number;
};

export type CreateMenuImportDraftInput = {
  sourceType: ImportedMenuSourceType;
  menuType: MenuImportMenuType;
  sourceUrl?: string;
  originalFileName?: string;
  storagePath?: string;
  status?: MenuImportDraftStatus;
  createdBy: string;
};

export type UpdateMenuImportDraftInput = Partial<
  Pick<
    MenuImportDraftDocument,
    | "sourceUrl"
    | "storagePath"
    | "originalFileName"
  >
> & {
  updatedBy: string;
};

function rethrowWithMessage(e: unknown): never {
  if (e instanceof FirebaseError) {
    throw new Error(`${e.code}: ${e.message}`);
  }
  if (e instanceof Error) throw e;
  throw new Error(String(e));
}

function assertRestaurantId(restaurantId: string): string {
  const rid = restaurantId.trim();
  if (!rid) {
    throw new Error("menu-import-draft: restaurantId obligatorio");
  }
  return rid;
}

function assertUserId(userId: string): string {
  const uid = userId.trim();
  if (!uid) {
    throw new Error("menu-import-draft: usuario autenticado obligatorio");
  }
  const au = auth.currentUser;
  if (!au) {
    throw new Error("menu-import-draft: no hay sesión activa");
  }
  if (au.uid !== uid) {
    throw new Error("menu-import-draft: uid de sesión no coincide");
  }
  return uid;
}

function readTsMs(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  return undefined;
}

function readMenuType(raw: unknown): MenuImportMenuType {
  if (
    raw === "food" ||
    raw === "drinks" ||
    raw === "wine" ||
    raw === "cocktails" ||
    raw === "mixed"
  ) {
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

function readSourceType(raw: unknown): ImportedMenuSourceType {
  if (raw === "image" || raw === "pdf" || raw === "qr_url") return raw;
  return "image";
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
      suggestedCategory:
        typeof rec.suggestedCategory === "string" ? rec.suggestedCategory : "",
      suggestedStation:
        rec.suggestedStation === "kitchen" ||
        rec.suggestedStation === "bar" ||
        rec.suggestedStation === "cocktail" ||
        rec.suggestedStation === "none"
          ? rec.suggestedStation
          : "none",
      confidence:
        typeof rec.confidence === "number" && Number.isFinite(rec.confidence)
          ? rec.confidence
          : 0,
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

function readStringArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map((v) => v.trim());
  return out.length > 0 ? out : undefined;
}

function draftsCollectionRef(restaurantId: string) {
  return collection(
    db,
    "restaurants",
    assertRestaurantId(restaurantId),
    MENU_IMPORT_DRAFTS_SUBCOLLECTION,
  );
}

function draftDocRef(restaurantId: string, draftId: string) {
  return doc(
    db,
    "restaurants",
    assertRestaurantId(restaurantId),
    MENU_IMPORT_DRAFTS_SUBCOLLECTION,
    draftId.trim(),
  );
}

export function tryParseMenuImportDraftDocument(
  d: QueryDocumentSnapshot | DocumentSnapshot,
): MenuImportDraftDocument | null {
  try {
    if (!d.exists()) return null;
    return parseMenuImportDraftDocument(d);
  } catch {
    return null;
  }
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

export function parseMenuImportDraftDocument(
  d: QueryDocumentSnapshot | DocumentSnapshot,
): MenuImportDraftDocument {
  const data = d.data() as Record<string, unknown>;
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (!restaurantId) {
    throw new Error("menu-import-draft: doc sin restaurantId");
  }

  const sections = readSections(data.sections);
  const itemsRaw = readItems(data.items);
  const items = itemsRaw.length > 0 ? itemsRaw : sections.flatMap((s) => s.items);

  const createdAt = readTsMs(data, "createdAt") ?? 0;
  const updatedAt = readTsMs(data, "updatedAt") ?? createdAt;

  return {
    id: d.id,
    restaurantId,
    sourceType: readSourceType(data.sourceType),
    sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : undefined,
    storagePath: typeof data.storagePath === "string" ? data.storagePath : undefined,
    originalFileName:
      typeof data.originalFileName === "string" ? data.originalFileName : undefined,
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

export function menuImportDraftToSummary(doc: MenuImportDraftDocument): MenuImportDraftSummary {
  const sections = doc.sections ?? [];
  const items = doc.items ?? [];
  const itemsCount =
    items.length > 0
      ? items.length
      : sections.reduce((total, section) => total + (section.items?.length ?? 0), 0);
  const { sections: _s, items: _i, rawText: _r, ...rest } = doc;
  void _s;
  void _i;
  void _r;
  return {
    ...rest,
    itemsCount,
    sectionsCount: sections.length,
  };
}

export async function createMenuImportDraft(
  restaurantId: string,
  input: CreateMenuImportDraftInput,
): Promise<string> {
  const rid = assertRestaurantId(restaurantId);
  const uid = assertUserId(input.createdBy);
  const now = Date.now();
  const ref = doc(draftsCollectionRef(rid));

  const payload: Omit<MenuImportDraftDocument, "id"> = {
    restaurantId: rid,
    sourceType: input.sourceType,
    menuType: input.menuType,
    status: input.status ?? "analyzing",
    sections: [],
    items: [],
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
    ...(input.sourceUrl?.trim() ? { sourceUrl: input.sourceUrl.trim() } : {}),
    // El path y el nombre se asignan juntos, una sola vez, después del upload.
  };

  try {
    await setDoc(ref, {
      ...(payload as unknown as DocumentData),
      id: ref.id,
      serverSavedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

export async function updateMenuImportDraft(
  restaurantId: string,
  draftId: string,
  input: UpdateMenuImportDraftInput,
): Promise<void> {
  let rid = "";
  let did = "";
  let uid = "";
  let patch: Record<string, unknown> = { updatedAt: Date.now() };

  try {
    rid = assertRestaurantId(restaurantId);
    did = String(draftId ?? "").trim();
    if (!did) {
      throw new Error("menu-import-draft: draftId obligatorio");
    }
    uid = assertUserId(input.updatedBy);

    patch = {
      updatedAt: Date.now(),
      updatedBy: uid,
    };

    if (input.sourceUrl !== undefined) patch.sourceUrl = input.sourceUrl;
    if (input.storagePath !== undefined) patch.storagePath = input.storagePath;
    if (input.originalFileName !== undefined) patch.originalFileName = input.originalFileName;

    const ref = draftDocRef(rid, did);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      throw new Error("menu-import-draft: borrador no encontrado");
    }
    const data = existing.data() as Record<string, unknown>;
    const docRid =
      typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
    if (docRid !== rid) {
      throw new Error("menu-import-draft: tenant no autorizado");
    }
    const sanitizedPatch = sanitizeMenuImportDraftUpdatePatch(patch);
    await updateDoc(ref, sanitizedPatch);
  } catch (e) {
    logMenuImportDraftSaveError({
      phase: "updateMenuImportDraft",
      error: e,
      restaurantId: rid || restaurantId,
      draftId: did || draftId,
      userId: uid || input.updatedBy,
      payload: {
        patchKeys: Object.keys(patch),
        patch,
      },
    });
    rethrowWithMessage(e);
  }
}

export async function getMenuImportDraft(
  restaurantId: string,
  draftId: string,
): Promise<MenuImportDraftDocument | null> {
  const rid = assertRestaurantId(restaurantId);
  const did = String(draftId ?? "").trim();
  if (!did) return null;

  try {
    const snap = await getDoc(draftDocRef(rid, did));
    if (!snap.exists()) return null;
    const mapped = parseMenuImportDraftDocument(snap);
    if (mapped.restaurantId !== rid) return null;
    return mapped;
  } catch (e) {
    rethrowWithMessage(e);
  }
}

/**
 * Escucha borradores ordenados por `updatedAt` descendente.
 * `restaurantId` vacío ⇒ callback con [] y unsubscribe no-op.
 */
export function listenMenuImportDrafts(
  restaurantId: string,
  callback: (drafts: MenuImportDraftSummary[]) => void,
  onError?: (error: Error) => void,
): () => void {
  let unsub: () => void = () => {};

  try {
    const rid = restaurantId.trim();
    if (!rid) {
      callback([]);
      return () => {};
    }

    const q = query(draftsCollectionRef(rid), orderBy("updatedAt", "desc"));
    unsub = onSnapshot(
      q,
      (snap) => {
        try {
          const list = snap.docs
            .map((d) => tryParseMenuImportDraftDocument(d))
            .filter((docSnap): docSnap is MenuImportDraftDocument => docSnap != null)
            .map(menuImportDraftToSummary);
          callback(list);
        } catch (e) {
          onError?.(e instanceof Error ? e : new Error(String(e)));
        }
      },
      (error) => {
        onError?.(error instanceof Error ? error : new Error(String(error)));
      },
    );
  } catch (e) {
    onError?.(e instanceof Error ? e : new Error(String(e)));
  }

  return () => unsub();
}
