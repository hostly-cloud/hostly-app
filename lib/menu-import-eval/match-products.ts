import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import type {
  CaseMatchResult,
  DetectedProduct,
  ExpectedProduct,
  ExpectedProductMatchRules,
  NegativeProductExpectation,
  NegativeSectionExpectation,
} from "./types";

/** Espejo de duplicate-detection (no exportado allí). */
function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

const DEFAULT_RULES: Required<ExpectedProductMatchRules> = {
  nameMode: "normalized_contains",
  priceTolerance: 0.05,
  diceThreshold: 0.88,
  requirePrice: true,
  requireSection: false,
  requireStation: false,
};

function resolveRules(match?: ExpectedProductMatchRules): Required<ExpectedProductMatchRules> {
  return { ...DEFAULT_RULES, ...match };
}

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}

export function pricesMatch(
  expected: number | undefined,
  detected: number | undefined,
  tolerance: number,
  requirePrice: boolean,
): boolean {
  if (!requirePrice) return true;
  if (expected == null || detected == null) return false;
  return Math.abs(roundPrice(expected) - roundPrice(detected)) <= tolerance;
}

export function nameMatchScore(
  expectedName: string,
  detectedName: string,
  rules: Required<ExpectedProductMatchRules>,
): number {
  const exp = normalizeProductName(expectedName);
  const det = normalizeProductName(detectedName);
  if (!exp || !det) return 0;

  if (rules.nameMode === "exact_normalized") {
    return exp === det ? 1 : 0;
  }
  if (rules.nameMode === "normalized_contains") {
    if (exp === det) return 1;
    if (det.includes(exp) || exp.includes(det)) return 0.95;
    return diceCoefficient(exp, det);
  }
  const dice = diceCoefficient(exp, det);
  return dice >= rules.diceThreshold ? dice : 0;
}

export function namesMatch(
  expectedName: string,
  detectedName: string,
  rules: Required<ExpectedProductMatchRules>,
): boolean {
  const score = nameMatchScore(expectedName, detectedName, rules);
  if (rules.nameMode === "dice_gte_0.88") {
    return score >= rules.diceThreshold;
  }
  if (rules.nameMode === "exact_normalized") {
    return score === 1;
  }
  return score >= 0.88 || normalizeProductName(expectedName) === normalizeProductName(detectedName);
}

function sectionsMatch(
  expectedSection: string | undefined,
  detectedSection: string | undefined,
  requireSection: boolean,
): boolean {
  if (!requireSection) return true;
  if (!expectedSection?.trim()) return true;
  return normalizeProductName(expectedSection) === normalizeProductName(detectedSection ?? "");
}

function stationsMatch(
  expectedStation: ExpectedProduct["suggestedStation"],
  detectedStation: DetectedProduct["suggestedStation"],
  requireStation: boolean,
): boolean {
  if (!requireStation) return true;
  if (!expectedStation) return true;
  return expectedStation === detectedStation;
}

function pairScore(
  expected: ExpectedProduct,
  detected: DetectedProduct,
  rules: Required<ExpectedProductMatchRules>,
): number {
  const nameScore = nameMatchScore(expected.name, detected.name, rules);
  if (!namesMatch(expected.name, detected.name, rules)) return 0;
  if (!pricesMatch(expected.price, detected.price, rules.priceTolerance, rules.requirePrice)) return 0;
  if (!sectionsMatch(expected.sectionName, detected.sectionName, rules.requireSection)) return 0;
  if (!stationsMatch(expected.suggestedStation, detected.suggestedStation, rules.requireStation)) return 0;
  return nameScore;
}

export function matchProducts(args: {
  expected: ExpectedProduct[];
  detected: DetectedProduct[];
  negativeProducts?: NegativeProductExpectation[];
  negativeSections?: NegativeSectionExpectation[];
}): CaseMatchResult {
  const usedDetected = new Set<number>();
  const truePositives: CaseMatchResult["truePositives"] = [];
  const falseNegatives: ExpectedProduct[] = [];

  for (const expected of args.expected) {
    const rules = resolveRules(expected.match);
    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < args.detected.length; i++) {
      if (usedDetected.has(i)) continue;
      const score = pairScore(expected, args.detected[i]!, rules);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestScore > 0) {
      const detected = args.detected[bestIndex]!;
      usedDetected.add(bestIndex);
      truePositives.push({
        expected,
        detected,
        detectedIndex: bestIndex,
        nameScore: nameMatchScore(expected.name, detected.name, rules),
        priceOk: pricesMatch(expected.price, detected.price, rules.priceTolerance, rules.requirePrice),
        sectionOk: sectionsMatch(expected.sectionName, detected.sectionName, rules.requireSection),
        stationOk: stationsMatch(expected.suggestedStation, detected.suggestedStation, rules.requireStation),
      });
    } else {
      falseNegatives.push(expected);
    }
  }

  const falsePositives: CaseMatchResult["falsePositives"] = [];
  for (let i = 0; i < args.detected.length; i++) {
    if (!usedDetected.has(i)) {
      falsePositives.push({ detected: args.detected[i]!, detectedIndex: i });
    }
  }

  const negativeHits: CaseMatchResult["negativeHits"] = [];
  for (const neg of args.negativeProducts ?? []) {
    const re = new RegExp(neg.namePattern, "i");
    for (const det of args.detected) {
      if (re.test(det.name)) {
        negativeHits.push({
          pattern: neg.namePattern,
          detectedName: det.name,
          reason: neg.reason,
        });
      }
    }
  }

  const negativeSectionHits: CaseMatchResult["negativeSectionHits"] = [];
  for (const neg of args.negativeSections ?? []) {
    const re = new RegExp(neg.namePattern, "i");
    for (const det of args.detected) {
      const section = det.sectionName ?? det.suggestedCategory ?? "";
      if (section && re.test(section)) {
        negativeSectionHits.push({
          pattern: neg.namePattern,
          sectionName: section,
          reason: neg.reason,
        });
      }
    }
  }

  return { truePositives, falsePositives, falseNegatives, negativeHits, negativeSectionHits };
}
