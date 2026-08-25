import fs from "node:fs";
import path from "node:path";
import {
  evaluatePhotoVisionCase,
  summarizePhotoVisionEvaluation,
  type PhotoVisionEvalCaseInput,
  type PhotoVisionEvalProduct,
} from "../lib/menu-import-eval/photo-vision-eval";

type ManifestCase = {
  id: string;
  scenario: PhotoVisionEvalCaseInput["scenario"];
  image: string;
  expected: string;
};

type Manifest = { version: number; cases: ManifestCase[] };
type ProductsFile = { products?: PhotoVisionEvalProduct[] };

const root = process.cwd();
const corpusDir = path.join(root, "test-corpus", "photo-vision");
const manifestPath = path.join(corpusDir, "manifest.json");
const outDir = path.join(root, "artifacts", "menu-import-photo-vision-eval");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function productsFrom(filePath: string): PhotoVisionEvalProduct[] {
  const parsed = readJson<ProductsFile>(filePath);
  if (!Array.isArray(parsed.products)) throw new Error(`INVALID_PRODUCTS_FILE:${filePath}`);
  return parsed.products;
}

function resultPath(caseId: string, kind: "parser" | "vision"): string {
  return path.join(corpusDir, "results", caseId, `${kind}.json`);
}

const manifest = readJson<Manifest>(manifestPath);
const complete: PhotoVisionEvalCaseInput[] = [];
const incomplete: Array<{ id: string; missing: string[] }> = [];

for (const entry of manifest.cases) {
  const imagePath = path.join(corpusDir, entry.image);
  const expectedPath = path.join(corpusDir, entry.expected);
  const parserPath = resultPath(entry.id, "parser");
  const visionPath = resultPath(entry.id, "vision");
  const missing = [
    ["image", imagePath],
    ["expected", expectedPath],
    ["parser_result", parserPath],
    ["vision_result", visionPath],
  ]
    .filter(([, filePath]) => !fs.existsSync(filePath))
    .map(([label]) => label);

  if (missing.length) {
    incomplete.push({ id: entry.id, missing });
    continue;
  }

  complete.push({
    id: entry.id,
    scenario: entry.scenario,
    expected: productsFrom(expectedPath),
    parser: productsFrom(parserPath),
    vision: productsFrom(visionPath),
  });
}

const results = complete.map(evaluatePhotoVisionCase);
const summary = summarizePhotoVisionEvaluation(results);
const report = {
  generatedAt: new Date().toISOString(),
  manifestVersion: manifest.version,
  configuredCases: manifest.cases.length,
  completeCases: complete.length,
  incomplete,
  results,
  summary: {
    ...summary,
    corpusComplete: incomplete.length === 0 && complete.length === manifest.cases.length,
    activationRecommended:
      incomplete.length === 0 && complete.length === manifest.cases.length && summary.activationRecommended,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const markdown = [
  "# Menu Import · Photo Vision Eval",
  "",
  `- Configured cases: ${report.configuredCases}`,
  `- Complete real cases: ${report.completeCases}`,
  `- Parser recall: ${pct(summary.parserRecall)}`,
  `- Vision recall: ${pct(summary.visionRecall)}`,
  `- Recall lift: ${pct(summary.recallLift)}`,
  `- Vision precision: ${pct(summary.visionPrecision)}`,
  `- False positives: ${summary.falsePositives}`,
  `- Recovered expected products: ${summary.recoveredExpected}`,
  `- Corpus complete: ${report.summary.corpusComplete}`,
  `- Activation recommended: ${report.summary.activationRecommended}`,
  "",
  ...(incomplete.length
    ? ["## Missing evidence", "", ...incomplete.map((row) => `- ${row.id}: ${row.missing.join(", ")}`)]
    : []),
  "",
].join("\n");
fs.writeFileSync(path.join(outDir, "report.md"), markdown);

console.log(JSON.stringify(report.summary, null, 2));
if (incomplete.length) {
  console.log(`Photo corpus incomplete: ${incomplete.length}/${manifest.cases.length} case(s) missing evidence.`);
}
