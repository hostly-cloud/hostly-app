import {
  canonicalTpvVoiceSearchText,
  scoreTpvVoiceCandidate,
} from "@/lib/tpv/voice-command";

export type TpvVoiceTableMatchEntry<T> = {
  value: T;
  tableId: string;
  tableLabel: string;
};

export type TpvVoiceTableMatch<T> = {
  value: T;
  label: string;
  score: number;
};

const MATCH_MIN_SCORE = 0.7;
const MATCH_AMBIGUITY_GAP = 0.08;

function canonicalSpokenTableText(value: string): string {
  let normalized = canonicalTpvVoiceSearchText(value).trim();
  normalized = normalized
    .replace(/^(?:la|el)\s+/, "")
    .replace(/^(?:mesa|table|tafel|tisch|tavolo)\s+/, "")
    .replace(/^(?:numero|num|nro|n|no|nr)\s+/, "")
    .trim();
  return normalized;
}

function standaloneTableNumber(value: string): string | null {
  const normalized = canonicalTpvVoiceSearchText(value);
  const matches = normalized.match(/(?:^|\s)(\d{1,3})(?=\s|$)/g) ?? [];
  const numbers = matches.map((match) => match.trim()).filter(Boolean);
  return numbers.length === 1 ? numbers[0]! : null;
}

export function chooseTpvVoiceTableCandidate<T>(
  query: string,
  entries: TpvVoiceTableMatchEntry<T>[],
): TpvVoiceTableMatch<T> | null | "ambiguous" {
  const normalizedQuery = canonicalSpokenTableText(query);
  if (!normalizedQuery) return null;

  const exactLabelMatches = entries.filter(
    (entry) => canonicalSpokenTableText(entry.tableLabel) === normalizedQuery,
  );
  if (exactLabelMatches.length === 1) {
    const entry = exactLabelMatches[0]!;
    return { value: entry.value, label: entry.tableLabel, score: 1 };
  }
  if (exactLabelMatches.length > 1) return "ambiguous";

  const queryNumber = standaloneTableNumber(normalizedQuery);
  if (queryNumber) {
    const numberMatches = entries.filter(
      (entry) => standaloneTableNumber(entry.tableLabel) === queryNumber,
    );
    if (numberMatches.length === 1) {
      const entry = numberMatches[0]!;
      return { value: entry.value, label: entry.tableLabel, score: 0.999 };
    }
    if (numberMatches.length > 1) return "ambiguous";
  }

  // IDs internos solo se aceptan de forma exacta. Nunca deben competir por fuzzy matching.
  const exactIdMatches = entries.filter(
    (entry) => canonicalTpvVoiceSearchText(entry.tableId) === normalizedQuery,
  );
  if (exactIdMatches.length === 1) {
    const entry = exactIdMatches[0]!;
    return { value: entry.value, label: entry.tableLabel, score: 1 };
  }
  if (exactIdMatches.length > 1) return "ambiguous";

  const ranked = entries
    .map((entry) => ({
      value: entry.value,
      label: entry.tableLabel,
      score: scoreTpvVoiceCandidate(normalizedQuery, canonicalSpokenTableText(entry.tableLabel)),
    }))
    .filter((candidate) => candidate.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;
  const second = ranked[1];
  if (second && best.score < 0.98 && best.score - second.score < MATCH_AMBIGUITY_GAP) {
    return "ambiguous";
  }
  return best;
}
