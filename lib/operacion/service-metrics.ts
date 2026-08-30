import type { BarClassifiable } from "@/lib/kds/bar-classification";
import {
  KDS_OPERATION_STATION_FILTER_ALL,
  matchesKdsOperationStationSelection,
} from "@/lib/kds/operation-station-kds-filter";
import {
  isKdsBarBoardDestination,
  isKdsCocktailBoardDestination,
  isKdsKitchenDestination,
  resolveKdsDestination,
  type KdsRoutableItem,
} from "@/lib/kds/kds-destination";

export type ServiceScope = "kitchen" | "bar" | "cocktail" | "all";

export type ServiceMetricsItem = BarClassifiable &
  KdsRoutableItem & {
    operationStationId?: unknown;
    status?: unknown;
    sentAt?: unknown;
    preparedAt?: unknown;
    servedAt?: unknown;
  };

export type ServiceMetrics = {
  sent: number;
  prepared: number;
  served: number;
  avgPrepMinutes: number | null;
  avgServeMinutes: number | null;
};

const MAX_PLAUSIBLE_SERVICE_DURATION_MS = 12 * 60 * 60 * 1000;

function isPlausibleServiceDuration(durationMs: number): boolean {
  return durationMs >= 0 && durationMs <= MAX_PLAUSIBLE_SERVICE_DURATION_MS;
}

function readMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object") {
    const obj = v as {
      toMillis?: () => number;
      toDate?: () => Date;
    };
    if (typeof obj.toMillis === "function") {
      try {
        return obj.toMillis();
      } catch {
        /* ignore */
      }
    }
    if (typeof obj.toDate === "function") {
      try {
        return obj.toDate().getTime();
      } catch {
        /* ignore */
      }
    }
  }
  return undefined;
}

function normalizedStatus(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase();
}

function matchesScope(
  item: ServiceMetricsItem,
  scope: ServiceScope,
): boolean {
  if (scope === "all") return true;
  const dest = resolveKdsDestination(item);
  if (scope === "kitchen") return isKdsKitchenDestination(dest);
  if (scope === "cocktail") return isKdsCocktailBoardDestination(dest);
  return isKdsBarBoardDestination(dest);
}

export function computeServiceMetrics(
  items: ServiceMetricsItem[],
  scope: ServiceScope,
  selectedOperationStationId: string = KDS_OPERATION_STATION_FILTER_ALL,
): ServiceMetrics {
  let sent = 0;
  let prepared = 0;
  let served = 0;
  let prepSumMs = 0;
  let prepCount = 0;
  let serveSumMs = 0;
  let serveCount = 0;

  for (const it of items) {
    if (!matchesScope(it, scope)) continue;
    if (
      !matchesKdsOperationStationSelection(
        {
          operationStationId:
            typeof it.operationStationId === "string"
              ? it.operationStationId
              : undefined,
        },
        selectedOperationStationId,
      )
    ) {
      continue;
    }
    const st = normalizedStatus(it.status);
    if (st === "sent") sent += 1;
    else if (st === "prepared" || st === "ready") prepared += 1;
    else if (st === "served") served += 1;

    const sentMs = readMs(it.sentAt);
    const preparedMs = readMs(it.preparedAt);
    const servedMs = readMs(it.servedAt);

    const prepDurationMs =
      sentMs != null && preparedMs != null ? preparedMs - sentMs : null;
    if (prepDurationMs != null && isPlausibleServiceDuration(prepDurationMs)) {
      prepSumMs += prepDurationMs;
      prepCount += 1;
    }
    const serveDurationMs =
      preparedMs != null && servedMs != null ? servedMs - preparedMs : null;
    if (serveDurationMs != null && isPlausibleServiceDuration(serveDurationMs)) {
      serveSumMs += serveDurationMs;
      serveCount += 1;
    }
  }

  return {
    sent,
    prepared,
    served,
    avgPrepMinutes: prepCount > 0 ? prepSumMs / prepCount / 60000 : null,
    avgServeMinutes: serveCount > 0 ? serveSumMs / serveCount / 60000 : null,
  };
}

export function formatAvgMinutes(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded <= 0) return "<1 min";
  return `${rounded} min`;
}

const TERMINAL_ORDER_STATUSES = new Set([
  "closed",
  "paid",
  "cancelled",
  "canceled",
  "merged",
]);

export function isOrderActiveForMetrics(status: unknown): boolean {
  const s = normalizedStatus(status);
  if (!s) return true;
  return !TERMINAL_ORDER_STATUSES.has(s);
}
