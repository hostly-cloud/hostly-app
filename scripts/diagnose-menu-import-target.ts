/**
 * Diagnóstico read-only del pipeline IA para un borrador por nombre de archivo.
 * Uso: npx tsx scripts/diagnose-menu-import-target.ts [fileNameFragment]
 */
import fs from "node:fs";
import path from "node:path";
import type { ImportedMenuItem } from "../lib/carta/imported-menu-types";

const MENU_IMPORT_DRAFTS_SUBCOLLECTION = "menuImportDrafts";

function loadEnv() {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const envPath = path.join(repoRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }
}

function firstLines(text: string, n = 12): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, n);
}

function hasPizzaKeywords(text: string): string[] {
  const t = text.toLowerCase();
  const keys = [
    "pizze",
    "margherita",
    "marinara",
    "capricciosa",
    "calzone",
    "parma",
    "formaggi",
    "gourmet",
    "clasico",
    "tonno",
    "vegana",
  ];
  return keys.filter((k) => t.includes(k));
}

function samplePrices(text: string): string[] {
  return (text.match(/\d{1,3}[.,]\d{2}/g) || []).slice(0, 10);
}

function summarizeItem(item: ImportedMenuItem) {
  return {
    name: item.name,
    price: item.price ?? null,
    section: item.sectionName ?? null,
    confidence: item.confidence,
  };
}

async function main() {
  loadEnv();
  const targetFragment = (process.argv[2] || "1000121329.jpg").toLowerCase();

  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const { getMenuImportDraftAdmin } = await import("../lib/server/menu-imports/menu-import-draft-admin");
  const { extractMenuText } = await import("../lib/server/menu-imports/extract-menu-text");
  const { normalizeMenuImportOcrText, parseMenuText } = await import("../lib/server/menu-imports/parse-menu-text");
  const { enrichMenuItemsWithAI } = await import("../lib/server/menu-imports/enrich-menu-items-with-ai");
  const {
    explainOcrValidationDecision,
    filterItemsByOcrSource,
    MIN_OCR_SOURCE_TEXT_LENGTH,
  } = await import("../lib/server/menu-imports/validate-items-against-ocr");
  const { loadHostlyCategoryNames } = await import("../lib/server/menu-imports/load-hostly-categories");

  const db = getHostlyFirestore();
  if (!db) throw new Error("Firestore Admin no configurado");

  const restaurantsSnap = await db.collectionGroup(MENU_IMPORT_DRAFTS_SUBCOLLECTION).get();
  const matches: Array<{
    draftId: string;
    restaurantId: string;
    fileName: string | null;
    status: unknown;
    itemsLength: number;
    sectionsLength: number;
    errorMessage: string | null;
    storagePath: string | null;
  }> = [];

  for (const doc of restaurantsSnap.docs) {
    const data = doc.data();
    const fileName = String(data.originalFileName || "").toLowerCase();
    if (fileName.includes(targetFragment)) {
      matches.push({
        draftId: doc.id,
        restaurantId: doc.ref.parent.parent?.id || "",
        fileName: typeof data.originalFileName === "string" ? data.originalFileName : null,
        status: data.status ?? null,
        itemsLength: Array.isArray(data.items) ? data.items.length : 0,
        sectionsLength: Array.isArray(data.sections) ? data.sections.length : 0,
        errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : null,
        storagePath: typeof data.storagePath === "string" ? data.storagePath : null,
      });
    }
  }

  if (matches.length === 0) {
    console.log(JSON.stringify({ ok: false, error: "No draft found for target", target: targetFragment }, null, 2));
    process.exit(1);
  }

  const pick = matches[0];
  const draft = await getMenuImportDraftAdmin(db, pick.restaurantId, pick.draftId);
  if (!draft) throw new Error("Draft not readable");

  const report: Record<string, unknown> = {
    target: targetFragment,
    draftMatches: matches,
    draftBefore: pick,
    stages: {} as Record<string, unknown>,
  };

  try {
    const extracted = await extractMenuText({
      sourceType: draft.sourceType,
      menuType: draft.menuType,
      storagePath: draft.storagePath,
      sourceUrl: draft.sourceUrl,
      originalFileName: draft.originalFileName,
    });

    const cleaned = normalizeMenuImportOcrText(extracted.rawText);
    const stages = report.stages as Record<string, unknown>;

    stages.ocrRaw = {
      result: extracted.rawText.trim().length > 0 ? "OK" : "FALLA",
      length: extracted.rawText.length,
      warnings: extracted.warnings,
      firstLines: firstLines(extracted.rawText, 15),
      pizzaKeywordsFound: hasPizzaKeywords(extracted.rawText),
      samplePrices: samplePrices(extracted.rawText),
    };

    stages.textCleaned = {
      result: cleaned.length > 0 ? "OK" : "FALLA",
      length: cleaned.length,
      firstLines: firstLines(cleaned, 15),
      pizzaKeywordsFound: hasPizzaKeywords(cleaned),
      samplePrices: samplePrices(cleaned),
      preview: cleaned.slice(0, 1200),
    };

    const parsed = parseMenuText(extracted.rawText, {
      sourceType: draft.sourceType,
      menuType: draft.menuType,
    });
    stages.parser = {
      result: parsed.items.length > 0 ? "OK" : "FALLA",
      count: parsed.items.length,
      warnings: parsed.warnings,
      first10: parsed.items.slice(0, 10).map(summarizeItem),
      allNames: parsed.items.map((i) => i.name),
    };

    const knownCategories = await loadHostlyCategoryNames(db, pick.restaurantId);
    const enriched = await enrichMenuItemsWithAI({
      rawText: extracted.rawText,
      items: parsed.items,
      menuType: draft.menuType,
      knownCategories,
      parserWarnings: [...extracted.warnings, ...parsed.warnings],
    });
    stages.aiEnrichment = {
      result: enriched.items.length > 0 ? "OK" : parsed.items.length === 0 ? "NO EJECUTA" : "OK",
      before: parsed.items.length,
      after: enriched.items.length,
      enriched: enriched.enriched,
      discarded: Math.max(0, parsed.items.length - enriched.items.length),
      aiWarnings: enriched.aiWarnings,
      first10: enriched.items.slice(0, 10).map(summarizeItem),
    };

    const wrapped = enriched.items.map((item) => ({ name: item.name, item }));
    const ocrValidated = filterItemsByOcrSource(wrapped, extracted.rawText);
    const rejections = ocrValidated.rejected.map((row) => ({
      name: row.name,
      ...explainOcrValidationDecision(row.name, extracted.rawText),
    }));
    stages.ocrValidation = {
      result:
        ocrValidated.accepted.length > 0
          ? ocrValidated.rejected.length > 0
            ? "PARCIAL"
            : "OK"
          : enriched.items.length === 0
            ? "NO EJECUTA"
            : "FALLA",
      minOcrLength: MIN_OCR_SOURCE_TEXT_LENGTH,
      ocrTextLength: ocrValidated.ocrTextLength,
      acceptedCount: ocrValidated.accepted.length,
      rejectedCount: ocrValidated.rejected.length,
      acceptedFirst10: ocrValidated.accepted.slice(0, 10).map((r) => summarizeItem(r.item)),
      rejectedFirst10: rejections.slice(0, 15),
      allRejected: rejections,
    };

    const finalCount = ocrValidated.accepted.length;
    stages.save = {
      result: finalCount > 0 ? "OK (simulado)" : "FAILED",
      wouldSaveItems: finalCount,
      wouldSaveSections:
        finalCount > 0
          ? new Set(ocrValidated.accepted.map((r) => r.item.sectionName || "General")).size
          : 0,
      wouldSetStatus: finalCount > 0 ? "ready" : "failed",
      errorMessage:
        finalCount > 0 ? null : "No hemos podido detectar productos claros en esta carta.",
      currentDraftInFirestore: {
        status: pick.status,
        itemsLength: pick.itemsLength,
        sectionsLength: pick.sectionsLength,
        errorMessage: pick.errorMessage,
      },
    };

    report.summaryTable = [
      ["ETAPA", "RESULTADO", "CONTEO", "OBSERVACIÓN"],
      [
        "OCR bruto",
        (stages.ocrRaw as { result: string }).result,
        String((stages.ocrRaw as { length: number }).length),
        ((stages.ocrRaw as { pizzaKeywordsFound: string[] }).pizzaKeywordsFound.join(", ") ||
          "sin keywords pizza") +
          "; precios: " +
          ((stages.ocrRaw as { samplePrices: string[] }).samplePrices.join(", ") || "ninguno"),
      ],
      [
        "Texto limpio",
        (stages.textCleaned as { result: string }).result,
        String((stages.textCleaned as { length: number }).length),
        (stages.textCleaned as { pizzaKeywordsFound: string[] }).pizzaKeywordsFound.join(", ") || "sin keywords",
      ],
      [
        "Parser",
        (stages.parser as { result: string }).result,
        String((stages.parser as { count: number }).count),
        (stages.parser as { warnings: string[] }).warnings.join("; ") || "—",
      ],
      [
        "IA",
        (stages.aiEnrichment as { result: string }).result,
        String((stages.aiEnrichment as { after: number }).after),
        (stages.aiEnrichment as { enriched: boolean }).enriched
          ? "enriched"
          : (stages.aiEnrichment as { aiWarnings: string[] }).aiWarnings[0] || "fallback parser",
      ],
      [
        "Validación OCR",
        (stages.ocrValidation as { result: string }).result,
        `${ocrValidated.accepted.length} ok / ${ocrValidated.rejected.length} rech`,
        rejections[0]?.reason || "—",
      ],
      [
        "Guardado",
        (stages.save as { result: string }).result,
        String((stages.save as { wouldSaveItems: number }).wouldSaveItems),
        String((stages.save as { errorMessage: string | null }).errorMessage || "—"),
      ],
    ];

    report.resumen = {
      fileName: pick.fileName,
      draftId: pick.draftId,
      restaurantId: pick.restaurantId,
      ocrRawChars: (stages.ocrRaw as { length: number }).length,
      ocrCleanedChars: (stages.textCleaned as { length: number }).length,
      parserProducts: (stages.parser as { count: number }).count,
      afterAiProducts: (stages.aiEnrichment as { after: number }).after,
      afterOcrValidation: (stages.ocrValidation as { acceptedCount: number }).acceptedCount,
      draftSaveProducts: (stages.save as { wouldSaveItems: number }).wouldSaveItems,
      finalStatus: (stages.save as { wouldSetStatus: string }).wouldSetStatus,
      failureMessage: (stages.save as { errorMessage: string | null }).errorMessage,
      probableFailureStage:
        (stages.parser as { count: number }).count === 0
          ? "parser"
          : (stages.ocrValidation as { acceptedCount: number }).acceptedCount === 0
            ? "ocr_validation"
            : "none",
    };
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
});
