import {
  kdsSlaScoreFromElapsedMs,
  type KdsStationKind,
} from "@/lib/kds/kds-sla";

export type KdsFocusCandidate = {
  tableKey: string;
  score: number;
  oldestSentAtMs?: number;
  manualPriority?: boolean;
};

export function pickKdsFocusTableKeys(
  groups: ReadonlyArray<{
    tableKey: string;
    lines: ReadonlyArray<{ sentAtMs?: number; status?: string }>;
    oldestSentAtMs?: number;
  }>,
  station: KdsStationKind,
  manualPriorityKeys: ReadonlySet<string>,
  maxFocus = 2,
): string[] {
  const scored: KdsFocusCandidate[] = [];

  for (const group of groups) {
    const pendingLines = group.lines.filter((line) => line.status === "sent");
    if (pendingLines.length === 0) continue;

    let maxScore = 0;
    for (const line of pendingLines) {
      if (line.sentAtMs == null) continue;
      maxScore = Math.max(
        maxScore,
        kdsSlaScoreFromElapsedMs(Date.now() - line.sentAtMs, station),
      );
    }
    if (manualPriorityKeys.has(group.tableKey)) {
      maxScore = Math.max(maxScore, 3);
    }

    if (maxScore <= 0 && !manualPriorityKeys.has(group.tableKey)) continue;

    scored.push({
      tableKey: group.tableKey,
      score: maxScore,
      oldestSentAtMs: group.oldestSentAtMs,
      manualPriority: manualPriorityKeys.has(group.tableKey),
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.oldestSentAtMs ?? 0) - (b.oldestSentAtMs ?? 0);
  });

  return scored.slice(0, maxFocus).map((entry) => entry.tableKey);
}
