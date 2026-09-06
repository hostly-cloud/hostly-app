import type { Firestore } from "firebase-admin/firestore";
import type { Timestamp } from "firebase-admin/firestore";
import { isOrderStatusActiveForTableOccupancy } from "@/lib/firestore/order-table-occupancy";
import { summarizePaymentsForCierre } from "@/lib/payments/summarizePaymentsForCierre";
import type { ManagerAnalyticsContext } from "@/lib/ai/manager-analytics-types";

const DEFAULT_TZ = "Europe/Madrid";
const MAX_RANGE_DAYS = 31;

function cleanYmd(value: string): string {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error("INVALID_ANALYTICS_DATE");
  return v;
}

function ymdToUtcDay(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function addDaysYmd(ymd: string, delta: number): string {
  const date = ymdToUtcDay(ymd);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function daysInclusive(from: string, to: string): number {
  return Math.floor((ymdToUtcDay(to).getTime() - ymdToUtcDay(from).getTime()) / 86_400_000) + 1;
}

function readTsMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value) {
    const ms = (value as Timestamp).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate().getTime();
    } catch {
      return null;
    }
  }
  return null;
}

function timestampToYmd(ms: number, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function reservationBucket(docs: Array<Record<string, unknown>>, from: string, to: string) {
  let total = 0;
  let attended = 0;
  let noShow = 0;
  for (const data of docs) {
    const date = typeof data.date === "string" ? data.date : "";
    if (!date || date < from || date > to) continue;
    const status = String(data.status ?? "booked").trim().toLowerCase();
    if (status === "cancelled") continue;
    total += 1;
    if (status === "seated" || status === "completed") attended += 1;
    if (status === "no_show" || status === "noshow") noShow += 1;
  }
  return { total, attended, noShow, noShowRate: total > 0 ? noShow / total : 0 };
}

function paymentBucket(docs: Array<Record<string, unknown>>, from: string, to: string) {
  const selected = docs.filter((data) => {
    const ms = readTsMs(data.createdAt);
    if (ms == null) return false;
    const ymd = timestampToYmd(ms);
    return ymd >= from && ymd <= to;
  });
  const summary = summarizePaymentsForCierre(selected);
  const total = summary.totals.totalVentas;
  const payments = summary.paymentsCount;
  return {
    total,
    payments,
    averageTicket: payments > 0 ? total / payments : 0,
    cash: summary.byMethod.cash,
    card: summary.byMethod.card,
    voucher: summary.totalVoucher,
  };
}

function normalizeLineStatus(raw: unknown): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "ready") return "prepared";
  if (value === "new" || value === "") return "pending";
  return value;
}

function lineQty(item: Record<string, unknown>): number {
  const qty = Number(item.quantity ?? item.qty) || 0;
  return qty > 0 ? qty : 0;
}

export function resolveManagerAnalyticsRange(dateFrom: string, dateTo: string) {
  const from = cleanYmd(dateFrom);
  const to = cleanYmd(dateTo);
  if (from > to) throw new Error("INVALID_ANALYTICS_RANGE");
  const days = daysInclusive(from, to);
  if (days < 1 || days > MAX_RANGE_DAYS) throw new Error("ANALYTICS_RANGE_TOO_LARGE");
  const previousTo = addDaysYmd(from, -1);
  const previousFrom = addDaysYmd(previousTo, -(days - 1));
  return { from, to, days, previousFrom, previousTo };
}

export async function getManagerAnalyticsContext(params: {
  db: Firestore;
  restaurantId: string;
  dateFrom: string;
  dateTo: string;
}): Promise<ManagerAnalyticsContext> {
  const rid = params.restaurantId.trim();
  if (!rid) throw new Error("RESTAURANT_REQUIRED");
  const range = resolveManagerAnalyticsRange(params.dateFrom, params.dateTo);
  const alerts: string[] = [];

  let reservations: Array<Record<string, unknown>> = [];
  try {
    const snap = await params.db.collection("reservations").where("restaurantId", "==", rid).get();
    reservations = snap.docs.map((doc) => doc.data() as Record<string, unknown>);
  } catch {
    alerts.push("reservations_unavailable");
  }

  let payments: Array<Record<string, unknown>> = [];
  try {
    const snap = await params.db
      .collection("payments")
      .where("restaurantId", "==", rid)
      .where("status", "==", "paid")
      .get();
    payments = snap.docs.map((doc) => doc.data() as Record<string, unknown>);
  } catch {
    alerts.push("sales_unavailable");
  }

  let activeOrders = 0;
  let pendingItems = 0;
  let preparingItems = 0;
  let readyItems = 0;
  try {
    const snap = await params.db.collection("orders").where("restaurantId", "==", rid).get();
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const status = typeof data.status === "string" ? data.status : undefined;
      if (!isOrderStatusActiveForTableOccupancy(status)) continue;
      activeOrders += 1;
      if (!Array.isArray(data.items)) continue;
      for (const raw of data.items) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        const qty = lineQty(item);
        if (qty <= 0) continue;
        const lineStatus = normalizeLineStatus(item.status);
        if (lineStatus === "pending") pendingItems += qty;
        else if (lineStatus === "sent") preparingItems += qty;
        else if (lineStatus === "prepared") readyItems += qty;
      }
    }
  } catch {
    alerts.push("orders_unavailable");
  }

  const currentSales = paymentBucket(payments, range.from, range.to);
  const previousSales = paymentBucket(payments, range.previousFrom, range.previousTo);
  const currentReservations = reservationBucket(reservations, range.from, range.to);
  const previousReservations = reservationBucket(reservations, range.previousFrom, range.previousTo);

  return {
    range,
    sales: {
      ...currentSales,
      previousTotal: previousSales.total,
      previousPayments: previousSales.payments,
      previousAverageTicket: previousSales.averageTicket,
      deltaPercent: percentDelta(currentSales.total, previousSales.total),
      averageTicketDeltaPercent: percentDelta(currentSales.averageTicket, previousSales.averageTicket),
    },
    reservations: {
      ...currentReservations,
      previousTotal: previousReservations.total,
      previousNoShow: previousReservations.noShow,
      previousNoShowRate: previousReservations.noShowRate,
    },
    operations: { activeOrders, pendingItems, preparingItems, readyItems },
    dataQuality: { alerts },
  };
}
