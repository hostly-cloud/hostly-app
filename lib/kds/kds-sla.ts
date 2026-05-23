export type KdsStationKind = "kitchen" | "bar" | "cocktail";

export type KdsSlaLevel = "normal" | "attention" | "critical";

const SLA_MINUTES: Record<
  KdsStationKind,
  { attention: number; critical: number }
> = {
  kitchen: { attention: 8, critical: 15 },
  bar: { attention: 3, critical: 6 },
  cocktail: { attention: 3, critical: 6 },
};

export function kdsSlaThresholds(station: KdsStationKind) {
  return SLA_MINUTES[station];
}

export function resolveKdsSlaLevel(
  elapsedMs: number,
  station: KdsStationKind,
): KdsSlaLevel {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return "normal";
  const min = elapsedMs / 60000;
  const { attention, critical } = SLA_MINUTES[station];
  if (min >= critical) return "critical";
  if (min >= attention) return "attention";
  return "normal";
}

export function kdsSlaScoreFromElapsedMs(
  elapsedMs: number,
  station: KdsStationKind,
): number {
  const level = resolveKdsSlaLevel(elapsedMs, station);
  if (level === "critical") return 2;
  if (level === "attention") return 1;
  return 0;
}

export function kdsSlaLevelLabel(level: KdsSlaLevel): string | null {
  if (level === "critical") return "Crítico";
  if (level === "attention") return "Atención";
  return null;
}

export function kdsSlaProgressRatio(
  elapsedMs: number,
  station: KdsStationKind,
): number {
  const { critical } = SLA_MINUTES[station];
  if (!Number.isFinite(elapsedMs) || critical <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedMs / 60000 / critical));
}
