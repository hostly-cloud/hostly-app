import { mapAiMenuItemsToExtractedRows, type AiMenuDetectedItem } from "@/lib/carta/map-ai-menu-items-to-rows";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import { MAX_MENU_IMPORT_SOURCE_FILES } from "@/lib/carta/menu-import-source-files";
import { readRegisteredMenuImportBatch } from "@/lib/carta/menu-import-client-batch";
import { requestMenuImportProcess } from "@/lib/carta/request-menu-import-process";
import {
  createMenuImportDraft,
  getMenuImportDraft,
  updateMenuImportDraft,
} from "@/lib/firestore/menu-import-drafts";
import { auth } from "@/lib/firebase/client";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import {
  uploadMenuImportFile,
  uploadMenuImportFiles,
} from "@/lib/storage/menu-import-files";

export class MenuImportNoProductsError extends Error {
  readonly code = "NO_PRODUCTS_DETECTED" as const;

  constructor(message: string) {
    super(message);
    this.name = "MenuImportNoProductsError";
  }
}

export class MenuImportExtractError extends Error {
  readonly code: string;

  constructor(message: string, code = "AI_IMPORT_FAILED") {
    super(message);
    this.name = "MenuImportExtractError";
    this.code = code;
  }
}

function normalizedConfidence(raw: number | undefined): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  if (raw > 1) return Math.max(0, Math.min(1, raw / 100));
  return Math.max(0, Math.min(1, raw));
}

function toOnboardingDetectedItems(
  items: NonNullable<Awaited<ReturnType<typeof getMenuImportDraft>>>["items"],
): AiMenuDetectedItem[] {
  return items.map((item) => ({
    nombre: item.name,
    categoria: item.suggestedCategory?.trim() || item.sectionName?.trim() || "General",
    descripcion: item.description,
    precio: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null,
    confianza: normalizedConfidence(item.aiConfidence ?? item.confidence),
    needsReview: item.needsReview === true,
    rawText: item.rawText,
  }));
}

async function readProcessedRows(params: {
  restaurantId: string;
  draftId: string;
}): Promise<{ rows: ExtractedMenuRow[]; ocrTextLength?: number }> {
  const processed = await requestMenuImportProcess(params.draftId);
  if (!processed.ok) {
    if (processed.error === "NO_PRODUCTS_DETECTED") {
      throw new MenuImportNoProductsError(processed.details?.trim() || "NO_PRODUCTS_DETECTED");
    }
    throw new MenuImportExtractError(
      processed.details?.trim() || processed.error,
      processed.error,
    );
  }

  const draft = await getMenuImportDraft(params.restaurantId, params.draftId);
  if (!draft) {
    throw new MenuImportExtractError(
      "El análisis terminó pero no se pudo recuperar el borrador.",
      "DRAFT_NOT_FOUND_AFTER_PROCESS",
    );
  }
  if (draft.items.length === 0) {
    throw new MenuImportNoProductsError("NO_PRODUCTS_DETECTED");
  }

  const rows = mapAiMenuItemsToExtractedRows(toOnboardingDetectedItems(draft.items), params.restaurantId);
  if (rows.length === 0) {
    throw new MenuImportNoProductsError("NO_PRODUCTS_DETECTED");
  }

  return {
    rows,
    ocrTextLength: typeof draft.rawText === "string" ? draft.rawText.length : undefined,
  };
}

/**
 * Entrada canónica de archivo para onboarding y cualquier UI que necesite filas de revisión.
 * El análisis siempre pasa por Menu Import V2: draft tenant-safe → Storage → process → draft listo.
 * Si la UI ha registrado varias páginas para este File principal, se enruta al motor batch canónico.
 */
export async function extractMenuFromUpload(file: File): Promise<{
  rows: ExtractedMenuRow[];
  ocrTextLength?: number;
  draftId?: string;
}> {
  const registeredBatch = readRegisteredMenuImportBatch(file);
  if (registeredBatch && registeredBatch.length > 1) {
    const batch = await extractMenuFromUploads(registeredBatch);
    return {
      rows: batch.rows,
      ocrTextLength: batch.ocrTextLength,
      draftId: batch.draftIds[0],
    };
  }

  const user = auth.currentUser;
  if (!user) {
    throw new MenuImportExtractError("UNAUTHORIZED", "UNAUTHORIZED");
  }

  const rid = getBrowserRestauranteId().trim();
  if (!rid) {
    throw new MenuImportExtractError(
      "No se ha podido identificar el restaurante activo.",
      "RESTAURANT_REQUIRED",
    );
  }

  const sourceType = file.type === "application/pdf" ? "pdf" : "image";
  let draftId = "";

  try {
    draftId = await createMenuImportDraft(rid, {
      sourceType,
      menuType: "mixed",
      status: "draft",
      createdBy: user.uid,
    });

    const uploaded = await uploadMenuImportFile({
      restaurantId: rid,
      draftId,
      file,
      userId: user.uid,
      sourceType,
    });

    await updateMenuImportDraft(rid, draftId, {
      storagePath: uploaded.path,
      originalFileName: uploaded.originalFileName,
      updatedBy: user.uid,
    });

    const result = await readProcessedRows({ restaurantId: rid, draftId });
    return { ...result, draftId };
  } catch (error) {
    if (error instanceof MenuImportNoProductsError || error instanceof MenuImportExtractError) {
      throw error;
    }
    throw new MenuImportExtractError(
      error instanceof Error ? error.message : "AI_IMPORT_FAILED",
      draftId ? "MENU_IMPORT_V2_FAILED" : "MENU_IMPORT_DRAFT_FAILED",
    );
  }
}

export type MenuImportBatchPageResult = {
  fileName: string;
  order: number;
  status: "processed";
};

/**
 * Importación multipágina canónica.
 *
 * Varias fotos se almacenan como fuentes ordenadas dentro de UN único draft. El servidor
 * extrae y parsea cada página por separado, deduplica nombre+precio y guarda un único resultado
 * revisable. Esto mantiene historial, reintentos y publicación en una sola unidad transaccional.
 *
 * Un PDF ya es multipágina por sí mismo, por lo que solo se admite como archivo único.
 */
export async function extractMenuFromUploads(files: readonly File[]): Promise<{
  rows: ExtractedMenuRow[];
  pages: MenuImportBatchPageResult[];
  draftIds: string[];
  ocrTextLength: number;
}> {
  const normalizedFiles = files.filter((file) => file instanceof File && file.size > 0);
  if (normalizedFiles.length === 0) {
    throw new MenuImportExtractError("Selecciona al menos un archivo.", "MENU_IMPORT_FILES_REQUIRED");
  }
  if (normalizedFiles.length > MAX_MENU_IMPORT_SOURCE_FILES) {
    throw new MenuImportExtractError(
      `Puedes importar un máximo de ${MAX_MENU_IMPORT_SOURCE_FILES} páginas por lote.`,
      "MENU_IMPORT_BATCH_TOO_LARGE",
    );
  }
  if (normalizedFiles.length === 1) {
    const single = await extractMenuFromUpload(normalizedFiles[0]);
    return {
      rows: single.rows,
      pages: [{ fileName: normalizedFiles[0].name, order: 0, status: "processed" }],
      draftIds: single.draftId ? [single.draftId] : [],
      ocrTextLength: single.ocrTextLength ?? 0,
    };
  }
  if (normalizedFiles.some((file) => file.type === "application/pdf")) {
    throw new MenuImportExtractError(
      "Para importar varias páginas selecciona imágenes. Los PDF se importan como un único archivo multipágina.",
      "MENU_IMPORT_BATCH_PDF_MIXED",
    );
  }

  const user = auth.currentUser;
  if (!user) {
    throw new MenuImportExtractError("UNAUTHORIZED", "UNAUTHORIZED");
  }
  const rid = getBrowserRestauranteId().trim();
  if (!rid) {
    throw new MenuImportExtractError(
      "No se ha podido identificar el restaurante activo.",
      "RESTAURANT_REQUIRED",
    );
  }

  let draftId = "";
  try {
    draftId = await createMenuImportDraft(rid, {
      sourceType: "image",
      menuType: "mixed",
      status: "draft",
      createdBy: user.uid,
    });

    const uploaded = await uploadMenuImportFiles({
      restaurantId: rid,
      draftId,
      files: [...normalizedFiles],
      userId: user.uid,
    });

    await updateMenuImportDraft(rid, draftId, {
      sourceFiles: uploaded.sources,
      updatedBy: user.uid,
    });

    const result = await readProcessedRows({ restaurantId: rid, draftId });
    return {
      rows: result.rows,
      pages: normalizedFiles.map((pageFile, order) => ({
        fileName: pageFile.name,
        order,
        status: "processed" as const,
      })),
      draftIds: [draftId],
      ocrTextLength: result.ocrTextLength ?? 0,
    };
  } catch (error) {
    if (error instanceof MenuImportNoProductsError || error instanceof MenuImportExtractError) {
      throw error;
    }
    throw new MenuImportExtractError(
      error instanceof Error ? error.message : "AI_IMPORT_FAILED",
      draftId ? "MENU_IMPORT_V2_BATCH_FAILED" : "MENU_IMPORT_DRAFT_FAILED",
    );
  }
}
