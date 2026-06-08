import type { CaseMetrics } from "./types";

export type ShadowV2Winner = "parser" | "v2" | "tie";

function f1(metrics: CaseMetrics): number {
  const { recall, precision } = metrics;
  if (recall + precision === 0) return 0;
  return (2 * recall * precision) / (recall + precision);
}

/**
 * Desempate: más TP → menos FP → menos FN → F1.
 */
export function pickShadowV2Winner(parser: CaseMetrics, v2: CaseMetrics): ShadowV2Winner {
  if (parser.tp !== v2.tp) return parser.tp > v2.tp ? "parser" : "v2";
  if (parser.fp !== v2.fp) return parser.fp < v2.fp ? "parser" : "v2";
  if (parser.fn !== v2.fn) return parser.fn < v2.fn ? "parser" : "v2";

  const parserF1 = f1(parser);
  const v2F1 = f1(v2);
  if (Math.abs(parserF1 - v2F1) > 1e-6) {
    return parserF1 > v2F1 ? "parser" : "v2";
  }

  return "tie";
}
