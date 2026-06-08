import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import { matchProducts, nameMatchScore, pricesMatch } from "@/lib/menu-import-eval/match-products";
import type { DetectedProduct, ExpectedProduct } from "@/lib/menu-import-eval/types";
import type { AiImportV2Comparison, AiImportV2ValidatedItem } from "./types";

const MATCH_RULES = {
  nameMode: "normalized_contains" as const,
  priceTolerance: 0.05,
  diceThreshold: 0.88,
  requirePrice: true,
  requireSection: false,
};

function toDetected(item: {
  name: string;
  price?: number;
  sectionName?: string;
}): DetectedProduct {
  return {
    name: item.name,
    price: item.price,
    sectionName: item.sectionName,
  };
}

function v2ToExpected(items: AiImportV2ValidatedItem[]): ExpectedProduct[] {
  return items.map((item, index) => ({
    id: `v2-${index}`,
    name: item.name,
    price: item.price,
    sectionName: item.sectionName,
  }));
}

function parserToDetected(items: ImportedMenuItem[]): DetectedProduct[] {
  return items.map((item) =>
    toDetected({
      name: item.name,
      price: item.price,
      sectionName: item.sectionName,
    }),
  );
}

function v2ToDetected(items: AiImportV2ValidatedItem[]): DetectedProduct[] {
  return items.map((item) =>
    toDetected({
      name: item.name,
      price: item.price,
      sectionName: item.sectionName,
    }),
  );
}

export function compareAiImportV2WithParser(args: {
  parserItems: ImportedMenuItem[];
  v2Accepted: AiImportV2ValidatedItem[];
  v2RejectedCount: number;
}): AiImportV2Comparison {
  const parserDetected = args.parserItems.length;
  const v2Detected = args.v2Accepted.length + args.v2RejectedCount;
  const parserProducts = parserToDetected(args.parserItems);
  const v2Products = v2ToDetected(args.v2Accepted);

  const parserAsExpected = args.parserItems.map((item, index) => ({
    id: `parser-${index}`,
    name: item.name,
    price: item.price,
    sectionName: item.sectionName,
  }));

  const v2AsExpected = v2ToExpected(args.v2Accepted);

  const v2MatchParser = matchProducts({
    expected: parserAsExpected,
    detected: v2Products,
  });

  const parserMatchV2 = matchProducts({
    expected: v2AsExpected,
    detected: parserProducts,
  });

  const matchedBoth = v2MatchParser.truePositives.length;

  const priceMismatches = v2MatchParser.truePositives
    .filter((tp) => !tp.priceOk)
    .map((tp) => ({
      parserName: tp.expected.name,
      v2Name: tp.detected.name,
      parserPrice: tp.expected.price ?? 0,
      v2Price: tp.detected.price ?? 0,
      nameScore: tp.nameScore,
    }));

  const parserOnly = parserMatchV2.falseNegatives.map((fn) =>
    toDetected({
      name: fn.name,
      price: fn.price,
      sectionName: fn.sectionName,
    }),
  );

  const v2Only = v2MatchParser.falsePositives.map((fp) => fp.detected);

  const avgV2Confidence =
    args.v2Accepted.length > 0
      ? args.v2Accepted.reduce((sum, item) => sum + item.confidence, 0) / args.v2Accepted.length
      : null;

  const parserVsV2Recall =
    parserDetected > 0 ? matchedBoth / parserDetected : args.v2Accepted.length === 0 ? 1 : 0;

  const parserVsV2Precision =
    args.v2Accepted.length > 0 ? matchedBoth / args.v2Accepted.length : parserDetected === 0 ? 1 : 0;

  return {
    parserDetected,
    v2Detected,
    v2Accepted: args.v2Accepted.length,
    v2Rejected: args.v2RejectedCount,
    matchedBoth,
    parserOnly,
    v2Only,
    priceMismatches,
    avgV2Confidence,
    parserVsV2Recall,
    parserVsV2Precision,
  };
}

export function compareAiImportV2WithExpected(args: {
  expected: ExpectedProduct[];
  v2Accepted: AiImportV2ValidatedItem[];
}): ReturnType<typeof matchProducts> {
  return matchProducts({
    expected: args.expected,
    detected: v2ToDetected(args.v2Accepted),
  });
}

export function findPairwiseDifferences(args: {
  parserItems: ImportedMenuItem[];
  v2Accepted: AiImportV2ValidatedItem[];
}): {
  sameNameDifferentPrice: Array<{ name: string; parserPrice: number; v2Price: number }>;
} {
  const sameNameDifferentPrice: Array<{ name: string; parserPrice: number; v2Price: number }> = [];

  for (const v2 of args.v2Accepted) {
    for (const parser of args.parserItems) {
      const score = nameMatchScore(parser.name, v2.name, MATCH_RULES);
      if (score < 0.88) continue;
      const priceOk = pricesMatch(parser.price, v2.price, MATCH_RULES.priceTolerance, true);
      if (!priceOk && parser.price != null) {
        sameNameDifferentPrice.push({
          name: parser.name,
          parserPrice: parser.price,
          v2Price: v2.price,
        });
      }
    }
  }

  return { sameNameDifferentPrice };
}
