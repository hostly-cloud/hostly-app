/**
 * Diagnóstico read-only del pipeline IA para un borrador por nombre de archivo.
 * Uso: node scripts/diagnose-menu-import-target.mjs [fileNameFragment]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(repoRoot, ".env.local");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

process.env.NODE_ENV = "development";
const targetFragment = (process.argv[2] || "1000121329.jpg").toLowerCase();

const tsNode = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
if (!fs.existsSync(tsNode)) {
  console.error("Instala tsx: npx tsx ... o npm i -D tsx");
  process.exit(1);
}

const runner = `
async function main() {
import { getHostlyFirestore } from "../lib/firebase/admin.ts";
import { MENU_IMPORT_DRAFTS_SUBCOLLECTION } from "../lib/firestore/menu-import-drafts.ts";
import { getMenuImportDraftAdmin } from "../lib/server/menu-imports/menu-import-draft-admin.ts";
import { extractMenuText } from "../lib/server/menu-imports/extract-menu-text.ts";
import { normalizeMenuImportOcrText, parseMenuText } from "../lib/server/menu-imports/parse-menu-text.ts";
import { enrichMenuItemsWithAI } from "../lib/server/menu-imports/enrich-menu-items-with-ai.ts";
import {
  explainOcrValidationDecision,
  filterItemsByOcrSource,
  MIN_OCR_SOURCE_TEXT_LENGTH,
} from "../lib/server/menu-imports/validate-items-against-ocr.ts";
import { loadHostlyCategoryNames } from "../lib/server/menu-imports/load-hostly-categories.ts";

const TARGET = ${JSON.stringify(targetFragment)};

function firstLines(text, n = 12) {
  return text.split(/\\n+/).map((l) => l.trim()).filter(Boolean).slice(0, n);
}

function hasPizzaKeywords(text) {
  const t = text.toLowerCase();
  const keys = ["pizze", "margherita", "marinara", "capricciosa", "calzone", "parma", "formaggi", "gourmet", "clasico"];
  return keys.filter((k) => t.includes(k));
}

function hasPrices(text) {
  return (text.match(/\\d{1,3}[.,]\\d{2}/g) || []).slice(0, 10);
}

function summarizeItem(item) {
  return {
    name: item.name,
    price: item.price ?? null,
    section: item.sectionName ?? null,
    confidence: item.confidence,
  };
}

const db = getHostlyFirestore();
if (!db) throw new Error("Firestore Admin no configurado");

const restaurantsSnap = await db.collectionGroup(MENU_IMPORT_DRAFTS_SUBCOLLECTION).get();
const matches = [];
for (const doc of restaurantsSnap.docs) {
  const data = doc.data();
  const fileName = String(data.originalFileName || "").toLowerCase();
  if (fileName.includes(TARGET)) {
    matches.push({
      draftId: doc.id,
      restaurantId: doc.ref.parent.parent?.id || "",
      fileName: data.originalFileName || null,
      status: data.status || null,
      itemsLength: Array.isArray(data.items) ? data.items.length : 0,
      sectionsLength: Array.isArray(data.sections) ? data.sections.length : 0,
      errorMessage: data.errorMessage || null,
      storagePath: data.storagePath || null,
    });
  }
}

if (matches.length === 0) {
  console.log(JSON.stringify({ ok: false, error: "No draft found for target", target: TARGET }, null, 2));
  process.exit(1);
}

const pick = matches[0];
const draft = await getMenuImportDraftAdmin(db, pick.restaurantId, pick.draftId);
if (!draft) throw new Error("Draft not readable");

const report = {
  target: TARGET,
  draftBefore: pick,
  stages: {},
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
  report.stages.ocrRaw = {
    result: extracted.rawText.trim().length > 0 ? "OK" : "FALLA",
    length: extracted.rawText.length,
    warnings: extracted.warnings,
    firstLines: firstLines(extracted.rawText, 15),
    pizzaKeywordsFound: hasPizzaKeywords(extracted.rawText),
    samplePrices: hasPrices(extracted.rawText),
  };

  report.stages.textCleaned = {
    result: cleaned.length > 0 ? "OK" : "FALLA",
    length: cleaned.length,
    firstLines: firstLines(cleaned, 15),
    pizzaKeywordsFound: hasPizzaKeywords(cleaned),
    samplePrices: hasPrices(cleaned),
    preview: cleaned.slice(0, 800),
  };

  const parsed = parseMenuText(extracted.rawText, {
    sourceType: draft.sourceType,
    menuType: draft.menuType,
  });
  report.stages.parser = {
    result: parsed.items.length > 0 ? "OK" : "FALLA",
    count: parsed.items.length,
    warnings: parsed.warnings,
    first10: parsed.items.slice(0, 10).map(summarizeItem),
  };

  const knownCategories = await loadHostlyCategoryNames(db, pick.restaurantId);
  const enriched = await enrichMenuItemsWithAI({
    rawText: extracted.rawText,
    items: parsed.items,
    menuType: draft.menuType,
    knownCategories,
    parserWarnings: [...extracted.warnings, ...parsed.warnings],
  });
  report.stages.aiEnrichment = {
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
  report.stages.ocrValidation = {
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
    rejectedFirst10: rejections.slice(0, 10),
  };

  const finalCount = ocrValidated.accepted.length;
  report.stages.save = {
    result: finalCount > 0 ? "OK (simulado)" : "FAILED",
    wouldSaveItems: finalCount,
    wouldSaveSections: finalCount > 0 ? new Set(ocrValidated.accepted.map((r) => r.item.sectionName || "General")).size : 0,
    wouldSetStatus: finalCount > 0 ? "ready" : "failed",
    errorMessage: finalCount > 0 ? null : "No hemos podido detectar productos claros en esta carta.",
  };

  report.summaryTable = [
    ["OCR bruto", report.stages.ocrRaw.result, report.stages.ocrRaw.length, report.stages.ocrRaw.pizzaKeywordsFound.join(", ") || "sin keywords pizza"],
    ["Texto limpio", report.stages.textCleaned.result, report.stages.textCleaned.length, report.stages.textCleaned.pizzaKeywordsFound.join(", ") || "sin keywords"],
    ["Parser", report.stages.parser.result, report.stages.parser.count, parsed.warnings.join("; ") || "—"],
    ["IA", report.stages.aiEnrichment.result, report.stages.aiEnrichment.after, enriched.enriched ? "enriched" : enriched.aiWarnings[0] || "fallback parser"],
    ["Validación OCR", report.stages.ocrValidation.result, \`\${ocrValidated.accepted.length} ok / \${ocrValidated.rejected.length} rech\`, rejections[0]?.reason || "—"],
    ["Guardado", report.stages.save.result, report.stages.save.wouldSaveItems, report.stages.save.errorMessage || "—"],
  ];

  report.resumen = {
    fileName: pick.fileName,
    draftId: pick.draftId,
    restaurantId: pick.restaurantId,
    ocrRawChars: report.stages.ocrRaw.length,
    ocrCleanedChars: report.stages.textCleaned.length,
    parserProducts: report.stages.parser.count,
    afterAiProducts: report.stages.aiEnrichment.after,
    afterOcrValidation: report.stages.ocrValidation.acceptedCount,
    draftSaveProducts: report.stages.save.wouldSaveItems,
    finalStatus: report.stages.save.wouldSetStatus,
    failureMessage: report.stages.save.errorMessage,
    probableFailureStage:
      report.stages.parser.count === 0
        ? "parser"
        : report.stages.ocrValidation.acceptedCount === 0
          ? "ocr_validation"
          : "none",
  };
} catch (e) {
  report.error = e instanceof Error ? e.message : String(e);
  report.failedStage = report.stages.parser ? "post_parser" : report.stages.ocrRaw ? "post_ocr" : "ocr_extract";
}

console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }, null, 2));
  process.exit(1);
});
`;

const tmp = path.join(repoRoot, "scripts", ".diagnose-menu-import-target-run.ts");
fs.writeFileSync(tmp, runner, "utf8");
try {
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync(process.execPath, [tsNode, tmp], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.status ?? 1);
} finally {
  try {
    fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
}
