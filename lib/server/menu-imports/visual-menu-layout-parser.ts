import type {
  OcrLayoutLine,
  VisualMenuLayoutDiagnostics,
  VisualMenuProductBlock,
  VisualProductMatchSource,
} from "./menu-import-ocr-layout-types";import {
  isDescriptiveMenuImportSectionName,
  looksLikeMenuSectionHeaderText,
  resolveMenuImportSectionName,
} from "./normalize-menu-import-section";
import {
  isRejectedVisualPrimaryFragment,
  normalizeVisualCommercialName,
  resolvePreferredProductNameFromVisualBlock,
} from "./visual-menu-commercial-name";

const PRICE_LINE_RE = /^(\d{1,3}[.,]\d{1,2})\s*(?:€|eur)?\s*$/i;
const PRICE_EURO_RE = /^(?:€|eur)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*$/i;
const NOISE_LINE_RE =
  /\b(iv[aá]|iva incluido|suplemento|al[eé]rgeno|horario|reservas?|tel[eé]fono|www\.|https?:\/\/)\b/i;
const SECTION_UPPER_RE = /^[A-ZÁÉÍÓÚÑ0-9\s&'/-]{4,48}$/;

function parsePriceToken(raw: string): number | null {
  const t = raw.replace(",", ".").trim();
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 999) return null;
  return Math.round(n * 100) / 100;
}

function parsePriceFromLine(text: string): number | null {
  const t = text.trim();
  const m1 = t.match(PRICE_LINE_RE);
  if (m1?.[1]) return parsePriceToken(m1[1]);
  const m2 = t.match(PRICE_EURO_RE);
  if (m2?.[1]) return parsePriceToken(m2[1]);
  const m3 = t.match(/^(\d{1,3}[.,]\d{2})\s*(?:€|eur)?\s*$/i);
  if (m3?.[1]) return parsePriceToken(m3[1]);
  return null;
}

function isPriceLine(line: OcrLayoutLine): boolean {
  return parsePriceFromLine(line.text) != null;
}

function isTrilingualSectionHeaderText(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 140 || parsePriceFromLine(t) != null) return false;
  if (/\/\//.test(t)) return false;
  if (isDescriptiveMenuImportSectionName(t)) return false;
  const segments = t.split(/\s*[-–—|]\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2 || segments.length > 4) return false;
  if (segments.some((s) => isDescriptiveMenuImportSectionName(s))) return false;
  if (!looksLikeMenuSectionHeaderText(segments[0]!)) return false;
  return segments.every((s) => s.length >= 3 && s.length <= 58);
}

function isSectionHeaderLine(line: OcrLayoutLine): boolean {
  const t = line.text.trim();
  if (!t || t.length > 140) return false;
  if (NOISE_LINE_RE.test(t)) return false;
  if (parsePriceFromLine(t) != null) return false;
  if (/\/\//.test(t)) return false;
  if (isDescriptiveMenuImportSectionName(t)) return false;
  if (isTrilingualSectionHeaderText(t)) return true;
  if (/[:：]$/.test(t)) return true;
  if (SECTION_UPPER_RE.test(t) && t === t.toUpperCase()) return true;
  if (/\b(pasta|risott[oi]|pizze|entrantes|postres|bebidas?|segundos?|platos?)\b/i.test(t) && t.length <= 48) {
    return true;
  }
  return false;
}

function isNoiseLine(line: OcrLayoutLine): boolean {
  return NOISE_LINE_RE.test(line.text) || line.text.trim().length < 2;
}

function computeColumnSplitX(lines: OcrLayoutLine[], pageWidth: number): number {
  if (lines.length === 0) return pageWidth * 0.62;
  const priceLines = lines.filter(isPriceLine);
  if (priceLines.length >= 2) {
    const xs = priceLines.map((l) => l.box.centerX).sort((a, b) => a - b);
    const median = xs[Math.floor(xs.length / 2)] ?? pageWidth * 0.75;
    return median - 20;
  }
  return pageWidth * 0.58;
}

function medianLineHeight(lines: OcrLayoutLine[]): number {
  if (lines.length === 0) return 16;
  const hs = lines.map((l) => l.box.height).sort((a, b) => a - b);
  return hs[Math.floor(hs.length / 2)] ?? 16;
}

/** Palabras que no son nombres de producto en cartas (traducciones, conectores, secciones). */
const VISUAL_NAME_STOPWORDS = new Set([
  "with",
  "mit",
  "and",
  "con",
  "menu",
  "pasta",
  "pizza",
  "pizze",
  "de",
  "la",
  "el",
  "le",
  "les",
  "the",
  "und",
  "et",
  "ou",
  "or",
  "for",
  "per",
  "sin",
  "puis",
  "avec",
  "eur",
  "iva",
  "tel",
  "www",
  "gourmet",
  "clasico",
  "classico",
  "risotto",
  "risotti",
  "entrantes",
  "postres",
  "bebidas",
  "bebida",
]);

const VISUAL_TRANSLATION_LINE_RE =
  /^(with|mit|avec|con|de|la|el|the|und|and|or|for|puis|per|sin|served|serviert|servido|pork|baked|grilled|fillet|gebackenes|chops in|king prawns)\b/i;

const SPANISH_DISH_PREFIX_RE =
  /^(langostinos|chuletas|escalopes?|escalopines|filete|solomillo|muslo|estofado)\b/i;

const EN_DE_ROW_LEADER_RE =
  /^(gratinated|gratinierte|lamb|pork|baked|grilled|beef|king|riesengarnelen|schwein|gebackenes|freerange|freiland|gegrilltes|bourguignon|national)\b/i;

function isVisualLeftoverTranslationText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (isVisualTranslationLine(t)) return true;
  if (EN_DE_ROW_LEADER_RE.test(t)) return true;
  if (/^(with|mit)\b/i.test(t)) return true;
  if (isDescriptiveMenuImportSectionName(t)) return true;
  if (/\/\//.test(t)) return true;
  if (/\b(serviert mit|served with|bourguignon|boeuf|rindereintopf)\b/i.test(t)) return true;
  return false;
}

const VISUAL_FRAGMENT_START_RE =
  /^(con|de|del|with|mit|served|serviert|servido|pork|baked|grilled|fillet|gebackenes|\/\/)\b/i;

const VISUAL_SINGLE_WORD_NAME_RE = /^[A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ'-]*$/;

function isVisualTranslationLine(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (VISUAL_TRANSLATION_LINE_RE.test(t)) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1 && VISUAL_NAME_STOPWORDS.has(words[0]!.toLowerCase())) return true;
  if (words.length <= 3 && words.every((w) => VISUAL_NAME_STOPWORDS.has(w.toLowerCase()))) return true;
  return false;
}

/** Validación estricta legacy (multi-palabra / descripción larga). */
function isValidPrimaryProductName(text: string): boolean {
  const t = text.trim();
  if (t.length < 10) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 && t.length < 16) return false;
  if (/^(puis|with|mit|avec|de|la|el|con)\b/i.test(t) && words.length <= 3) return false;
  return /[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}/.test(t);
}

/**
 * Validación para parser visual: acepta nombres de una palabra cuando hay precio emparejado
 * (se invoca solo dentro del bucle nombre↔precio por banda vertical).
 */
function isValidVisualPrimaryProductName(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 120) return false;
  if (parsePriceFromLine(t) != null) return false;
  if (/^[€$£]$/.test(t)) return false;
  if (NOISE_LINE_RE.test(t)) return false;
  if (VISUAL_FRAGMENT_START_RE.test(t)) return false;
  if (isRejectedVisualPrimaryFragment(t)) return false;
  if (isVisualTranslationLine(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    const word = words[0]!;
    if (word.length < 4 || word.length > 32) return false;
    if (/^\d+$/.test(word)) return false;
    if (VISUAL_NAME_STOPWORDS.has(word.toLowerCase())) return false;
    if (!VISUAL_SINGLE_WORD_NAME_RE.test(word)) return false;
    if (word === word.toUpperCase() && word.length <= 10 && SECTION_UPPER_RE.test(word)) return false;
    return true;
  }

  return isValidPrimaryProductName(t);
}

/**
 * Vision suele partir el nombre en dos columnas: "Langostinos" + "gratinados, servidos…".
 */
function mergeBlockLeftSplitNames(blockLeft: OcrLayoutLine[], lineHeight: number): OcrLayoutLine[] {
  if (blockLeft.length < 2) return blockLeft;

  const yThreshold = Math.max(lineHeight * 1.2, 48);
  const sorted = [...blockLeft].sort(
    (a, b) => a.box.centerY - b.box.centerY || a.box.centerX - b.box.centerX,
  );

  const rows: OcrLayoutLine[][] = [];
  for (const line of sorted) {
    const row = rows.find((r) => Math.abs(r[0]!.box.centerY - line.box.centerY) <= yThreshold);
    if (row) row.push(line);
    else rows.push([line]);
  }

  const merged: OcrLayoutLine[] = [];
  const consumed = new Set<number>();

  for (const row of rows) {
    row.sort((a, b) => a.box.centerX - b.box.centerX);
    let i = 0;
    while (i < row.length) {
      const cur = row[i]!;
      if (consumed.has(cur.lineIndex)) {
        i += 1;
        continue;
      }

      const curText = cur.text.trim();
      const isPrefix =
        SPANISH_DISH_PREFIX_RE.test(curText) &&
        curText.split(/\s+/).length === 1 &&
        i + 1 < row.length;

      if (isPrefix) {
        const parts = [curText];
        let j = i + 1;
        while (j < row.length) {
          const next = row[j]!;
          const nextText = next.text.trim();
          if (EN_DE_ROW_LEADER_RE.test(nextText)) break;
          parts.push(nextText);
          consumed.add(next.lineIndex);
          j += 1;
          if (nextText.split(/\s+/).length >= 4 || nextText.length >= 40) break;
        }
        if (parts.length > 1) {
          merged.push({ ...cur, text: parts.join(" ") });
          consumed.add(cur.lineIndex);
          i = j;
          continue;
        }
      }

      merged.push(cur);
      consumed.add(cur.lineIndex);
      i += 1;
    }
  }

  for (const line of blockLeft) {
    if (!consumed.has(line.lineIndex)) merged.push(line);
  }

  return merged;
}

function pickVisualPrimaryLine(blockLeft: OcrLayoutLine[], lineHeight: number): OcrLayoutLine | null {
  if (blockLeft.length === 0) return null;

  const mergedBlock = mergeBlockLeftSplitNames(blockLeft, lineHeight);
  const resolution = resolvePreferredProductNameFromVisualBlock(mergedBlock.map((l) => l.text.trim()));
  const selectedText = (resolution.selectedLine || resolution.name).trim();
  if (!selectedText) return null;

  const exact = mergedBlock.find((l) => l.text.trim() === selectedText);
  if (exact && isValidVisualPrimaryProductName(selectedText)) return exact;

  const contains = mergedBlock.find(
    (l) =>
      selectedText.includes(l.text.trim()) ||
      l.text.trim().includes(selectedText) ||
      l.text.trim().startsWith(resolution.name.slice(0, Math.min(18, resolution.name.length))),
  );
  if (contains && isValidVisualPrimaryProductName(selectedText)) {
    return { ...contains, text: selectedText };
  }

  if (isValidVisualPrimaryProductName(selectedText)) {
    const anchor = mergedBlock[0] ?? blockLeft[0];
    if (anchor) return { ...anchor, text: selectedText };
  }

  const valid = mergedBlock.filter((l) => isValidVisualPrimaryProductName(l.text));
  if (valid.length === 0) return null;

  valid.sort((a, b) => b.text.trim().length - a.text.trim().length);
  return valid[0]!;
}

function buildVisualProductBlock(
  primary: OcrLayoutLine,
  translationLines: OcrLayoutLine[],
  priceLine: OcrLayoutLine,
  price: number,
  sectionAtLine: Map<number, string>,
  matchSource: VisualProductMatchSource,
  blockCandidateLines: string[] = [],
): VisualMenuProductBlock {
  const translationTexts = translationLines.map((t) => t.text.trim());
  const normalized = normalizeVisualCommercialName(
    primary.text.trim(),
    translationTexts,
    blockCandidateLines,
  );
  return {
    nameLine: normalized.commercialName,
    rawName: normalized.rawName,
    descriptionFromName: normalized.descriptionFromName || undefined,
    nameNormalizationReason: normalized.nameNormalizationReason,
    translationLines: translationTexts,
    priceLine: priceLine.text.trim(),
    price,
    sectionName: sectionAtLine.get(primary.lineIndex) ?? "General",
    confidence: matchSource === "fallback_match" ? 74 : 82,
    needsReview: true,
    rawLines: [primary.text, ...translationTexts, priceLine.text],
    anchorY: primary.box.centerY,
    priceAnchorY: priceLine.box.centerY,
    matchSource,
    recoveredByFallback: matchSource === "fallback_match",
  };
}

function findFallbackPriceForName(
  nameLine: OcrLayoutLine,
  priceLines: OcrLayoutLine[],
  usedPrices: Set<number>,
  maxVerticalGap: number,
): OcrLayoutLine | null {
  let best: { line: OcrLayoutLine; dy: number } | null = null;
  for (const priceLine of priceLines) {
    if (usedPrices.has(priceLine.lineIndex)) continue;
    if (priceLine.box.centerX < nameLine.box.centerX - 24) continue;
    const dy = Math.abs(priceLine.box.centerY - nameLine.box.centerY);
    if (dy > maxVerticalGap) continue;
    if (!best || dy < best.dy) {
      best = { line: priceLine, dy };
    }
  }
  return best?.line ?? null;
}

function recoverVisualBlocksFallback(
  sorted: OcrLayoutLine[],
  priceLines: OcrLayoutLine[],
  usedLeft: Set<number>,
  usedPrices: Set<number>,
  sectionAtLine: Map<number, string>,
  lineHeight: number,
  blockBand: number,
  visualBlocks: VisualMenuProductBlock[],
  discardedTranslationLines: VisualMenuLayoutDiagnostics["discardedTranslationLines"],
): number {
  const fallbackMaxDy = Math.max(lineHeight * 12, blockBand * 2.8);
  const candidates = sorted.filter(
    (line) =>
      !usedLeft.has(line.lineIndex) &&
      !isPriceLine(line) &&
      !isNoiseLine(line) &&
      !isSectionHeaderLine(line) &&
      isValidVisualPrimaryProductName(line.text),
  );

  let recovered = 0;
  for (const nameLine of candidates.sort((a, b) => a.box.centerY - b.box.centerY)) {
    if (usedLeft.has(nameLine.lineIndex)) continue;

    const priceLine = findFallbackPriceForName(nameLine, priceLines, usedPrices, fallbackMaxDy);
    if (!priceLine) continue;

    const price = parsePriceFromLine(priceLine.text);
    if (price == null) continue;

    const bandTop = nameLine.box.centerY - lineHeight * 5;
    const bandBottom = nameLine.box.centerY + lineHeight * 8;
    const nearbyLines = sorted.filter(
      (line) =>
        !usedLeft.has(line.lineIndex) &&
        line.lineIndex !== nameLine.lineIndex &&
        line.box.centerY >= bandTop &&
        line.box.centerY <= bandBottom &&
        line.box.centerX < priceLine.box.centerX - 8 &&
        !isPriceLine(line) &&
        !isNoiseLine(line) &&
        !isSectionHeaderLine(line),
    );

    const translations = nearbyLines.filter((line) => !isValidVisualPrimaryProductName(line.text));
    for (const extra of nearbyLines.filter((line) => isValidVisualPrimaryProductName(line.text))) {
      discardedTranslationLines.push({
        text: extra.text,
        lineIndex: extra.lineIndex,
        reason: "fallback_secondary_name",
      });
      usedLeft.add(extra.lineIndex);
    }

    for (const tr of translations) {
      usedLeft.add(tr.lineIndex);
      discardedTranslationLines.push({
        text: tr.text,
        lineIndex: tr.lineIndex,
        reason: "visual_translation",
      });
    }

    usedLeft.add(nameLine.lineIndex);
    usedPrices.add(priceLine.lineIndex);

    visualBlocks.push(
      buildVisualProductBlock(
        nameLine,
        translations,
        priceLine,
        price,
        sectionAtLine,
        "fallback_match",
        nearbyLines.map((line) => line.text.trim()),
      ),
    );
    recovered++;
  }

  for (const priceLine of priceLines.sort((a, b) => a.box.centerY - b.box.centerY)) {
    if (usedPrices.has(priceLine.lineIndex)) continue;
    const price = parsePriceFromLine(priceLine.text);
    if (price == null) continue;

    let bestName: OcrLayoutLine | null = null;
    let bestDy = Infinity;
    for (const line of sorted) {
      if (usedLeft.has(line.lineIndex)) continue;
      if (isPriceLine(line) || isNoiseLine(line) || isSectionHeaderLine(line)) continue;
      if (!isValidVisualPrimaryProductName(line.text)) continue;
      if (line.box.centerX >= priceLine.box.centerX - 8) continue;
      const dy = Math.abs(line.box.centerY - priceLine.box.centerY);
      if (dy > fallbackMaxDy || dy >= bestDy) continue;
      bestDy = dy;
      bestName = line;
    }
    if (!bestName) continue;

    const bandTop = bestName.box.centerY - lineHeight * 5;
    const bandBottom = bestName.box.centerY + lineHeight * 8;
    const nearbyLines = sorted.filter(
      (line) =>
        !usedLeft.has(line.lineIndex) &&
        line.lineIndex !== bestName.lineIndex &&
        line.box.centerY >= bandTop &&
        line.box.centerY <= bandBottom &&
        line.box.centerX < priceLine.box.centerX - 8 &&
        !isPriceLine(line) &&
        !isNoiseLine(line) &&
        !isSectionHeaderLine(line),
    );
    const translations = nearbyLines.filter((line) => !isValidVisualPrimaryProductName(line.text));
    for (const tr of translations) {
      usedLeft.add(tr.lineIndex);
      discardedTranslationLines.push({
        text: tr.text,
        lineIndex: tr.lineIndex,
        reason: "visual_translation",
      });
    }

    usedLeft.add(bestName.lineIndex);
    usedPrices.add(priceLine.lineIndex);
    visualBlocks.push(
      buildVisualProductBlock(
        bestName,
        translations,
        priceLine,
        price,
        sectionAtLine,
        "fallback_match",
        nearbyLines.map((line) => line.text.trim()),
      ),
    );
    recovered++;
  }

  return recovered;
}

/** * Agrupa líneas OCR con coordenadas en bloques producto (nombre + traducciones + precio).
 */
export function parseVisualMenuLayout(
  lines: OcrLayoutLine[],
  pageWidth: number,
  pageHeight: number,
): VisualMenuLayoutDiagnostics {
  const sorted = [...lines].sort((a, b) => {
    const dy = a.box.centerY - b.box.centerY;
    if (Math.abs(dy) > 1.5) return dy;
    return a.box.centerX - b.box.centerX;
  });

  const columnSplitX = computeColumnSplitX(sorted, pageWidth);
  const lineHeight = medianLineHeight(sorted);
  const blockBand = lineHeight * 3.8;

  let currentSection = "General";
  let lastValidSection = "General";
  const visualBlocks: VisualMenuProductBlock[] = [];
  const discardedTranslationLines: VisualMenuLayoutDiagnostics["discardedTranslationLines"] = [];
  const unpairedPriceLines: VisualMenuLayoutDiagnostics["unpairedPriceLines"] = [];
  const unpairedTextLines: VisualMenuLayoutDiagnostics["unpairedTextLines"] = [];

  const sectionAtLine = new Map<number, string>();
  const usedLeft = new Set<number>();
  for (const line of sorted) {
    if (isSectionHeaderLine(line)) {
      const headerText = line.text.trim();
      const candidate =
        headerText.split(/\s*[-–—|]\s*/)[0]?.replace(/[:：*]/g, "").trim() || headerText;
      if (!isDescriptiveMenuImportSectionName(candidate)) {
        currentSection = candidate;
        lastValidSection = candidate;
      }
      usedLeft.add(line.lineIndex);
    }
    sectionAtLine.set(
      line.lineIndex,
      resolveMenuImportSectionName(currentSection, lastValidSection),
    );
  }

  const leftLines = sorted.filter(
    (l) => l.box.centerX <= columnSplitX && !isPriceLine(l) && !isNoiseLine(l),
  );
  const priceLines = sorted.filter((l) => isPriceLine(l) && l.box.centerX > columnSplitX - 12);
  const usedPrices = new Set<number>();

  for (const priceLine of priceLines.sort((a, b) => a.box.centerY - b.box.centerY)) {
    if (usedPrices.has(priceLine.lineIndex)) continue;
    const price = parsePriceFromLine(priceLine.text);
    if (price == null) continue;

    const bandTop = priceLine.box.centerY - blockBand * 1.25;
    const bandBottom = priceLine.box.centerY + blockBand * 0.35;

    const blockLeft = leftLines
      .filter(
        (l) =>
          !usedLeft.has(l.lineIndex) &&
          l.box.centerY >= bandTop &&
          l.box.centerY <= bandBottom &&
          !isSectionHeaderLine(l),
      )
      .sort((a, b) => a.box.centerY - b.box.centerY);

    if (blockLeft.length === 0) {
      unpairedPriceLines.push({ text: priceLine.text, lineIndex: priceLine.lineIndex });
      continue;
    }

    const primary = pickVisualPrimaryLine(blockLeft, lineHeight);
    if (!primary || !isValidVisualPrimaryProductName(primary.text)) {
      for (const l of blockLeft) {
        unpairedTextLines.push({ text: l.text, lineIndex: l.lineIndex });
      }
      unpairedPriceLines.push({ text: priceLine.text, lineIndex: priceLine.lineIndex });
      continue;
    }

    const translations = blockLeft.filter((l) => l.lineIndex !== primary.lineIndex);

    for (const tr of translations) {
      usedLeft.add(tr.lineIndex);
      discardedTranslationLines.push({
        text: tr.text,
        lineIndex: tr.lineIndex,
        reason: "visual_translation",
      });
    }
    usedLeft.add(primary.lineIndex);
    usedPrices.add(priceLine.lineIndex);

    visualBlocks.push(
      buildVisualProductBlock(
        primary,
        translations,
        priceLine,
        price,
        sectionAtLine,
        "primary_match",
        blockLeft.map((line) => line.text.trim()),
      ),
    );
  }

  const recoveredVisualBlocksCount = recoverVisualBlocksFallback(
    sorted,
    priceLines,
    usedLeft,
    usedPrices,
    sectionAtLine,
    lineHeight,
    blockBand,
    visualBlocks,
    discardedTranslationLines,
  );

  for (const left of leftLines) {
    if (usedLeft.has(left.lineIndex)) continue;
    if (isSectionHeaderLine(left)) continue;
    if (isVisualLeftoverTranslationText(left.text)) {
      discardedTranslationLines.push({
        text: left.text,
        lineIndex: left.lineIndex,
        reason: "visual_translation",
      });
      continue;
    }
    unpairedTextLines.push({ text: left.text, lineIndex: left.lineIndex });
  }

  return {
    pageWidth,
    pageHeight,
    columnSplitX,
    medianLineHeight: lineHeight,
    ocrLinesWithCoords: sorted,
    visualBlocks,
    discardedTranslationLines,
    unpairedPriceLines,
    unpairedTextLines,
    recoveredVisualBlocksCount,
  };
}

export function visualBlocksToPlainText(blocks: VisualMenuProductBlock[]): string {
  return blocks
    .map((b) => [b.nameLine, ...b.translationLines, b.priceLine].join("\n"))
    .join("\n\n");
}

export type { VisualMenuProductBlock, VisualMenuLayoutDiagnostics };
