import type { Firestore } from "firebase-admin/firestore";
import type { Timestamp } from "firebase-admin/firestore";
import { isOrderStatusActiveForTableOccupancy } from "@/lib/firestore/order-table-occupancy";
import { summarizePaymentsForCierre } from "@/lib/payments/summarizePaymentsForCierre";
import type { HostlyManagerDaySummary } from "@/lib/ai/types";

const DEFAULT_TZ = "Europe/Madrid";

/** YYYY-MM-DD “hoy” en la zona del restaurante (por defecto Madrid). */
export function formatBusinessYmd(d: Date = new Date(), timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function timestampMsToYmd(ms: number, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function readTsMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "toMillis" in v) {
    const ms = (v as Timestamp).toMillis();
    return typeof ms === "number" && Number.isFinite(ms) ? ms : undefined;
  }
  if (
    v &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof (v as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      return (v as { toDate: () => Date }).toDate().getTime();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Alineado con normalización en TPV (`normalizeOrderLineStatus`): pending | sent | prepared | served | cancelled.
 */
function normalizeLineStatus(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    s === "pending" ||
    s === "sent" ||
    s === "prepared" ||
    s === "served" ||
    s === "cancelled"
  ) {
    return s;
  }
  if (s === "ready") return "prepared";
  if (s === "new" || s === "") return "pending";
  return "pending";
}

function lineQty(it: Record<string, unknown>): number {
  const q = Number(it.quantity ?? it.qty) || 0;
  return q > 0 ? q : 0;
}

/**
 * Herramienta interna read-only: métricas del día para gerencia / futura IA.
 */
export async function getManagerDaySummary(params: {
  db: Firestore;
  restaurantId: string;
  /** YYYY-MM-DD; por defecto hoy (Madrid). */
  dateYmd?: string;
}): Promise<HostlyManagerDaySummary> {
  const rid = params.restaurantId.trim();
  const dateYmd = (params.dateYmd ?? formatBusinessYmd()).trim();
  const alerts: string[] = [];
  const insights: string[] = [];

  const reservations = {
    total: 0,
    booked: 0,
    seated: 0,
    completed: 0,
    noShow: 0,
  };

  try {
    const rs = await params.db
      .collection("reservations")
      .where("restaurantId", "==", rid)
      .where("date", "==", dateYmd)
      .get();

    for (const d of rs.docs) {
      const data = d.data() as Record<string, unknown>;
      const st = String(data.status ?? "booked").trim().toLowerCase();
      if (st === "cancelled") continue;
      reservations.total += 1;
      if (st === "booked") reservations.booked += 1;
      else if (st === "seated") reservations.seated += 1;
      else if (st === "completed") reservations.completed += 1;
      else if (st === "no_show" || st === "noshow") reservations.noShow += 1;
      else reservations.booked += 1;
    }
  } catch {
    alerts.push("reservations_unavailable");
  }

  let activeOrders = 0;
  let pendingItems = 0;
  let preparingItems = 0;
  let readyItems = 0;

  try {
    const os = await params.db
      .collection("orders")
      .where("restaurantId", "==", rid)
      .get();

    for (const d of os.docs) {
      const data = d.data() as {
        status?: unknown;
        items?: unknown;
      };
      const st = typeof data.status === "string" ? data.status : undefined;
      if (!isOrderStatusActiveForTableOccupancy(st)) continue;
      activeOrders += 1;

      if (!Array.isArray(data.items)) continue;
      for (const raw of data.items) {
        if (!raw || typeof raw !== "object") continue;
        const it = raw as Record<string, unknown>;
        const ls = normalizeLineStatus(it.status);
        if (ls === "cancelled") continue;
        const q = lineQty(it);
        if (q <= 0) continue;
        if (ls === "pending") pendingItems += q;
        else if (ls === "sent") preparingItems += q;
        else if (ls === "prepared") readyItems += q;
      }
    }

    if (pendingItems > 0) {
      insights.push(`${pendingItems} unidades pendientes de enviar a cocina/barra.`);
    }
    if (readyItems > 0) {
      insights.push(`${readyItems} unidades marcadas listas para servir.`);
    }
  } catch {
    alerts.push("orders_unavailable");
  }

  let salesTotal: number | null = null;
  let paymentsCount: number | null = null;

  try {
    const ps = await params.db
      .collection("payments")
      .where("restaurantId", "==", rid)
      .where("status", "==", "paid")
      .get();

    const todayPayments: unknown[] = [];
    for (const d of ps.docs) {
      const data = d.data() as Record<string, unknown>;
      const ms = readTsMs(data.createdAt);
      if (ms == null) continue;
      if (timestampMsToYmd(ms) !== dateYmd) continue;
      todayPayments.push({ id: d.id, ...data });
    }

    const summary = summarizePaymentsForCierre(todayPayments);
    salesTotal = summary.totals.totalVentas;
    paymentsCount = summary.paymentsCount;
  } catch {
    alerts.push("sales_unavailable");
    salesTotal = null;
    paymentsCount = null;
  }

  return {
    date: dateYmd,
    restaurantId: rid,
    reservations,
    orders: {
      active: activeOrders,
      pendingItems,
      preparingItems,
      readyItems,
    },
    sales: {
      total: salesTotal,
      payments: paymentsCount,
    },
    alerts,
    insights,
  };
}
