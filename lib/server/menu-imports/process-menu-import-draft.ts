import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { MenuImportDraftDocument } from "@/lib/firestore/menu-import-drafts";
import { truncateRawTextForStorage } from "./download-storage-file";
import { enrichMenuItemsWithAI } from "./enrich-menu-items-with-ai";
import { extractMenuText } from "./extract-menu-text";
import {
  filterItemsByOcrSource,
  logOcrValidationDiagnostics,
} from "./validate-items-against-ocr";
import { loadHostlyCategoryNames } from "./load-hostly-categories";
import {
  getMenuImportDraftAdmin,
  updateMenuImportDraftAdmin,
} from "./menu-import-draft-admin";
import { groupParsedItemsIntoSections, parseMenuText } from "./parse-menu-text";

const ANALYZING_STALE_MS = 2 * 60 * 1000;

export class ProcessMenuImportDraftError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "ProcessMenuImportDraftError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type ProcessMenuImportDraftResult = {
  draftId: string;
  status: MenuImportDraftDocument["status"];
  alreadyProcessed: boolean;
  itemCount: number;
};

/**
 * Procesa un borrador: OCR → parser heurístico → enriquecimiento IA estructurado.
 */
export async function processMenuImportDraft(params: {
  db: Firestore;
  restaurantId: string;
  draftId: string;
  userId: string;
}): Promise<ProcessMenuImportDraftResult> {
  const { db, restaurantId, userId } = params;
  const draftId = params.draftId.trim();
  if (!draftId) {
    throw new ProcessMenuImportDraftError("INVALID_DRAFT_ID", "draftId obligatorio", 400);
  }

  const draft = await getMenuImportDraftAdmin(db, restaurantId, draftId);
  if (!draft) {
    throw new ProcessMenuImportDraftError("DRAFT_NOT_FOUND", "Borrador no encontrado", 404);
  }

  if (draft.restaurantId !== restaurantId.trim()) {
    throw new ProcessMenuImportDraftError("TENANT_MISMATCH", "Borrador fuera del tenant", 403);
  }

  if (draft.status === "ready" || draft.status === "published") {
    return {
      draftId,
      status: draft.status,
      alreadyProcessed: true,
      itemCount: draft.items.length,
    };
  }

  if (draft.status === "analyzing") {
    const ageMs = Date.now() - draft.updatedAt;
    if (ageMs < ANALYZING_STALE_MS) {
      throw new ProcessMenuImportDraftError(
        "ANALYZING_IN_PROGRESS",
        "El borrador ya se está procesando. Espera unos segundos.",
        409,
      );
    }
  }

  if (draft.sourceType === "qr_url") {
    if (!draft.sourceUrl?.trim()) {
      throw new ProcessMenuImportDraftError(
        "MISSING_SOURCE_URL",
        "Falta URL del menú QR en el borrador",
        400,
      );
    }
  } else if (!draft.storagePath?.trim()) {
    throw new ProcessMenuImportDraftError(
      "MISSING_STORAGE_PATH",
      "Falta archivo subido en Storage para este borrador",
      400,
    );
  }

  await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
    status: "analyzing",
    errorMessage: FieldValue.delete(),
    parserWarnings: FieldValue.delete(),
    aiWarnings: FieldValue.delete(),
    updatedBy: userId,
  });

  try {
    const extracted = await extractMenuText({
      sourceType: draft.sourceType,
      menuType: draft.menuType,
      storagePath: draft.storagePath,
      sourceUrl: draft.sourceUrl,
      originalFileName: draft.originalFileName,
    });

    const parsed = parseMenuText(extracted.rawText, {
      sourceType: draft.sourceType,
      menuType: draft.menuType,
    });

    const parserWarnings = [...extracted.warnings, ...parsed.warnings];
    const knownCategories = await loadHostlyCategoryNames(db, restaurantId);

    const enriched = await enrichMenuItemsWithAI({
      rawText: extracted.rawText,
      items: parsed.items,
      menuType: draft.menuType,
      knownCategories,
      parserWarnings,
    });

    const wrapped = enriched.items.map((item) => ({ name: item.name, item }));
    const ocrValidated = filterItemsByOcrSource(wrapped, extracted.rawText);
    const finalItems = ocrValidated.accepted.map((row) => row.item);

    logOcrValidationDiagnostics(
      {
        ocrTextLength: ocrValidated.ocrTextLength,
        aiReturnedCount: enriched.items.length,
        acceptedCount: finalItems.length,
        rejectedCount: ocrValidated.rejected.length,
        acceptedNames: finalItems.map((i) => i.name),
        rejectedNames: ocrValidated.rejected.map((i) => i.name),
      },
      "process-menu-import-draft",
    );

    if (finalItems.length === 0) {
      throw new ProcessMenuImportDraftError(
        "NO_PRODUCTS_DETECTED",
        "No hemos podido detectar productos claros en esta carta. Sube una imagen más nítida o crea productos manualmente.",
        422,
      );
    }

    const sections = groupParsedItemsIntoSections(finalItems);
    const { text: rawTextStored, truncated } = truncateRawTextForStorage(extracted.rawText);

    if (truncated) {
      parserWarnings.push("rawText truncado por límite de almacenamiento");
    }

    const aiWarnings = enriched.aiWarnings;
    if (!enriched.enriched && aiWarnings.length > 0) {
      parserWarnings.push(...aiWarnings);
    }

    await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
      status: "ready",
      rawText: rawTextStored,
      sections,
      items: finalItems,
      parserWarnings: parserWarnings.length > 0 ? parserWarnings : FieldValue.delete(),
      aiWarnings: enriched.enriched && aiWarnings.length > 0 ? aiWarnings : FieldValue.delete(),
      errorMessage: FieldValue.delete(),
      updatedBy: userId,
    });

    return {
      draftId,
      status: "ready",
      alreadyProcessed: false,
      itemCount: finalItems.length,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al procesar la carta";
    await updateMenuImportDraftAdmin(db, restaurantId, draftId, {
      status: "failed",
      errorMessage: message,
      updatedBy: userId,
    }).catch(() => {
      /* secondary failure */
    });
    throw new ProcessMenuImportDraftError("PROCESS_FAILED", message, 500);
  }
}
