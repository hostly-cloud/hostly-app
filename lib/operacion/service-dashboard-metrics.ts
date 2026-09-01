import {
  computeServiceMetrics,
  type ServiceMetricsItem,
} from "@/lib/operacion/service-metrics";

export type ServiceDashboardOrder = {
  id: string;
  createdAt?: unknown;
  tableId?: string | null;
  tableName?: string | null;
  items: ServiceMetricsItem[];
};

export type DelayedServiceOrder = {
  orderId: string;
  tableId: string | null;
  tableName: string;
  delayedLines: number;
  maxDelayMinutes: number;
};

export type SlowServiceTable = {
  tableName: string;
  avgPrepMinutes: number;
  completedLines: number;
};

export type ServiceDashboardMetrics = {
  orderCount: number;
  lineCount: number;
  sent: number;
  prepared: number;
  served: number;
  avgPrepMinutes: number | null;
  avgServeMinutes: number | null;
  delayedLineCount: number;
  delayedOrders: DelayedServiceOrder[];
  slowestTables: SlowServiceTable[];
};

const PRODUCTION_STATUSES = new Set(["sent", "prepared", "ready", "served"]);
const MAX_PLAUSIBLE_SERVICE_DURATION_MS = 12 * 60 * 60 * 1000;

function readMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return undefined;

  const timestamp = value as {
    toMillis?: () => number;
    toDate?: () => Date;
  };
  try {
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.toDate === "function") return timestamp.toDate().getTime();
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function startOfDayMs(day: Date): number {
  const value = new Date(day);
  value.setHours(0, 0, 0, 0);
  return value.getTime();
}

function endOfDayMs(day: Date): number {
  const value = new Date(day);
  value.setHours(23, 59, 59, 999);
  return value.getTime();
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isPlausibleDuration(durationMs: number): boolean {
  return durationMs >= 0 && durationMs <= MAX_PLAUSIBLE_SERVICE_DURATION_MS;
}

function tableLabel(order: ServiceDashboardOrder): string {
  const name = typeof order.tableName === "string" ? order.tableName.trim() : "";
  return name || "Sin mesa";
}

export function buildServiceDashboardMetrics(
  orders: ServiceDashboardOrder[],
  selectedDate: Date,
  nowMs: number,
  delayThresholdMinutes = 20,
): ServiceDashboardMetrics {
  const dayStart = startOfDayMs(selectedDate);
  const dayEnd = endOfDayMs(selectedDate);
  const thresholdMs = delayThresholdMinutes * 60_000;
  const selectedIsToday = isSameLocalDay(selectedDate, new Date(nowMs));
  const selectedItems: Array<{
    order: ServiceDashboardOrder;
    item: ServiceMetricsItem;
    status: string;
    sentMs?: number;
    preparedMs?: number;
  }> = [];

  for (const order of orders) {
    const orderCreatedMs = readMs(order.createdAt);
    for (const item of order.items) {
      const status = normalizeStatus(item.status);
      if (!PRODUCTION_STATUSES.has(status)) continue;

      const sentMs = readMs(item.sentAt);
      const activityMs = sentMs ?? orderCreatedMs;
      if (activityMs == null || activityMs < dayStart || activityMs > dayEnd) continue;

      selectedItems.push({
        order,
        item,
        status,
        sentMs,
        preparedMs: readMs(item.preparedAt),
      });
    }
  }

  const base = computeServiceMetrics(
    selectedItems.map((row) => row.item),
    "all",
  );
  const orderIds = new Set(selectedItems.map((row) => row.order.id));
  const delayedByOrder = new Map<string, DelayedServiceOrder>();
  const prepByTable = new Map<string, { sumMs: number; count: number }>();

  for (const row of selectedItems) {
    const { order, sentMs, preparedMs, status } = row;
    let delayMs: number | null = null;

    if (sentMs != null && preparedMs != null) {
      const completedDuration = preparedMs - sentMs;
      if (isPlausibleDuration(completedDuration)) {
        const label = tableLabel(order);
        const table = prepByTable.get(label) ?? { sumMs: 0, count: 0 };
        table.sumMs += completedDuration;
        table.count += 1;
        prepByTable.set(label, table);
        if (completedDuration > thresholdMs) delayMs = completedDuration;
      }
    } else if (selectedIsToday && status === "sent" && sentMs != null) {
      const activeDuration = nowMs - sentMs;
      if (isPlausibleDuration(activeDuration) && activeDuration > thresholdMs) {
        delayMs = activeDuration;
      }
    }

    if (delayMs == null) continue;
    const existing = delayedByOrder.get(order.id);
    const delayMinutes = Math.floor(delayMs / 60_000);
    delayedByOrder.set(order.id, {
      orderId: order.id,
      tableId:
        typeof order.tableId === "string" && order.tableId.trim()
          ? order.tableId.trim()
          : null,
      tableName: tableLabel(order),
      delayedLines: (existing?.delayedLines ?? 0) + 1,
      maxDelayMinutes: Math.max(existing?.maxDelayMinutes ?? 0, delayMinutes),
    });
  }

  const delayedOrders = [...delayedByOrder.values()].sort(
    (left, right) => right.maxDelayMinutes - left.maxDelayMinutes,
  );
  const slowestTables = [...prepByTable.entries()]
    .map(([name, value]) => ({
      tableName: name,
      avgPrepMinutes: Math.round(value.sumMs / value.count / 60_000),
      completedLines: value.count,
    }))
    .sort((left, right) => right.avgPrepMinutes - left.avgPrepMinutes)
    .slice(0, 3);

  return {
    orderCount: orderIds.size,
    lineCount: selectedItems.length,
    sent: base.sent,
    prepared: base.prepared,
    served: base.served,
    avgPrepMinutes: base.avgPrepMinutes,
    avgServeMinutes: base.avgServeMinutes,
    delayedLineCount: delayedOrders.reduce((sum, row) => sum + row.delayedLines, 0),
    delayedOrders: delayedOrders.slice(0, 5),
    slowestTables,
  };
}
