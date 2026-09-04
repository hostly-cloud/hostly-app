import {
  resolveKdsDestination,
  type KdsDestination,
  type KdsRoutableItem,
} from "@/lib/kds/kds-destination";
import {
  kdsSlaThresholds,
  resolveKdsSlaLevel,
  type KdsSlaLevel,
  type KdsStationKind,
} from "@/lib/kds/kds-sla";

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
  elapsedMs: number;
  elapsedMinutes: number;
  oldestSentAtMs: number;
  delayedLineCount: number;
  thresholdMinutes: number;
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

const TERMINAL_ORDER_STATUSES = new Set([
  "closed",
  "paid",
  "cancelled",
  "canceled",
  "merged",
]);

const ACTIVE_PRODUCTION_LINE_STATUSES = new Set(["sent", "preparing"]);

const STATION_META: Record<
  KdsStationKind,
  { label: string; href: string }
> = {
  kitchen: { label: "Cocina", href: "/dashboard/operacion/cocina" },
  bar: { label: "Barra", href: "/dashboard/operacion/barra" },
  cocktail: {
    label: "Coctelería",
    href: "/dashboard/operacion/cocteleria",
  },
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

export function readOperationalTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (!value || typeof value !== "object") return null;

  if (
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : null;
  }

  if (
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    const millis = date?.getTime();
    return Number.isFinite(millis) ? millis : null;
  }

  const seconds = Number((value as { seconds?: unknown }).seconds);
  const nanoseconds = Number((value as { nanoseconds?: unknown }).nanoseconds ?? 0);
  if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) {
    return seconds * 1000 + Math.floor(nanoseconds / 1_000_000);
  }

  return null;
}

function stationFromDestination(
  destination: KdsDestination,
): KdsStationKind | null {
  if (destination === "kitchen") return "kitchen";
  if (destination === "bar") return "bar";
  if (destination === "cocktail") return "cocktail";
  return null;
}

function tableLabel(order: OperationalOrderRecord): string {
  const direct = text(order.table) || text(order.tableName);
  if (direct) return direct;
  const tableId = text(order.tableId);
  if (tableId) return `Mesa ${tableId}`;
  return "Sin mesa";
}

function levelScore(level: OperationalDelayAlertLevel): number {
  return level === "critical" ? 2 : 1;
}

type MutableAlert = OperationalDelayAlert;

export function buildOperationalDelayAlerts({
  orders,
  restaurantId,
  nowMs,
}: {
  orders: OperationalOrderRecord[];
  restaurantId: string;
  nowMs: number;
}): OperationalDelayAlert[] {
  const tenantId = restaurantId.trim();
  if (!tenantId || !Number.isFinite(nowMs)) return [];

  const alerts = new Map<string, MutableAlert>();

  for (const order of orders) {
    if (text(order.restaurantId) !== tenantId) continue;
    if (!isOrderActive(order.status)) continue;
    if (!Array.isArray(order.items)) continue;

    for (const rawItem of order.items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      if (!isProductionLineActive(item.status)) continue;

      const sentAtMs = readOperationalTimestampMs(item.sentAt);
      if (sentAtMs == null || sentAtMs > nowMs) continue;

      const station = stationFromDestination(
        resolveKdsDestination(item as KdsRoutableItem),
      );
      if (!station) continue;

      const elapsedMs = nowMs - sentAtMs;
      const level = resolveKdsSlaLevel(elapsedMs, station);
      if (level === "normal") continue;

      const key = `${order.id}:${station}`;
      const meta = STATION_META[station];
      const thresholds = kdsSlaThresholds(station);
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
          elapsedMs,
          elapsedMinutes: Math.floor(elapsedMs / 60_000),
          oldestSentAtMs: sentAtMs,
          delayedLineCount: 1,
          thresholdMinutes:
            nextLevel === "critical" ? thresholds.critical : thresholds.attention,
        });
        continue;
      }

      existing.delayedLineCount += 1;
      if (sentAtMs < existing.oldestSentAtMs) {
        existing.oldestSentAtMs = sentAtMs;
        existing.elapsedMs = elapsedMs;
        existing.elapsedMinutes = Math.floor(elapsedMs / 60_000);
      }
      if (levelScore(nextLevel) > levelScore(existing.level)) {
        existing.level = nextLevel;
        existing.thresholdMinutes =
          nextLevel === "critical" ? thresholds.critical : thresholds.attention;
      }
    }
  }

  return Array.from(alerts.values()).sort((a, b) => {
    const levelDelta = levelScore(b.level) - levelScore(a.level);
    if (levelDelta !== 0) return levelDelta;
    const elapsedDelta = b.elapsedMs - a.elapsedMs;
    if (elapsedDelta !== 0) return elapsedDelta;
    return a.tableLabel.localeCompare(b.tableLabel, "es");
  });
}
