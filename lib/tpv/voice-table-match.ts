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

const MATCH_MIN_SCORE = 0.72;
const MATCH_AMBIGUITY_GAP = 0.08;

function canonicalSpokenTableText(value: string): string {
  let normalized = canonicalTpvVoiceSearchText(value).trim();

  while (normalized.startsWith("mesa ")) {
    normalized = normalized.slice("mesa ".length).trim();
  }

  normalized = normalized.replace(/^(?:numero|num|nro)\s+/, "").trim();
  return normalized;
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
      score: scoreTpvVoiceCandidate(
        normalizedQuery,
        canonicalSpokenTableText(entry.tableLabel),
      ),
    }))
    .filter((candidate) => candidate.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;

  const second = ranked[1];
  if (
    second &&
    best.score < 0.98 &&
    best.score - second.score < MATCH_AMBIGUITY_GAP
  ) {
    return "ambiguous";
  }

  return best;
}
