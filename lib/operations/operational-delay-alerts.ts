import {
  resolveKdsDestination,
  type KdsDestination,
  type KdsRoutableItem,
} from "@/lib/kds/kds-destination";
import type { KdsSlaLevel, KdsStationKind } from "@/lib/kds/kds-sla";
import {
  DEFAULT_OPERATIONAL_ALERT_POLICY,
  isOperationalAlertEscalated,
  resolveOperationalAlertLevel,
  type OperationalAlertPolicy,
} from "@/lib/operations/operational-alert-policy";

export type OperationalDelayAlertLevel = Exclude<KdsSlaLevel, "normal">;

export type OperationalDelayAlert = {
  id: string;
  orderId: string;
  restaurantId: string;
  tableLabel: string;
  station: KdsStationKind;
  stationLabel: string;
  stationHref: string;
  level: OperationalDelayAlertLevel;
  escalated: boolean;
  elapsedMs: number;
  elapsedMinutes: number;
  oldestSentAtMs: number;
  delayedLineCount: number;
  thresholdMinutes: number;
  criticalThresholdMinutes: number;
  escalationAfterMinutes: number;
};

export type OperationalOrderRecord = {
  id: string;
  restaurantId?: unknown;
  table?: unknown;
  tableName?: unknown;
  tableId?: unknown;
  status?: unknown;
  items?: unknown;
};

const TERMINAL_ORDER_STATUSES = new Set(["closed", "paid", "cancelled", "canceled", "merged"]);
const ACTIVE_PRODUCTION_LINE_STATUSES = new Set(["sent", "preparing"]);

const STATION_META: Record<KdsStationKind, { label: string; href: string }> = {
  kitchen: { label: "Cocina", href: "/dashboard/operacion/cocina" },
  bar: { label: "Barra", href: "/dashboard/operacion/barra" },
  cocktail: { label: "Coctelería", href: "/dashboard/operacion/cocteleria" },
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedStatus(value: unknown): string {
  return text(value).toLowerCase();
}

function isOrderActive(status: unknown): boolean {
  const normalized = normalizedStatus(status);
  return !normalized || !TERMINAL_ORDER_STATUSES.has(normalized);
}

function isProductionLineActive(status: unknown): boolean {
  return ACTIVE_PRODUCTION_LINE_STATUSES.has(normalizedStatus(status));
}

function hasExplicitNoProductionDestination(item: Record<string, unknown>): boolean {
  return text(item.station).toLowerCase() === "none" || text(item.preparationArea).toLowerCase() === "none";
}

export function readOperationalTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (!value || typeof value !== "object") return null;
  if ("toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }
  if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    const millis = date?.getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  const seconds = Number((value as { seconds?: unknown }).seconds);
  const nanoseconds = Number((value as { nanoseconds?: unknown }).nanoseconds ?? 0);
  return Number.isFinite(seconds) && Number.isFinite(nanoseconds)
    ? seconds * 1000 + Math.floor(nanoseconds / 1_000_000)
    : null;
}

function stationFromDestination(destination: KdsDestination): KdsStationKind | null {
  if (destination === "kitchen" || destination === "bar" || destination === "cocktail") return destination;
  return null;
}

function tableLabel(order: OperationalOrderRecord): string {
  const direct = text(order.table) || text(order.tableName);
  if (direct) return direct;
  const tableId = text(order.tableId);
  return tableId ? `Mesa ${tableId}` : "Sin mesa";
}

function levelScore(level: OperationalDelayAlertLevel): number {
  return level === "critical" ? 2 : 1;
}

export function buildOperationalDelayAlerts({
  orders,
  restaurantId,
  nowMs,
  policy = DEFAULT_OPERATIONAL_ALERT_POLICY,
}: {
  orders: OperationalOrderRecord[];
  restaurantId: string;
  nowMs: number;
  policy?: OperationalAlertPolicy;
}): OperationalDelayAlert[] {
  const tenantId = restaurantId.trim();
  if (!tenantId || !Number.isFinite(nowMs) || !policy.enabled) return [];

  const alerts = new Map<string, OperationalDelayAlert>();
  for (const order of orders) {
    if (text(order.restaurantId) !== tenantId) continue;
    if (!isOrderActive(order.status) || !Array.isArray(order.items)) continue;

    for (const rawItem of order.items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      if (!isProductionLineActive(item.status) || hasExplicitNoProductionDestination(item)) continue;
      const sentAtMs = readOperationalTimestampMs(item.sentAt);
      if (sentAtMs == null || sentAtMs > nowMs) continue;

      const station = stationFromDestination(resolveKdsDestination(item as KdsRoutableItem));
      if (!station) continue;
      const elapsedMs = nowMs - sentAtMs;
      const level = resolveOperationalAlertLevel(elapsedMs, station, policy);
      if (level === "normal") continue;

      const key = `${order.id}:${station}`;
      const meta = STATION_META[station];
      const thresholds = policy.stations[station];
      const existing = alerts.get(key);
      const nextLevel: OperationalDelayAlertLevel = level;
      if (!existing) {
        alerts.set(key, {
          id: key,
          orderId: order.id,
          restaurantId: tenantId,
          tableLabel: tableLabel(order),
          station,
          stationLabel: meta.label,
          stationHref: meta.href,
          level: nextLevel,
          escalated: isOperationalAlertEscalated(elapsedMs, station, policy),
          elapsedMs,
          elapsedMinutes: Math.floor(elapsedMs / 60_000),
          oldestSentAtMs: sentAtMs,
          delayedLineCount: 1,
          thresholdMinutes: nextLevel === "critical" ? thresholds.criticalMinutes : thresholds.attentionMinutes,
          criticalThresholdMinutes: thresholds.criticalMinutes,
          escalationAfterMinutes: thresholds.criticalMinutes + thresholds.escalationMinutes,
        });
        continue;
      }

      existing.delayedLineCount += 1;
      if (sentAtMs < existing.oldestSentAtMs) {
        existing.oldestSentAtMs = sentAtMs;
        existing.elapsedMs = elapsedMs;
        existing.elapsedMinutes = Math.floor(elapsedMs / 60_000);
        existing.escalated = isOperationalAlertEscalated(elapsedMs, station, policy);
      }
      if (levelScore(nextLevel) > levelScore(existing.level)) {
        existing.level = nextLevel;
        existing.thresholdMinutes = nextLevel === "critical" ? thresholds.criticalMinutes : thresholds.attentionMinutes;
      }
    }
  }

  return Array.from(alerts.values()).sort((a, b) => {
    if (a.escalated !== b.escalated) return a.escalated ? -1 : 1;
    const levelDelta = levelScore(b.level) - levelScore(a.level);
    if (levelDelta !== 0) return levelDelta;
    const elapsedDelta = b.elapsedMs - a.elapsedMs;
    if (elapsedDelta !== 0) return elapsedDelta;
    return a.tableLabel.localeCompare(b.tableLabel, "es");
  });
}
