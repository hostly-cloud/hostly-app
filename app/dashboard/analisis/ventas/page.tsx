"use client";

import { Timestamp, collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";
import { summarizePaymentsForCierre } from "@/lib/payments/summarizePaymentsForCierre";

type PaymentDoc = {
  id: string;
  createdAt?: unknown;
  status?: string;
  restaurantId?: string;
  waiterId?: string;
  waiterEmail?: string;
  userId?: string;
  createdBy?: string;
  paymentMethod?: string;
  ticketNumber?: string;
  voucherNumber?: string;
  total?: unknown;
  finalTotal?: unknown;
  discountTotal?: unknown;
  tip?: unknown;
  received?: unknown;
};

function readTsMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (
    v &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  return undefined;
}

function startOfTodayMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfTodayMs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfDayMs(d: Date): number {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out.getTime();
}

function endOfDayMs(d: Date): number {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out.getTime();
}

function startOfYesterdayMs(): number {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return startOfDayMs(d);
}

function endOfYesterdayMs(): number {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return endOfDayMs(d);
}

function ymdStartMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(yyyy, mm - 1, dd);
  if (!Number.isFinite(d.getTime())) return null;
  return startOfDayMs(d);
}

function ymdEndMs(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(yyyy, mm - 1, dd);
  if (!Number.isFinite(d.getTime())) return null;
  return endOfDayMs(d);
}

function isCreatedToday(createdAt: unknown): boolean {
  const ms = readTsMs(createdAt);
  if (ms == null) return false;
  return ms >= startOfTodayMs() && ms <= endOfTodayMs();
}

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

function formatEur(amount: number): string {
  return `${amount.toFixed(2)} €`;
}

function formatTime(ms: number | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatNumberEU(value: unknown): string {
  return Number(value || 0).toFixed(2).replace(".", ",");
}

export default function AnalisisVentasPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const [payments, setPayments] = useState<PaymentDoc[]>([]);
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "range">(
    "today",
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isPrintReady, setIsPrintReady] = useState(false);
  const [shiftFilter, setShiftFilter] = useState<
    "all" | "morning" | "afternoon" | "night"
  >("all");
  const [paymentFilter, setPaymentFilter] = useState<
    "all" | "cash" | "card" | "voucher"
  >("all");

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;

    const q = query(
      collection(db, "payments"),
      where("restaurantId", "==", restaurantId),
      where("status", "==", "paid"),
    );

    let cancelled = false;
    const unsub = onSnapshot(q, (snapshot) => {
      if (cancelled) return;
      const list = snapshot.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            createdAt: data.createdAt,
            status: typeof data.status === "string" ? data.status : undefined,
            restaurantId:
              typeof data.restaurantId === "string" ? data.restaurantId : undefined,
            waiterId: typeof data.waiterId === "string" ? data.waiterId : undefined,
            waiterEmail:
              typeof data.waiterEmail === "string" ? data.waiterEmail : undefined,
            userId: typeof data.userId === "string" ? data.userId : undefined,
            createdBy:
              typeof data.createdBy === "string" ? data.createdBy : undefined,
            paymentMethod:
              typeof data.paymentMethod === "string" ? data.paymentMethod : undefined,
            ticketNumber:
              typeof data.ticketNumber === "string" ? data.ticketNumber : undefined,
            voucherNumber:
              typeof data.voucherNumber === "string" ? data.voucherNumber : undefined,
            total: data.total,
            finalTotal: data.finalTotal,
            discountTotal: data.discountTotal,
            tip: data.tip,
            received: data.received,
          } satisfies PaymentDoc;
        })
        .sort((a, b) => (readTsMs(b.createdAt) ?? 0) - (readTsMs(a.createdAt) ?? 0));
      setPayments(list);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, restaurantId]);

  const filteredPayments = useMemo(() => {
    let fromMs = startOfTodayMs();
    let toMs = endOfTodayMs();

    if (dateFilter === "yesterday") {
      fromMs = startOfYesterdayMs();
      toMs = endOfYesterdayMs();
    }

    if (dateFilter === "range") {
      const from = ymdStartMs(dateFrom);
      const to = ymdEndMs(dateTo);
      if (from != null) fromMs = from;
      if (to != null) toMs = to;
    }

    const lo = Math.min(fromMs, toMs);
    const hi = Math.max(fromMs, toMs);

    const baseFilteredPayments = payments.filter((p) => {
      const ms = readTsMs(p.createdAt);
      if (ms == null) return false;
      return ms >= lo && ms <= hi;
    });

    const getShift = (date: Date) => {
      const h = date.getHours();
      if (h >= 6 && h < 14) return "morning";
      if (h >= 14 && h < 20) return "afternoon";
      return "night";
    };

    return baseFilteredPayments.filter((p) => {
      if (shiftFilter === "all") return true;
      const ms = readTsMs(p.createdAt);
      if (ms == null) return false;
      return getShift(new Date(ms)) === shiftFilter;
    }).filter((p) => {
      if (paymentFilter === "all") return true;
      return (p.paymentMethod ?? "").toLowerCase() === paymentFilter;
    });
  }, [dateFilter, dateFrom, dateTo, payments, paymentFilter, shiftFilter]);

  const { totals, byMethod, totalVoucher, paymentsCount } = useMemo(
    () => summarizePaymentsForCierre(filteredPayments),
    [filteredPayments],
  );

  const avgTicket = paymentsCount > 0 ? totals.totalVentas / paymentsCount : 0;

  const salesByHour = useMemo(() => {
    const out = Array.from({ length: 24 }, (_, h) => ({ hour: h, total: 0 }));
    for (const p of filteredPayments) {
      const ms = readTsMs(p.createdAt);
      if (ms == null) continue;
      const hour = new Date(ms).getHours();
      if (hour < 0 || hour > 23) continue;
      out[hour]!.total += paymentSaleAmount(p);
    }
    const max = Math.max(1, ...out.map((x) => x.total));
    return { rows: out, max };
  }, [filteredPayments]);

  const getDateLabel = () => {
    if (dateFilter === "today") return "Hoy";
    if (dateFilter === "yesterday") return "Ayer";
    if (dateFilter === "range") {
      if (!dateFrom || !dateTo) return "Rango";
      return `${new Date(dateFrom).toLocaleDateString("es-ES")} - ${new Date(dateTo).toLocaleDateString("es-ES")}`;
    }
    return "";
  };
  const dateLabel = getDateLabel();

  const getShiftLabel = () => {
    if (shiftFilter === "morning") return "Mañana";
    if (shiftFilter === "afternoon") return "Tarde";
    if (shiftFilter === "night") return "Noche";
    return "Todo el día";
  };

  const waiterEntries = useMemo(() => {
    const salesByWaiter: Record<
      string,
      { total: number; tips: number; count: number; email: string | null }
    > = {};

    for (const p of filteredPayments) {
      const waiterId = p.waiterId || p.userId || p.createdBy || "unknown";
      if (!salesByWaiter[waiterId]) {
        salesByWaiter[waiterId] = { total: 0, tips: 0, count: 0, email: p.waiterEmail || null };
      }
      salesByWaiter[waiterId]!.total += paymentSaleAmount(p);
      salesByWaiter[waiterId]!.tips += n(p.tip);
      salesByWaiter[waiterId]!.count += 1;
    }

    return Object.entries(salesByWaiter).sort((a, b) => b[1].total - a[1].total);
  }, [filteredPayments]);

  const handleExportCSV = () => {
    const headers = [
      "Ticket",
      "Fecha",
      "Total",
      "Cobrado",
      "Propina",
      "Descuentos",
      "Método",
      "Camarero",
      "Voucher",
    ];

    const rows = filteredPayments.map((p) => {
      const ms = readTsMs(p.createdAt);
      const dateLabel = ms ? new Date(ms).toLocaleString("es-ES") : "";
      return [
        p.ticketNumber || "",
        dateLabel,
        formatNumberEU(paymentSaleAmount(p)),
        formatNumberEU(p.received),
        formatNumberEU(p.tip),
        formatNumberEU(p.discountTotal ?? 0),
        (p.paymentMethod ?? "").toLowerCase() === "cash"
          ? "Efectivo"
          : (p.paymentMethod ?? "").toLowerCase() === "voucher"
            ? "Voucher"
            : "Tarjeta",
        p.waiterEmail || p.waiterId || "",
        p.voucherNumber || "",
      ];
    });

    const csvTotals = summarizePaymentsForCierre(filteredPayments).totals;

    const totalsRow = [
      "TOTAL",
      "",
      formatNumberEU(csvTotals.totalVentas),
      formatNumberEU(csvTotals.totalCobrado),
      formatNumberEU(csvTotals.totalPropinas),
      formatNumberEU(csvTotals.totalDiscounts),
      "",
      "",
      "",
    ];

    const csvLine = (r: Array<string | number>) =>
      r
        .map((cell) => {
          const raw = String(cell ?? "");
          const safe = raw.replaceAll('"', '""');
          return `"${safe}"`;
        })
        .join(";");

    const csvContent = [headers, ...rows, [], totalsRow]
      .map((r) => csvLine(r as Array<string | number>))
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "ventas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <ModulePageShell title="Ventas">
      <div style={{ display: "grid", gap: 16 }}>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setDateFilter("today")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              dateFilter === "today"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setDateFilter("yesterday")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              dateFilter === "yesterday"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Ayer
          </button>
          <button
            type="button"
            onClick={() => setDateFilter("range")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              dateFilter === "range"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Rango
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setShiftFilter("all")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              shiftFilter === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Todo
          </button>
          <button
            type="button"
            onClick={() => setShiftFilter("morning")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              shiftFilter === "morning"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Mañana
          </button>
          <button
            type="button"
            onClick={() => setShiftFilter("afternoon")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              shiftFilter === "afternoon"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Tarde
          </button>
          <button
            type="button"
            onClick={() => setShiftFilter("night")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              shiftFilter === "night"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Noche
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setPaymentFilter("all")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              paymentFilter === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setPaymentFilter("cash")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              paymentFilter === "cash"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Efectivo
          </button>
          <button
            type="button"
            onClick={() => setPaymentFilter("card")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              paymentFilter === "card"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Tarjeta
          </button>
          <button
            type="button"
            onClick={() => setPaymentFilter("voucher")}
            className={`rounded-lg px-3 py-2 text-sm border ${
              paymentFilter === "voucher"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200"
            }`}
          >
            Voucher
          </button>
        </div>

        {dateFilter === "range" && (
          <div className="flex gap-2 mb-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">Ventas del día</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatEur(totals.totalVentas)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">Propinas</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatEur(totals.totalPropinas)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">Total cobrado</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {formatEur(totals.totalCobrado)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">Ticket medio</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {avgTicket.toFixed(2)} €
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm text-slate-500">Tickets</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">
              {paymentsCount}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div className="bg-white p-3 rounded-xl shadow">
            <div className="text-sm text-gray-500">Efectivo</div>
            <div className="text-lg font-semibold">{byMethod.cash.toFixed(2)} €</div>
          </div>

          <div className="bg-white p-3 rounded-xl shadow">
            <div className="text-sm text-gray-500">Tarjeta</div>
            <div className="text-lg font-semibold">{byMethod.card.toFixed(2)} €</div>
          </div>

          <div className="bg-white p-3 rounded-xl shadow">
            <div className="text-sm text-gray-500">Voucher</div>
            <div className="text-lg font-semibold">{totalVoucher.toFixed(2)} €</div>
          </div>

          <div className="bg-white p-3 rounded-xl shadow">
            <div className="text-sm text-gray-500">Propinas</div>
            <div className="text-lg font-semibold text-green-600">
              {byMethod.tips.toFixed(2)} €
            </div>
          </div>

          <div className="bg-white p-3 rounded-xl shadow">
            <div className="text-sm text-gray-500">Descuentos</div>
            <div className="text-lg font-semibold text-red-600">
              -{formatNumberEU(totals.totalDiscounts)} €
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium mb-2">Ventas por hora</div>

          <div className="space-y-1">
            {salesByHour.rows.map((h) => (
              <div key={h.hour} className="flex items-center gap-2">
                <div className="w-10 text-xs text-gray-500">{h.hour}:00</div>

                <div className="flex-1 bg-gray-100 rounded h-3">
                  <div
                    className="bg-blue-500 h-3 rounded"
                    style={{
                      width: `${(h.total / salesByHour.max) * 100}%`,
                    }}
                  />
                </div>

                <div className="w-14 text-right text-xs">{h.total.toFixed(0)}€</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-medium mb-2">Ventas por camarero</div>

          <div className="space-y-2">
            {waiterEntries.map(([id, w]) => (
              <div
                key={id}
                className="flex justify-between items-center bg-white p-3 rounded-xl shadow"
              >
                <div>
                  <div className="font-medium">
                    {w.email ? w.email.split("@")[0] : id}
                  </div>
                  <div className="text-xs text-gray-500">
                    {w.email || "Sin email"} · {w.count} tickets
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-semibold">{w.total.toFixed(2)} €</div>
                  <div className="text-xs text-green-600">
                    {w.tips.toFixed(2)} € propinas
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Últimos pagos</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPrintReady(true);
                  window.requestAnimationFrame(() => window.print());
                }}
                className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm"
              >
                Imprimir cierre
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm"
              >
                Exportar CSV
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-2">
            {filteredPayments.slice(0, 30).map((p) => {
              const ms = readTsMs(p.createdAt);
              const method = (p.paymentMethod ?? "").toLowerCase();
              const methodLabel =
                method === "cash"
                  ? "Efectivo"
                  : method === "card"
                    ? "Tarjeta"
                    : method === "voucher"
                      ? "Voucher"
                      : "—";
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {p.ticketNumber ?? "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatTime(ms)} · {methodLabel}
                    </div>
                    {method === "voucher" && p.voucherNumber && (
                      <div className="text-xs text-gray-500">Voucher: {p.voucherNumber}</div>
                    )}
                  </div>

                  <div className="flex items-baseline gap-3">
                    <div className="text-sm font-semibold text-slate-900">
                      {formatEur(paymentSaleAmount(p))}
                    </div>
                    <div className="text-xs text-slate-500">Tip {formatEur(n(p.tip))}</div>
                  </div>
                </div>
              );
            })}

            {filteredPayments.length === 0 && (
              <div className="text-sm text-slate-500">Sin pagos.</div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          #print-cierre,
          #print-cierre * {
            visibility: visible;
          }

          #print-cierre {
            position: absolute;
            left: 0;
            top: 0;
            width: 80mm;
            background: white;
          }

          @page {
            size: 80mm auto;
            margin: 0;
          }
        }
      `}</style>

      <div id="print-cierre" className="hidden print:block">
        <div className="p-4 font-mono text-sm">
          <div className="text-center font-bold mb-2">CIERRE DE CAJA</div>
          <div className="text-center text-xs mb-2">{dateLabel}</div>
          <div className="text-center text-xs mb-2">{getShiftLabel()}</div>

          <div className="mb-2">{new Date().toLocaleString("es-ES")}</div>

          <div className="border-t border-b py-2 my-2">
            <div>Ventas: {formatNumberEU(totals.totalVentas)} €</div>
            <div>Descuentos: -{formatNumberEU(totals.totalDiscounts)} €</div>
            <div>Cobrado: {formatNumberEU(totals.totalCobrado)} €</div>
            <div>Propinas: {formatNumberEU(totals.totalPropinas)} €</div>
            <div>Efectivo: {formatNumberEU(byMethod.cash)} €</div>
            <div>Tarjeta: {formatNumberEU(byMethod.card)} €</div>
            <div>Voucher: {formatNumberEU(totalVoucher)} €</div>
            <div>Tickets: {paymentsCount}</div>
            <div>Ticket medio: {formatNumberEU(avgTicket)} €</div>
          </div>
        </div>
      </div>
    </ModulePageShell>
  );
}

