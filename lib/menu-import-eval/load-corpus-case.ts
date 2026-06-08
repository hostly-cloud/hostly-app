import fs from "node:fs";
import path from "node:path";
import type { OcrLayoutLine } from "@/lib/server/menu-imports/menu-import-ocr-layout-types";
import type { CorpusCaseMeta, CorpusManifest, ExpectedProductsFile } from "./types";

export function getCorpusRoot(repoRoot?: string): string {
  return path.join(repoRoot ?? process.cwd(), "test-corpus");
}

export function loadManifest(corpusRoot = getCorpusRoot()): CorpusManifest {
  const raw = fs.readFileSync(path.join(corpusRoot, "manifest.json"), "utf8");
  return JSON.parse(raw) as CorpusManifest;
}

export function loadCaseMeta(caseId: string, corpusRoot = getCorpusRoot()): CorpusCaseMeta {
  const casePath = path.join(corpusRoot, "cases", caseId, "case.json");
  const raw = fs.readFileSync(casePath, "utf8");
  return JSON.parse(raw) as CorpusCaseMeta;
}

export function loadExpectedProducts(caseId: string, corpusRoot = getCorpusRoot()): ExpectedProductsFile {
  const expectedPath = path.join(corpusRoot, "cases", caseId, "expected", "products.json");
  const raw = fs.readFileSync(expectedPath, "utf8");
  return JSON.parse(raw) as ExpectedProductsFile;
}

export function loadOcrText(caseId: string, corpusRoot = getCorpusRoot()): string {
  const ocrPath = path.join(corpusRoot, "cases", caseId, "input", "ocr.txt");
  return fs.readFileSync(ocrPath, "utf8");
}

export type CorpusOcrLayoutBundle = {
  lines: OcrLayoutLine[];
  pageWidth?: number;
  pageHeight?: number;
};

/** Layout OCR opcional por caso (`input/ocr-layout.json`). */
export function loadCorpusOcrLayoutBundle(
  caseId: string,
  corpusRoot = getCorpusRoot(),
): CorpusOcrLayoutBundle | undefined {
  const layoutPath = path.join(corpusRoot, "cases", caseId, "input", "ocr-layout.json");
  if (!fs.existsSync(layoutPath)) return undefined;
  const raw = fs.readFileSync(layoutPath, "utf8");
  const parsed = JSON.parse(raw) as CorpusOcrLayoutBundle | OcrLayoutLine[];
  if (Array.isArray(parsed)) return { lines: parsed };
  if (!parsed.lines?.length) return undefined;
  return parsed;
}

export function loadCorpusOcrLayout(caseId: string, corpusRoot = getCorpusRoot()): OcrLayoutLine[] | undefined {
  return loadCorpusOcrLayoutBundle(caseId, corpusRoot)?.lines;
}

export function listCaseIds(manifest: CorpusManifest, filterCase?: string): string[] {
  if (filterCase) {
    if (!manifest.cases.includes(filterCase)) {
      throw new Error(`Case not in manifest: ${filterCase}`);
    }
    return [filterCase];
  }
  return [...manifest.cases];
}
