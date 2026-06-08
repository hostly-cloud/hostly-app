import fs from "node:fs";
import path from "node:path";
import type { OcrLayoutLine } from "../lib/server/menu-imports/menu-import-ocr-layout-types";

const PRICE_LINE_RE = /^(\d{1,3}[.,]\d{1,2})\s*(?:€|eur)?\s*$/i;
const NOISE_LINE_RE =
  /\b(iv[aá]|iva incluido|suplemento|al[eé]rgeno|horario|reservas?|tel[eé]fono|www\.|https?:\/\/)\b/i;

function parsePriceFromLine(text: string): number | null {
  const m = text.trim().match(PRICE_LINE_RE);
  if (!m?.[1]) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function isPriceLine(line: OcrLayoutLine) {
  return parsePriceFromLine(line.text) != null;
}

function isNoiseLine(line: OcrLayoutLine) {
  return NOISE_LINE_RE.test(line.text) || line.text.trim().length < 2;
}

function medianLineHeight(lines: OcrLayoutLine[]) {
  const hs = lines.map((l) => l.box.height).sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)] ?? 16;
}

function computeColumnSplitX(lines: OcrLayoutLine[], pageWidth: number) {
  const priceLines = lines.filter(isPriceLine);
  if (priceLines.length >= 2) {
    const xs = priceLines.map((l) => l.box.centerX).sort((a, b) => a - b);
    const median = xs[Math.floor(xs.length / 2)] ?? pageWidth * 0.75;
    return median - 20;
  }
  return pageWidth * 0.58;
}

const bundle = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "test-corpus/cases/segundos-platos-real/input/ocr-layout.json"),
    "utf8",
  ),
);
const lines = bundle.lines as OcrLayoutLine[];
const sorted = [...lines].sort((a, b) => a.box.centerY - b.box.centerY || a.box.centerX - b.box.centerX);
const columnSplitX = computeColumnSplitX(sorted, bundle.pageWidth);
const lineHeight = medianLineHeight(sorted);
const blockBand = lineHeight * 3.8;
const leftLines = sorted.filter((l) => l.box.centerX <= columnSplitX && !isPriceLine(l) && !isNoiseLine(l));
const usedLeft = new Set<number>();

// Simulate consuming lines from first 5 price matches (simplified: mark lines in bands)
const earlyPrices = sorted.filter(isPriceLine).sort((a, b) => a.box.centerY - b.box.centerY).slice(0, 5);
for (const priceLine of earlyPrices) {
  const bandTop = priceLine.box.centerY - blockBand * 0.35;
  const bandBottom = priceLine.box.centerY + blockBand * 0.85;
  for (const l of leftLines) {
    if (l.box.centerY >= bandTop && l.box.centerY <= bandBottom) usedLeft.add(l.lineIndex);
  }
}

const price2250 = sorted.find((l) => l.text === "22,50")!;
const bandTop = price2250.box.centerY - blockBand * 0.35;
const bandBottom = price2250.box.centerY + blockBand * 0.85;
const blockLeft = leftLines.filter(
  (l) => !usedLeft.has(l.lineIndex) && l.box.centerY >= bandTop && l.box.centerY <= bandBottom,
);

console.log({
  columnSplitX,
  blockBand,
  bandTop,
  bandBottom,
  blockLeft: blockLeft.map((l) => ({ i: l.lineIndex, t: l.text.slice(0, 60), y: l.box.centerY })),
  musloUsed: usedLeft.has(15),
});
