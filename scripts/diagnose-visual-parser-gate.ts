/**
 * Diagnóstico del gate visual_layout vs text_heuristic (read-only).
 * Uso: npx tsx scripts/diagnose-visual-parser-gate.ts [fileNameFragment]
 */
import fs from "node:fs";
import path from "node:path";

function loadEnv() {
  const repoRoot = path.resolve(import.meta.dirname, "..");
  const envPath = path.join(repoRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  }
  Object.assign(process.env, {
    NODE_ENV: "development",
    HOSTLY_MENU_IMPORT_DEBUG: "1",
  });
}

async function main() {
  loadEnv();
  const targetFragment = (process.argv[2] || "1000121329.jpg").toLowerCase();

  const { getHostlyFirestore } = await import("../lib/firebase/admin");
  const { extractMenuText } = await import("../lib/server/menu-imports/extract-menu-text");
  const { parseMenuText } = await import("../lib/server/menu-imports/parse-menu-text");

  const db = getHostlyFirestore();
  if (!db) throw new Error("Firestore Admin no configurado");

  const snap = await db.collectionGroup("menuImportDrafts").get();
  const doc = snap.docs.find((d) =>
    String(d.data().originalFileName || "")
      .toLowerCase()
      .includes(targetFragment),
  );
  if (!doc) {
    console.log(JSON.stringify({ ok: false, error: "No draft found", target: targetFragment }, null, 2));
    process.exit(1);
  }

  const d = doc.data();
  const extracted = await extractMenuText({
    sourceType: d.sourceType,
    menuType: d.menuType,
    storagePath: d.storagePath,
    sourceUrl: d.sourceUrl,
    originalFileName: d.originalFileName,
  });

  const parsed = parseMenuText(extracted.rawText, {
    sourceType: d.sourceType,
    menuType: d.menuType,
    ocrLayoutLines: extracted.ocrLayoutLines,
    ocrPageWidth: extracted.ocrPageWidth,
    ocrPageHeight: extracted.ocrPageHeight,
  });

  const diag = parsed.diagnostics;
  const { parseVisualMenuLayout } = await import("../lib/server/menu-imports/visual-menu-layout-parser");
  const visual =
    extracted.ocrLayoutLines && extracted.ocrPageWidth
      ? parseVisualMenuLayout(
          extracted.ocrLayoutLines,
          extracted.ocrPageWidth,
          extracted.ocrPageHeight ?? 0,
        )
      : null;

  const priceLike = (text: string) => /^\d{1,3}[.,]\d{1,2}\s*(?:€|eur)?\s*$/i.test(text.trim());

  console.log(
    JSON.stringify(
      {
        fileName: d.originalFileName,
        sourceType: d.sourceType,
        ocrMethod: extracted.inputMetadata?.ocrMethod,
        contentType: extracted.inputMetadata?.contentType,
        extractLayoutLinesCount: extracted.ocrLayoutLines?.length ?? 0,
        extractPageWidth: extracted.ocrPageWidth ?? null,
        extractPageHeight: extracted.ocrPageHeight ?? null,
        ocrLayoutExtraction: extracted.ocrLayoutExtractionMeta ?? null,
        parserItems: parsed.items.length,
        layoutLinesCount: diag?.layoutLinesCount ?? null,
        visualBlocksCount: diag?.visualBlocksCount ?? null,
        selectedParserMode: diag?.selectedParserMode ?? null,
        parserMode: diag?.parserMode ?? null,
        visualParserGateReason: diag?.visualParserGateReason ?? null,
        visualCandidateRejectedReason: diag?.visualCandidateRejectedReason ?? null,
        textItemsCount: diag?.textItemsCount ?? null,
        visualItemsCount: diag?.visualItemsCount ?? null,
        ocrPageWidth: diag?.ocrPageWidth ?? null,
        visualLayoutSummary: visual
          ? {
              ocrLinesWithCoords: visual.ocrLinesWithCoords.length,
              columnSplitX: Math.round(visual.columnSplitX),
              visualBlocks: visual.visualBlocks.length,
              unpairedPriceLines: visual.unpairedPriceLines.length,
              unpairedTextLines: visual.unpairedTextLines.length,
              layoutLinesPreview: visual.ocrLinesWithCoords.map((l) => ({
                text: l.text.slice(0, 80),
                centerX: Math.round(l.box.centerX),
                centerY: Math.round(l.box.centerY),
                priceLike: priceLike(l.text),
                rightOfSplit: l.box.centerX > visual.columnSplitX - 12,
              })),
            }
          : null,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
