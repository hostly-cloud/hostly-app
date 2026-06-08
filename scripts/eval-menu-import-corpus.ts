/**
 * Evaluación del corpus de importación IA.
 * Uso:
 *   npm run eval:menu-import
 *   npm run eval:menu-import -- --case pasta-casera-multilingual
 *   npm run eval:menu-import -- --write-baseline
 *   npm run eval:menu-import -- --json
 *   npm run eval:menu-import:v2
 *   npm run eval:menu-import:v2 -- --case pasta-casera-multilingual
 */
import fs from "node:fs";
import path from "node:path";
import { formatPercent } from "../lib/menu-import-eval/compute-metrics";
import {
  buildCorpusReport,
  compareAgainstBaseline,
  loadBaselineReport,
  writeBaselineReport,
} from "../lib/menu-import-eval/corpus-report";
import { getCorpusRoot, listCaseIds, loadManifest } from "../lib/menu-import-eval/load-corpus-case";
import { aggregateMetrics, runParserCaseEval } from "../lib/menu-import-eval/run-parser-case";
import { runShadowV2CaseEval } from "../lib/menu-import-eval/run-shadow-v2-case";
import { estimateAiImportV2CostUsd } from "../lib/server/menu-imports/ai-import-v2/run-ai-import-v2-shadow";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] == null) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

type CliArgs = {
  caseId?: string;
  writeBaseline: boolean;
  skipBaselineCheck: boolean;
  json: boolean;
  shadowV2: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const caseIdx = argv.indexOf("--case");
  return {
    caseId: caseIdx >= 0 && argv[caseIdx + 1] ? argv[caseIdx + 1] : undefined,
    writeBaseline: argv.includes("--write-baseline"),
    skipBaselineCheck: argv.includes("--skip-baseline-check"),
    json: argv.includes("--json"),
    shadowV2: argv.includes("--shadow-v2"),
  };
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

function formatTpFpFn(metrics: { tp: number; fp: number; fn: number }): string {
  return `${metrics.tp}/${metrics.fp}/${metrics.fn}`;
}

function printParserTable(
  results: ReturnType<typeof runParserCaseEval>[],
  manifestTitle: string,
): { global: ReturnType<typeof aggregateMetrics>; passedCount: number } {
  console.log("════════════════════════════════════════════════════════════");
  console.log(" Hostly Menu Import Evaluation — Phase 1 (parser-only)");
  console.log(` Corpus: ${manifestTitle}`);
  console.log("════════════════════════════════════════════════════════════");
  console.log(
    [
      pad("Case", 36),
      pad("Exp", 5),
      pad("Det", 5),
      pad("TP", 4),
      pad("FP", 4),
      pad("FN", 4),
      pad("Recall", 8),
      pad("Precision", 10),
      "PASS",
    ].join(" "),
  );
  console.log("─".repeat(90));

  for (const r of results) {
    const m = r.metrics;
    console.log(
      [
        pad(r.caseId, 36),
        pad(m.expected, 5),
        pad(m.detected, 5),
        pad(m.tp, 4),
        pad(m.fp, 4),
        pad(m.fn, 4),
        pad(formatPercent(m.recall), 8),
        pad(formatPercent(m.precision), 10),
        r.passed ? "PASS" : "FAIL",
      ].join(" "),
    );
    if (!r.passed) {
      for (const f of r.failures) {
        console.log(`  └─ ${f}`);
      }
      if (r.match.falseNegatives.length > 0) {
        console.log(`  └─ FN: ${r.match.falseNegatives.map((p) => p.name).join("; ")}`);
      }
      if (r.match.falsePositives.length > 0) {
        console.log(`  └─ FP: ${r.match.falsePositives.map((p) => p.detected.name).join("; ")}`);
      }
      if (r.match.negativeHits.length > 0) {
        console.log(
          `  └─ negative: ${r.match.negativeHits.map((h) => h.detectedName).join("; ")}`,
        );
      }
      if (r.pendingNames > 0) {
        console.log(`  └─ pendingNames: ${r.pendingNames}`);
      }
    }
  }

  const global = aggregateMetrics(results.map((r) => r.metrics));
  const passedCount = results.filter((r) => r.passed).length;

  console.log("─".repeat(90));
  console.log(" GLOBAL");
  console.log(
    [
      pad("TOTAL", 36),
      pad(global.expected, 5),
      pad(global.detected, 5),
      pad(global.tp, 4),
      pad(global.fp, 4),
      pad(global.fn, 4),
      pad(formatPercent(global.recall), 8),
      pad(formatPercent(global.precision), 10),
      `${passedCount}/${results.length} PASS`,
    ].join(" "),
  );
  console.log("════════════════════════════════════════════════════════════");

  return { global, passedCount };
}

function printShadowV2Table(
  results: Awaited<ReturnType<typeof runShadowV2CaseEval>>[],
  manifestTitle: string,
): void {
  console.log("══════════════════════════════════════════════════════════════════════════════════════");
  console.log(" Hostly Menu Import Evaluation — IA Import V2 Shadow vs Parser vs Expected");
  console.log(` Corpus: ${manifestTitle}`);
  console.log("══════════════════════════════════════════════════════════════════════════════════════");
  console.log(
    [
      pad("Case", 32),
      pad("Exp", 4),
      pad("Parser TP/FP/FN", 16),
      pad("P Recall", 9),
      pad("P Prec", 9),
      pad("V2 TP/FP/FN", 14),
      pad("V2 Recall", 10),
      pad("V2 Prec", 9),
      pad("Rej", 4),
      "Winner",
    ].join(" "),
  );
  console.log("─".repeat(120));

  for (const r of results) {
    const pm = r.parser.metrics;
    const vm = r.v2.metrics;
    console.log(
      [
        pad(r.caseId, 32),
        pad(pm.expected, 4),
        pad(formatTpFpFn(pm), 16),
        pad(formatPercent(pm.recall), 9),
        pad(formatPercent(pm.precision), 9),
        pad(formatTpFpFn(vm), 14),
        pad(formatPercent(vm.recall), 10),
        pad(formatPercent(vm.precision), 9),
        pad(r.v2.rejected, 4),
        r.winner,
      ].join(" "),
    );

    if (r.v2.error) {
      console.log(`  └─ V2 error: ${r.v2.error}`);
    }
    if (r.parser.match.falseNegatives.length > 0) {
      console.log(`  └─ Parser FN: ${r.parser.match.falseNegatives.map((p) => p.name).join("; ")}`);
    }
    if (r.v2.match.falseNegatives.length > 0) {
      console.log(`  └─ V2 FN: ${r.v2.match.falseNegatives.map((p) => p.name).join("; ")}`);
    }
    if (r.v2.match.falsePositives.length > 0) {
      console.log(`  └─ V2 FP: ${r.v2.match.falsePositives.map((p) => p.detected.name).join("; ")}`);
    }
    if (r.parserVsV2) {
      console.log(
        `  └─ Parser↔V2 matched: ${r.parserVsV2.matchedBoth} | parserOnly: ${r.parserVsV2.parserOnly.length} | v2Only: ${r.parserVsV2.v2Only.length}`,
      );
    }
  }

  const parserGlobal = aggregateMetrics(results.map((r) => r.parser.metrics));
  const v2Global = aggregateMetrics(results.map((r) => r.v2.metrics));
  const parserWins = results.filter((r) => r.winner === "parser").length;
  const v2Wins = results.filter((r) => r.winner === "v2").length;
  const ties = results.filter((r) => r.winner === "tie").length;

  console.log("─".repeat(120));
  console.log(" GLOBAL");
  console.log(
    [
      pad("TOTAL", 32),
      pad(parserGlobal.expected, 4),
      pad(formatTpFpFn(parserGlobal), 16),
      pad(formatPercent(parserGlobal.recall), 9),
      pad(formatPercent(parserGlobal.precision), 9),
      pad(formatTpFpFn(v2Global), 14),
      pad(formatPercent(v2Global.recall), 10),
      pad(formatPercent(v2Global.precision), 9),
      pad(results.reduce((s, r) => s + r.v2.rejected, 0), 4),
      `P:${parserWins} V2:${v2Wins} tie:${ties}`,
    ].join(" "),
  );
  console.log("══════════════════════════════════════════════════════════════════════════════════════");
}

function assertOpenAiApiKey(): void {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error("");
    console.error("ERROR: OPENAI_API_KEY no configurada.");
    console.error("La evaluación --shadow-v2 requiere una API key de OpenAI.");
    console.error("Configúrala en .env.local o en el entorno antes de ejecutar.");
    console.error("");
    process.exit(1);
  }
}

function printShadowV2CostWarning(caseCount: number, caseIds: string[]): void {
  const estimate = estimateAiImportV2CostUsd({
    rawTextChars: 3500,
    hasImage: false,
  });
  console.log("");
  console.log(`⚠ Esto puede generar llamadas OpenAI para ${caseCount} caso(s).`);
  console.log(`  Casos: ${caseIds.join(", ")}`);
  console.log(
    `  Coste estimado (texto OCR, ${estimate.model}): ~$${estimate.low.toFixed(4)} – $${estimate.high.toFixed(4)} por caso`,
  );
  console.log(
    `  Total aproximado: ~$${(estimate.low * caseCount).toFixed(3)} – $${(estimate.high * caseCount).toFixed(3)}`,
  );
  console.log("");
}

async function main() {
  loadEnvLocal();
  process.env.NODE_ENV = "development";

  const args = parseArgs(process.argv.slice(2));
  const corpusRoot = getCorpusRoot();
  const manifest = loadManifest(corpusRoot);
  const caseIds = listCaseIds(manifest, args.caseId);

  if (args.shadowV2) {
    assertOpenAiApiKey();
    printShadowV2CostWarning(caseIds.length, caseIds);

    const results: Awaited<ReturnType<typeof runShadowV2CaseEval>>[] = [];
    for (const id of caseIds) {
      results.push(await runShadowV2CaseEval(id, corpusRoot));
    }

    if (args.json) {
      console.log(JSON.stringify({ mode: "shadow-v2", cases: results }, null, 2));
    } else {
      printShadowV2Table(results, manifest.title);
    }

    const hasV2Errors = results.some((r) => r.v2.error);
    process.exit(hasV2Errors ? 1 : 0);
    return;
  }

  const results = caseIds.map((id) => runParserCaseEval(id, corpusRoot));
  const report = buildCorpusReport({ corpusTitle: manifest.title, results });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printParserTable(results, manifest.title);
  }

  if (args.writeBaseline) {
    const outPath = writeBaselineReport(report, corpusRoot);
    console.log(`Baseline written: ${outPath}`);
  }

  let exitCode = 0;

  if (results.some((r) => !r.passed)) {
    exitCode = 1;
  }

  if (!args.skipBaselineCheck && !args.caseId && loadBaselineReport(corpusRoot)) {
    const baseline = loadBaselineReport(corpusRoot)!;
    const regressions = compareAgainstBaseline(report, baseline);
    if (regressions.length > 0 && !args.json) {
      console.log("─".repeat(90));
      console.log(" BASELINE REGRESSION");
      for (const issue of regressions) {
        console.log(`  └─ ${issue}`);
      }
    }
    if (regressions.length > 0) {
      exitCode = 1;
    }
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
