/**
 * Evaluación en vivo y bajo demanda del buscador de imágenes reales.
 *
 * No forma parte del CI normal y nunca adjunta imágenes a productos. Solo mide
 * cobertura de candidatos públicos de Open Food Facts con un corpus controlado.
 *
 * Uso:
 *   npm run eval:catalog-images:live
 *   npm run eval:catalog-images:live -- --case coca-cola-zero-330
 *   npm run eval:catalog-images:live -- --max-cases 4
 *   npm run eval:catalog-images:live -- --strict
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  assessCatalogImageCandidateExpectation,
  classifyCatalogImageLiveEvalResult,
  summarizeCatalogImageLiveEval,
  type CatalogImageLiveEvalCase,
  type CatalogImageLiveEvalCaseResult,
  type CatalogImageLiveEvalSegment,
} from "../lib/productos/catalog-image-live-eval";
import {
  CatalogProductImageProviderError,
  searchOpenFoodFactsCatalog,
} from "../lib/server/product-images/open-food-facts-catalog";

const DEFAULT_CORPUS_PATH =
  "test-corpus/catalog-product-images/live-coverage.json";
const DEFAULT_OUTPUT_DIR = "artifacts/catalog-image-live-eval";
const OFFICIAL_SEARCH_MIN_DELAY_MS = 6_500;

type LiveEvalCorpus = {
  version: number;
  description?: string;
  minimumDelayMs?: number;
  cases: CatalogImageLiveEvalCase[];
};

type CliArgs = {
  corpusPath: string;
  outputDir: string;
  delayMs?: number;
  maxCases?: number;
  caseId?: string;
  strict: boolean;
};

function readArg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1]?.trim();
  return value || undefined;
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Valor entero inválido: ${value}`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CliArgs {
  return {
    corpusPath: readArg(argv, "--corpus") ?? DEFAULT_CORPUS_PATH,
    outputDir: readArg(argv, "--output-dir") ?? DEFAULT_OUTPUT_DIR,
    delayMs: readPositiveInteger(readArg(argv, "--delay-ms")),
    maxCases: readPositiveInteger(readArg(argv, "--max-cases")),
    caseId: readArg(argv, "--case"),
    strict: argv.includes("--strict"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} debe ser un texto no vacío`);
  }
  return value.trim();
}

function parseCase(value: unknown, index: number): CatalogImageLiveEvalCase {
  if (!isRecord(value)) throw new Error(`cases[${index}] no es un objeto`);
  const context = value.context;
  if (!isRecord(context)) {
    throw new Error(`cases[${index}].context no es un objeto`);
  }
  const expectation = value.expectation;
  if (expectation != null && !isRecord(expectation)) {
    throw new Error(`cases[${index}].expectation no es un objeto`);
  }

  const optionalString = (record: Record<string, unknown>, key: string) =>
    typeof record[key] === "string" && record[key].trim()
      ? record[key].trim()
      : undefined;
  const brandTokens =
    expectation && Array.isArray(expectation.brandTokens)
      ? expectation.brandTokens
          .filter((token): token is string => typeof token === "string")
          .map((token) => token.trim())
          .filter(Boolean)
      : undefined;

  return {
    id: assertString(value.id, `cases[${index}].id`),
    segment: assertString(
      value.segment,
      `cases[${index}].segment`,
    ) as CatalogImageLiveEvalSegment,
    query: assertString(value.query, `cases[${index}].query`),
    context: {
      name: assertString(context.name, `cases[${index}].context.name`),
      ...(optionalString(context, "categoryName")
        ? { categoryName: optionalString(context, "categoryName") }
        : {}),
      ...(optionalString(context, "description")
        ? { description: optionalString(context, "description") }
        : {}),
      ...(optionalString(context, "brand")
        ? { brand: optionalString(context, "brand") }
        : {}),
      ...(optionalString(context, "quantity")
        ? { quantity: optionalString(context, "quantity") }
        : {}),
      ...(optionalString(context, "barcode")
        ? { barcode: optionalString(context, "barcode") }
        : {}),
    },
    ...(expectation
      ? {
          expectation: {
            ...(brandTokens?.length ? { brandTokens } : {}),
            ...(optionalString(expectation, "quantity")
              ? { quantity: optionalString(expectation, "quantity") }
              : {}),
            ...(optionalString(expectation, "vintage")
              ? { vintage: optionalString(expectation, "vintage") }
              : {}),
            ...(optionalString(expectation, "barcode")
              ? { barcode: optionalString(expectation, "barcode") }
              : {}),
          },
        }
      : {}),
  };
}

async function loadCorpus(filePath: string): Promise<LiveEvalCorpus> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const parsed = JSON.parse(await fs.readFile(absolutePath, "utf8")) as unknown;
  if (!isRecord(parsed)) throw new Error("El corpus no es un objeto JSON");
  if (!Array.isArray(parsed.cases)) {
    throw new Error("El corpus no contiene un array cases");
  }
  const version = Number(parsed.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("El corpus necesita una versión positiva");
  }
  const minimumDelayMs =
    typeof parsed.minimumDelayMs === "number" &&
    Number.isFinite(parsed.minimumDelayMs)
      ? Math.max(0, Math.round(parsed.minimumDelayMs))
      : undefined;

  return {
    version,
    ...(typeof parsed.description === "string"
      ? { description: parsed.description.trim() }
      : {}),
    ...(minimumDelayMs != null ? { minimumDelayMs } : {}),
    cases: parsed.cases.map(parseCase),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error: unknown): { code: string; message: string } {
  if (error instanceof CatalogProductImageProviderError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: "UNEXPECTED_ERROR", message: error.message };
  }
  return { code: "UNEXPECTED_ERROR", message: String(error) };
}

function percent(value: number | null): string {
  return value == null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildMarkdownReport(args: {
  generatedAt: string;
  corpus: LiveEvalCorpus;
  delayMs: number;
  strict: boolean;
  results: CatalogImageLiveEvalCaseResult[];
}): string {
  const summary = summarizeCatalogImageLiveEval(args.results);
  const lines = [
    "# Hostly — Catalog image live coverage",
    "",
    `- Generated: ${args.generatedAt}`,
    `- Corpus version: ${args.corpus.version}`,
    `- Cases: ${summary.total}`,
    `- Search delay: ${args.delayMs} ms`,
    `- Strict mode: ${args.strict ? "yes" : "no"}`,
    `- Coverage: ${percent(summary.coverageRate)}`,
    `- Strong matches: ${percent(summary.strongRate)}`,
    `- Expected identity checks: ${percent(summary.expectationPassRate)}`,
    `- Provider error rate: ${percent(summary.errorRate)}`,
    `- Assisted coverage acceptable: ${summary.assistedCoverageAcceptable ? "yes" : "no"}`,
    "- Automatic image use allowed: **no**",
    "",
    "> This report measures advisory candidates only. It never authorizes automatic selection or approval.",
    "",
    "## Cases",
    "",
    "| Case | Segment | Status | Top candidate | Confidence | Expectation | Latency |",
    "|---|---|---:|---|---:|---|---:|",
  ];

  for (const result of args.results) {
    const expectation = result.expectation
      ? result.expectation.passed
        ? "pass"
        : `fail: ${result.expectation.failures.join(", ")}`
      : "not checked";
    const candidate = result.topCandidate
      ? `${result.topCandidate.brand ?? ""} ${result.topCandidate.productName}`.trim()
      : result.error
        ? `${result.error.code}: ${result.error.message}`
        : "none";
    lines.push(
      `| ${escapeMarkdown(result.id)} | ${escapeMarkdown(result.segment)} | ${result.status} | ${escapeMarkdown(candidate)} | ${
        result.topCandidate ? percent(result.topCandidate.confidence) : "—"
      } | ${escapeMarkdown(expectation)} | ${result.durationMs} ms |`,
    );
  }

  lines.push("", "## Segment summary", "");
  lines.push(
    "| Segment | Total | Strong | Review | Miss | Error | Coverage | Expectation pass |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const segment of summary.segments) {
    lines.push(
      `| ${segment.segment} | ${segment.total} | ${segment.strong} | ${segment.review} | ${segment.miss} | ${segment.error} | ${percent(
        segment.coverageRate,
      )} | ${percent(segment.expectationPassRate)} |`,
    );
  }

  lines.push(
    "",
    "## Interpretation",
    "",
    "- `strong`: provider candidate is strong and all configured identity checks pass.",
    "- `review`: a candidate exists but still needs careful human verification.",
    "- `miss`: no candidate survived Hostly's conservative ranking.",
    "- `error`: the provider request failed or was rate-limited.",
    "",
  );

  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const corpus = await loadCorpus(cli.corpusPath);
  const delayMs = Math.max(
    OFFICIAL_SEARCH_MIN_DELAY_MS,
    corpus.minimumDelayMs ?? 0,
    cli.delayMs ?? 0,
  );

  let cases = corpus.cases;
  if (cli.caseId) {
    cases = cases.filter((item) => item.id === cli.caseId);
    if (cases.length === 0) {
      throw new Error(`No existe el caso ${cli.caseId}`);
    }
  }
  if (cli.maxCases && cli.maxCases > 0) {
    cases = cases.slice(0, cli.maxCases);
  }
  if (cases.length === 0) throw new Error("No hay casos que evaluar");

  console.log("Hostly catalog image live coverage");
  console.log(`Cases: ${cases.length}`);
  console.log(`Minimum delay: ${delayMs} ms`);
  console.log("Automatic use: disabled\n");

  const results: CatalogImageLiveEvalCaseResult[] = [];
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index]!;
    const startedAt = Date.now();
    try {
      const search = await searchOpenFoodFactsCatalog({
        query: item.query,
        context: item.context,
      });
      const topCandidate = search.candidates[0] ?? null;
      const expectation = topCandidate
        ? assessCatalogImageCandidateExpectation(
            topCandidate,
            item.expectation,
          )
        : null;
      const status = classifyCatalogImageLiveEvalResult({
        candidate: topCandidate,
        expectation,
      });
      const result: CatalogImageLiveEvalCaseResult = {
        id: item.id,
        segment: item.segment,
        query: item.query,
        durationMs: Date.now() - startedAt,
        status,
        candidateCount: search.candidates.length,
        expectation,
        topCandidate,
        error: null,
      };
      results.push(result);
      console.log(
        `${String(index + 1).padStart(2, "0")}/${cases.length} ${item.id}: ${status}${
          topCandidate
            ? ` · ${topCandidate.productName} · ${percent(topCandidate.confidence)}`
            : ""
        }`,
      );
    } catch (cause) {
      const error = describeError(cause);
      results.push({
        id: item.id,
        segment: item.segment,
        query: item.query,
        durationMs: Date.now() - startedAt,
        status: "error",
        candidateCount: 0,
        expectation: null,
        topCandidate: null,
        error,
      });
      console.log(
        `${String(index + 1).padStart(2, "0")}/${cases.length} ${item.id}: error · ${error.code}`,
      );
    }

    if (index < cases.length - 1) await sleep(delayMs);
  }

  const generatedAt = new Date().toISOString();
  const summary = summarizeCatalogImageLiveEval(results);
  const outputDir = path.resolve(process.cwd(), cli.outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt,
    provider: "open_food_facts",
    corpus: {
      path: cli.corpusPath,
      version: corpus.version,
      description: corpus.description ?? null,
    },
    settings: {
      delayMs,
      strict: cli.strict,
      automaticUseAllowed: false,
    },
    summary,
    results,
  };
  await Promise.all([
    fs.writeFile(
      path.join(outputDir, "catalog-image-live-eval.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(outputDir, "catalog-image-live-eval.md"),
      buildMarkdownReport({
        generatedAt,
        corpus,
        delayMs,
        strict: cli.strict,
        results,
      }),
      "utf8",
    ),
  ]);

  console.log("\nSummary");
  console.log(`Coverage: ${percent(summary.coverageRate)}`);
  console.log(`Strong: ${percent(summary.strongRate)}`);
  console.log(`Expectation pass: ${percent(summary.expectationPassRate)}`);
  console.log(`Provider errors: ${percent(summary.errorRate)}`);
  console.log(`Report: ${path.relative(process.cwd(), outputDir)}`);

  if (cli.strict && !summary.assistedCoverageAcceptable) {
    console.error(
      "Strict evaluation failed: assisted coverage thresholds were not met.",
    );
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
