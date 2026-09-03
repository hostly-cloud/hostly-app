import fs from "node:fs";
import path from "node:path";
import type { OcrLayoutLine } from "../lib/server/menu-imports/menu-import-ocr-layout-types";
import { parseVisualMenuLayout } from "../lib/server/menu-imports/visual-menu-layout-parser";

function medianLineHeight(lines: OcrLayoutLine[]) {
  const hs = lines.map((l) => l.box.height).sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)] ?? 16;
}

const layoutPath = path.join(
  process.cwd(),
  "test-corpus/cases/segundos-platos-real/input/ocr-layout.json",
);
const bundle = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
const lines = bundle.lines as OcrLayoutLine[];
const lh = medianLineHeight(lines);
const blockBand = lh * 3.8;
const price2250 = lines.find((l) => l.text === "22,50");
const muslo = lines.find((l) => l.text.startsWith("Muslo deshuesado"));
if (price2250 && muslo) {
  const bandTop = price2250.box.centerY - blockBand * 0.35;
  const bandBottom = price2250.box.centerY + blockBand * 0.85;
  console.log({ lh, blockBand, bandTop, bandBottom, musloY: muslo.box.centerY, inBand: muslo.box.centerY >= bandTop && muslo.box.centerY <= bandBottom });
}

const diag = parseVisualMenuLayout(lines, bundle.pageWidth, bundle.pageHeight);

for (const b of diag.visualBlocks) {
  const idx = bundle.lines
    .filter((l: { text: string }) => b.rawLines.includes(l.text))
    .map((l: { lineIndex: number }) => l.lineIndex);
  console.log(`--- ${b.price} | ${b.nameLine}`);
  console.log(`    raw: ${b.rawName}`);
  console.log(`    match: ${b.matchSource} y=${b.anchorY} idx=${idx.join(",")}`);
}

console.log("\nunpaired prices:", diag.unpairedPriceLines);
console.log("unpaired text sample:", diag.unpairedTextLines.slice(0, 15));
console.log("recovered:", diag.recoveredVisualBlocksCount);
