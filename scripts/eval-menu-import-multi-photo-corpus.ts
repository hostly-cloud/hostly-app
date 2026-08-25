import fs from "node:fs";
import path from "node:path";
import {
  evaluateMultiPhotoVisionBatch,
  summarizeMultiPhotoVisionEvaluation,
  type MultiPhotoVisionEvalBatchInput,
} from "../lib/menu-import-eval/multi-photo-vision-eval";
import type { PhotoVisionEvalProduct } from "../lib/menu-import-eval/photo-vision-eval";

type ManifestPage = {
  id: string;
  image: string;
  expected: string;
};

type ManifestBatch = {
  id: string;
  pages: ManifestPage[];
};

type Manifest = {
  version: number;
  batches: ManifestBatch[];
};

type ProductsFile = { products?: PhotoVisionEvalProduct[] };

const root = process.cwd();
const corpusDir = path.join(root, "test-corpus", "multi-photo-vision");
const manifestPath = path.join(corpusDir, "manifest.json");
const outDir = path.join(root, "artifacts", "menu-import-multi-photo-vision-eval");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function productsFrom(filePath: string): PhotoVisionEvalProduct[] {
  const parsed = readJson<ProductsFile>(filePath);
  if (!Array.isArray(parsed.products)) throw new Error(`INVALID_PRODUCTS_FILE:${filePath}`);
  return parsed.products;
}

function resultPath(batchId: string, pageId: string, kind: "parser" | "vision"): string {
  return path.join(corpusDir, "results", batchId, pageId, `${kind}.json`);
}

const manifest = readJson<Manifest>(manifestPath);
const completeBatches: MultiPhotoVisionEvalBatchInput[] = [];
const incomplete: Array<{
  batchId: string;
  pageId: string;
  missing: string[];
}> = [];

for (const batch of manifest.batches) {
  const pages: MultiPhotoVisionEvalBatchInput["pages"] = [];
  let batchComplete = batch.pages.length >= 2;

  if (batch.pages.length < 2) {
    incomplete.push({ batchId: batch.id, pageId: "batch", missing: ["minimum_2_pages"] });
  }

  for (const page of batch.pages) {
    const imagePath = path.join(corpusDir, page.image);
    const expectedPath = path.join(corpusDir, page.expected);
    const parserPath = resultPath(batch.id, page.id, "parser");
    const visionPath = resultPath(batch.id, page.id, "vision");
    const missing = [
      ["image", imagePath],
      ["expected", expectedPath],
      ["parser_result", parserPath],
      ["vision_result", visionPath],
    ]
      .filter(([, filePath]) => !fs.existsSync(filePath))
      .map(([label]) => label);

    if (missing.length > 0) {
      batchComplete = false;
      incomplete.push({ batchId: batch.id, pageId: page.id, missing });
      continue;
    }

    pages.push({
      id: page.id,
      expected: productsFrom(expectedPath),
      parser: productsFrom(parserPath),
      vision: productsFrom(visionPath),
    });
  }

  if (batchComplete && pages.length === batch.pages.length) {
    completeBatches.push({ id: batch.id, pages });
  }
}

const results = completeBatches.map(evaluateMultiPhotoVisionBatch);
const summary = summarizeMultiPhotoVisionEvaluation(results);
const configuredPages = manifest.batches.reduce((sum, batch) => sum + batch.pages.length, 0);
const corpusComplete =
  incomplete.length === 0 && completeBatches.length === manifest.batches.length;
const report = {
  generatedAt: new Date().toISOString(),
  manifestVersion: manifest.version,
  configuredBatches: manifest.batches.length,
  configuredPages,
  completeBatches: completeBatches.length,
  incomplete,
  results,
  summary: {
    ...summary,
    corpusComplete,
    activationRecommended: corpusComplete && summary.activationRecommended,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const markdown = [
  "# Menu Import · Multi-photo Vision Eval",
  "",
  `- Configured batches: ${report.configuredBatches}`,
  `- Configured pages: ${report.configuredPages}`,
  `- Complete real batches: ${report.completeBatches}`,
  `- Complete evaluated pages: ${summary.pageCount}`,
  `- Parser recall: ${pct(summary.parserRecall)}`,
  `- Vision recall: ${pct(summary.visionRecall)}`,
  `- Recall lift: ${pct(summary.recallLift)}`,
  `- Vision precision: ${pct(summary.visionPrecision)}`,
  `- False positives: ${summary.falsePositives}`,
  `- Recovered expected products: ${summary.recoveredExpected}`,
  `- Exact duplicates across pages: ${summary.exactDuplicatesAcrossPages}`,
  `- Same-name/different-price variants: ${summary.sameNameDifferentPriceVariants}`,
  `- Corpus complete: ${report.summary.corpusComplete}`,
  `- Activation recommended: ${report.summary.activationRecommended}`,
  "",
  ...(incomplete.length
    ? [
        "## Missing evidence",
        "",
        ...incomplete.map(
          (row) => `- ${row.batchId}/${row.pageId}: ${row.missing.join(", ")}`,
        ),
      ]
    : []),
  "",
].join("\n");
fs.writeFileSync(path.join(outDir, "report.md"), markdown);

console.log(JSON.stringify(report.summary, null, 2));
if (incomplete.length > 0) {
  console.log(
    `Multi-photo corpus incomplete: ${completeBatches.length}/${manifest.batches.length} batch(es) complete.`,
  );
}
