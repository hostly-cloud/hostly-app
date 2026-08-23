import { mapAiMenuItemsToExtractedRows, type AiMenuDetectedItem } from "@/lib/carta/map-ai-menu-items-to-rows";
import type { ExtractedMenuRow } from "@/lib/carta/mock-menu-photo-import";
import { mergeMenuImportBatchRows } from "@/lib/carta/merge-menu-import-batch-rows";
import { requestMenuImportProcess } from "@/lib/carta/request-menu-import-process";
import {
  createMenuImportDraft,
  getMenuImportDraft,
  updateMenuImportDraft,
} from "@/lib/firestore/menu-import-drafts";
import { auth } from "@/lib/firebase/client";
import { getBrowserRestauranteId } from "@/lib/hostly/restaurant-scope";
import { uploadMenuImportFile } from "@/lib/storage/menu-import-files";

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

/**
 * Entrada canónica de archivo para onboarding y cualquier UI que necesite filas de revisión.
 * El análisis siempre pasa por Menu Import V2: draft tenant-safe → Storage → process → draft listo.
 */
export async function extractMenuFromUpload(file: File): Promise<{
  rows: ExtractedMenuRow[];
  ocrTextLength?: number;
  draftId?: string;
}> {
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

    const processed = await requestMenuImportProcess(draftId);
    if (!processed.ok) {
      if (processed.error === "NO_PRODUCTS_DETECTED") {
        throw new MenuImportNoProductsError(processed.details?.trim() || "NO_PRODUCTS_DETECTED");
      }
      throw new MenuImportExtractError(
        processed.details?.trim() || processed.error,
        processed.error,
      );
    }

    const draft = await getMenuImportDraft(rid, draftId);
    if (!draft) {
      throw new MenuImportExtractError(
        "El análisis terminó pero no se pudo recuperar el borrador.",
        "DRAFT_NOT_FOUND_AFTER_PROCESS",
      );
    }

    if (draft.items.length === 0) {
      throw new MenuImportNoProductsError("NO_PRODUCTS_DETECTED");
    }

    const rows = mapAiMenuItemsToExtractedRows(toOnboardingDetectedItems(draft.items), rid);
    if (rows.length === 0) {
      throw new MenuImportNoProductsError("NO_PRODUCTS_DETECTED");
    }

    return {
      rows,
      ocrTextLength: typeof draft.rawText === "string" ? draft.rawText.length : undefined,
      draftId,
    };
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
  draftId?: string;
  rowCount: number;
  ocrTextLength?: number;
  status: "processed" | "no_products";
};

/**
 * Procesa varias fotos/páginas como un solo lote lógico sin mezclar el aislamiento de drafts.
 * Cada archivo recorre Menu Import V2 por separado y el resultado se une después, conservando
 * el orden de páginas y eliminando únicamente duplicados claros nombre+precio.
 *
 * Los errores técnicos siguen siendo bloqueantes. Una página sin productos claros no cancela
 * el resto del lote: queda registrada como `no_products` para revisión de UX/diagnóstico.
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
  if (normalizedFiles.length > 12) {
    throw new MenuImportExtractError(
      "Puedes importar un máximo de 12 páginas por lote.",
      "MENU_IMPORT_BATCH_TOO_LARGE",
    );
  }
  if (normalizedFiles.length === 1) {
    const single = await extractMenuFromUpload(normalizedFiles[0]);
    return {
      rows: single.rows,
      pages: [
        {
          fileName: normalizedFiles[0].name,
          draftId: single.draftId,
          rowCount: single.rows.length,
          ocrTextLength: single.ocrTextLength,
          status: "processed",
        },
      ],
      draftIds: single.draftId ? [single.draftId] : [],
      ocrTextLength: single.ocrTextLength ?? 0,
    };
  }

  const pageRows: ExtractedMenuRow[][] = [];
  const pages: MenuImportBatchPageResult[] = [];
  const draftIds: string[] = [];
  let totalOcrTextLength = 0;

  for (const file of normalizedFiles) {
    try {
      const page = await extractMenuFromUpload(file);
      pageRows.push(page.rows);
      if (page.draftId) draftIds.push(page.draftId);
      totalOcrTextLength += page.ocrTextLength ?? 0;
      pages.push({
        fileName: file.name,
        draftId: page.draftId,
        rowCount: page.rows.length,
        ocrTextLength: page.ocrTextLength,
        status: "processed",
      });
    } catch (error) {
      if (error instanceof MenuImportNoProductsError) {
        pageRows.push([]);
        pages.push({
          fileName: file.name,
          rowCount: 0,
          status: "no_products",
        });
        continue;
      }
      throw error;
    }
  }

  const rows = mergeMenuImportBatchRows(pageRows);
  if (rows.length === 0) {
    throw new MenuImportNoProductsError("NO_PRODUCTS_DETECTED");
  }

  return {
    rows,
    pages,
    draftIds,
    ocrTextLength: totalOcrTextLength,
  };
}
