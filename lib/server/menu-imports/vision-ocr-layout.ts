import type { OcrLayoutBox, OcrLayoutLine } from "./menu-import-ocr-layout-types";

type Vertex = { x?: number | null; y?: number | null };

type VisionWord = {
  symbols?: Array<{ text?: string | null; property?: { detectedBreak?: { type?: string | null } | null } | null }>;
  boundingBox?: { vertices?: Vertex[] | null } | null;
};

type VisionParagraph = {
  words?: VisionWord[] | null;
  boundingBox?: { vertices?: Vertex[] | null } | null;
};

type VisionBlock = {
  paragraphs?: VisionParagraph[] | null;
};

type VisionPage = {
  width?: number | null;
  height?: number | null;
  blocks?: VisionBlock[] | null;
};

export type VisionFullTextAnnotation = {
  text?: string | null;
  pages?: VisionPage[] | null;
};

export type OcrLayoutExtractionMeta = {
  method: "vision_blocks" | "global_y_cluster" | "text_fallback";
  visionBlockCount: number;
  visionParagraphCount: number;
  layoutLinesPerBlock: number[];
  sampleLinesBefore: string[];
  sampleLinesAfter: string[];
};

export type OcrLayoutExtractionResult = {
  lines: OcrLayoutLine[];
  pageWidth: number;
  pageHeight: number;
  extractionMeta: OcrLayoutExtractionMeta;
};

function verticesToBox(vertices: Vertex[]): OcrLayoutBox {
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    width,
    height,
  };
}

function wordText(word: VisionWord): string {
  return (word.symbols ?? [])
    .map((s) => {
      const ch = s.text ?? "";
      const br = s.property?.detectedBreak?.type;
      if (br === "SPACE" || br === "SURE_SPACE" || br === "EOL_SURE_SPACE") return `${ch} `;
      if (br === "LINE_BREAK") return `${ch}\n`;
      return ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphText(paragraph: VisionParagraph): string {
  const fromWords = (paragraph.words ?? []).map(wordText).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (fromWords) return fromWords;
  return "";
}

function collectWordsFromParagraph(
  paragraph: VisionParagraph,
): Array<{ text: string; box: OcrLayoutBox }> {
  const words: Array<{ text: string; box: OcrLayoutBox }> = [];
  for (const word of paragraph.words ?? []) {
    const text = wordText(word);
    const verts = word.boundingBox?.vertices;
    if (!text || !verts?.length) continue;
    words.push({ text, box: verticesToBox(verts) });
  }
  if (words.length === 0) {
    const paraText = paragraphText(paragraph);
    const paraBox = paragraph.boundingBox?.vertices?.length
      ? verticesToBox(paragraph.boundingBox.vertices)
      : null;
    if (paraText && paraBox) words.push({ text: paraText, box: paraBox });
  }
  return words;
}

function collectAllWordsFromAnnotation(
  annotation: VisionFullTextAnnotation | null | undefined,
): Array<{ text: string; box: OcrLayoutBox }> {
  const words: Array<{ text: string; box: OcrLayoutBox }> = [];
  for (const page of annotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        words.push(...collectWordsFromParagraph(paragraph));
      }
    }
  }
  return words;
}

/** Agrupa palabras por cercanía Y dentro de un mismo párrafo/bloque (nunca mezcla bloques). */
function clusterWordBoxesIntoLines(
  words: Array<{ text: string; box: OcrLayoutBox }>,
  startLineIndex = 0,
  blockIndex?: number,
  paragraphIndex?: number,
  pageIndex?: number,
): OcrLayoutLine[] {
  if (words.length === 0) return [];

  const heights = words.map((w) => w.box.height).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 12;
  const yTolerance = Math.max(8, medianHeight * 0.55);

  const sorted = [...words].sort((a, b) => {
    const dy = a.box.centerY - b.box.centerY;
    if (Math.abs(dy) > 1) return dy;
    return a.box.minX - b.box.minX;
  });

  const rows: Array<Array<{ text: string; box: OcrLayoutBox }>> = [];
  for (const word of sorted) {
    const row = rows.find((r) => Math.abs(r[0]!.box.centerY - word.box.centerY) <= yTolerance);
    if (row) row.push(word);
    else rows.push([word]);
  }

  const lines: OcrLayoutLine[] = [];
  let lineIndex = startLineIndex;
  for (const row of rows.sort((a, b) => a[0]!.box.centerY - b[0]!.box.centerY)) {
    row.sort((a, b) => a.box.minX - b.box.minX);
    const text = row.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const minX = Math.min(...row.map((w) => w.box.minX));
    const minY = Math.min(...row.map((w) => w.box.minY));
    const maxX = Math.max(...row.map((w) => w.box.maxX));
    const maxY = Math.max(...row.map((w) => w.box.maxY));
    lines.push({
      lineIndex,
      text,
      box: {
        minX,
        minY,
        maxX,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      },
      ...(blockIndex != null ? { blockIndex } : {}),
      ...(paragraphIndex != null ? { paragraphIndex } : {}),
      ...(pageIndex != null ? { pageIndex } : {}),
    });
    lineIndex++;
  }

  return lines;
}

function sampleLineTexts(lines: OcrLayoutLine[], max = 12): string[] {
  return lines.slice(0, max).map((l) => l.text.slice(0, 100));
}

function hasVisionBlockStructure(annotation: VisionFullTextAnnotation | null | undefined): boolean {
  return (annotation?.pages ?? []).some((page) => (page.blocks ?? []).length > 0);
}

/**
 * Extrae líneas OCR respetando bloques/párrafos de Google Vision (sin mezclar columnas).
 */
export function extractLayoutLinesFromVisionBlocks(
  annotation: VisionFullTextAnnotation | null | undefined,
  sampleLinesBefore: string[] = [],
): OcrLayoutExtractionResult {
  const pages = annotation?.pages ?? [];
  const pageWidth = pages[0]?.width ?? 0;
  const pageHeight = pages[0]?.height ?? 0;

  const lines: OcrLayoutLine[] = [];
  const layoutLinesPerBlock: number[] = [];
  let globalLineIndex = 0;
  let visionBlockCount = 0;
  let visionParagraphCount = 0;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex]!;
    for (let blockIndex = 0; blockIndex < (page.blocks ?? []).length; blockIndex++) {
      const block = page.blocks![blockIndex]!;
      visionBlockCount++;
      let blockLineCount = 0;

      for (let paragraphIndex = 0; paragraphIndex < (block.paragraphs ?? []).length; paragraphIndex++) {
        const paragraph = block.paragraphs![paragraphIndex]!;
        visionParagraphCount++;
        const paraWords = collectWordsFromParagraph(paragraph);
        const paraLines = clusterWordBoxesIntoLines(
          paraWords,
          globalLineIndex,
          blockIndex,
          paragraphIndex,
          pageIndex,
        );
        for (const line of paraLines) {
          lines.push(line);
          globalLineIndex++;
          blockLineCount++;
        }
      }

      layoutLinesPerBlock.push(blockLineCount);
    }
  }

  return {
    lines,
    pageWidth: pageWidth || Math.max(...lines.map((l) => l.box.maxX), 1),
    pageHeight: pageHeight || Math.max(...lines.map((l) => l.box.maxY), 1),
    extractionMeta: {
      method: "vision_blocks",
      visionBlockCount,
      visionParagraphCount,
      layoutLinesPerBlock,
      sampleLinesBefore,
      sampleLinesAfter: sampleLineTexts(lines),
    },
  };
}

function extractLayoutLinesGlobalFallback(
  annotation: VisionFullTextAnnotation | null | undefined,
  words: Array<{ text: string; box: OcrLayoutBox }>,
  pageWidth: number,
  pageHeight: number,
): OcrLayoutExtractionResult {
  const beforeLines = clusterWordBoxesIntoLines(words);
  const lines = beforeLines.map((line, index) => ({ ...line, lineIndex: index }));
  return {
    lines,
    pageWidth: pageWidth || Math.max(...words.map((w) => w.box.maxX), 1),
    pageHeight: pageHeight || Math.max(...words.map((w) => w.box.maxY), 1),
    extractionMeta: {
      method: "global_y_cluster",
      visionBlockCount: 0,
      visionParagraphCount: 0,
      layoutLinesPerBlock: [],
      sampleLinesBefore: sampleLineTexts(beforeLines),
      sampleLinesAfter: sampleLineTexts(lines),
    },
  };
}

function extractLayoutLinesTextFallback(
  annotation: VisionFullTextAnnotation | null | undefined,
  pageWidth: number,
  pageHeight: number,
): OcrLayoutExtractionResult {
  const text = annotation?.text ?? "";
  const lines = text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((lineText, lineIndex) => ({
      lineIndex,
      text: lineText,
      box: {
        minX: 0,
        minY: lineIndex * 20,
        maxX: pageWidth || 1000,
        maxY: (lineIndex + 1) * 20,
        centerX: (pageWidth || 1000) / 3,
        centerY: lineIndex * 20 + 10,
        width: pageWidth || 1000,
        height: 20,
      },
    }));

  return {
    lines,
    pageWidth: pageWidth || 1000,
    pageHeight: pageHeight || text.split("\n").length * 20,
    extractionMeta: {
      method: "text_fallback",
      visionBlockCount: 0,
      visionParagraphCount: 0,
      layoutLinesPerBlock: [],
      sampleLinesBefore: [],
      sampleLinesAfter: sampleLineTexts(lines),
    },
  };
}

/**
 * Extrae líneas OCR con coordenadas desde fullTextAnnotation de Google Vision.
 * Prefiere agrupación por bloque/párrafo; mantiene fallback global si no hay estructura.
 */
export function extractLayoutLinesFromVisionAnnotation(
  annotation: VisionFullTextAnnotation | null | undefined,
): OcrLayoutExtractionResult {
  const pages = annotation?.pages ?? [];
  const pageWidth = pages[0]?.width ?? 0;
  const pageHeight = pages[0]?.height ?? 0;
  const allWords = collectAllWordsFromAnnotation(annotation);

  if (allWords.length === 0 && annotation?.text) {
    return extractLayoutLinesTextFallback(annotation, pageWidth, pageHeight);
  }

  if (hasVisionBlockStructure(annotation)) {
    const legacyPreview = sampleLineTexts(clusterWordBoxesIntoLines(allWords));
    return extractLayoutLinesFromVisionBlocks(annotation, legacyPreview);
  }

  return extractLayoutLinesGlobalFallback(annotation, allWords, pageWidth, pageHeight);
}
