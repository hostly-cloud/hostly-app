"use client";

import { Timestamp, collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import ModulePageShell from "@/components/module-page-shell";
import {
  HostlyKpiCard,
  HostlySegmentedControl,
  HostlySurface,
  hostlySegmentTabClassName,
} from "@/components/ui/hostly";
import { AnalyticsDateRangeFields } from "@/components/analysis/AnalyticsDateRangeFields";
import { useAuth } from "@/components/auth/auth-context";
import {
  countDistinctPaidSales,
  paidSaleIdentity,
} from "@/lib/analytics/sales-payment-analytics";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";
import { summarizePaymentsForCierre } from "@/lib/payments/summarizePaymentsForCierre";

type PaymentDoc = {
  id: string;
  orderId?: string;
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
};

function paymentMethodLabel(method: string | undefined): string {
  const normalized = (method ?? "").toLowerCase();
  if (normalized === "cash") return "Efectivo";
  if (normalized === "card") return "Tarjeta";
  if (normalized === "voucher") return "Voucher";
  return "Sin indicar";
}

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
  const [paymentsState, setPaymentsState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "range">(
    "today",
  );
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [shiftFilter, setShiftFilter] = useState<
    "all" | "morning" | "afternoon" | "night"
  >("all");
  const [paymentFilter, setPaymentFilter] = useState<
    "all" | "cash" | "card" | "voucher"
  >("all");

  useEffect(() => {
    if (!authReady) return;
    if (!isFirebaseConfigured || !restaurantId) {
      queueMicrotask(() => {
        setPayments([]);
        setPaymentsState("ready");
      });
      return;
    }

    queueMicrotask(() => setPaymentsState("loading"));

    const q = query(
      collection(db, "payments"),
      where("restaurantId", "==", restaurantId),
      where("status", "==", "paid"),
    );

    let cancelled = false;
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        if (cancelled) return;
        const list = snapshot.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              orderId: typeof data.orderId === "string" ? data.orderId : undefined,
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
            } satisfies PaymentDoc;
          })
          .sort((a, b) => (readTsMs(b.createdAt) ?? 0) - (readTsMs(a.createdAt) ?? 0));
        setPayments(list);
        setPaymentsState("ready");
      },
      (error) => {
        if (cancelled) return;
        console.error("AnalisisVentasPage payments listener error", error);
        setPayments([]);
        setPaymentsState("error");
      },
    );

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

  const { totals, byMethod, totalVoucher } = useMemo(
    () => summarizePaymentsForCierre(filteredPayments),
    [filteredPayments],
  );

  const ticketsCount = useMemo(
    () => countDistinctPaidSales(filteredPayments),
    [filteredPayments],
  );
  const avgTicket = ticketsCount > 0 ? totals.totalVentas / ticketsCount : 0;

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
      { total: number; tips: number; ticketIds: Set<string>; email: string | null }
    > = {};

    for (const p of filteredPayments) {
      const waiterId = p.waiterId || p.userId || p.createdBy || "unknown";
      if (!salesByWaiter[waiterId]) {
        salesByWaiter[waiterId] = {
          total: 0,
          tips: 0,
          ticketIds: new Set<string>(),
          email: p.waiterEmail || null,
        };
      }
      salesByWaiter[waiterId]!.total += paymentSaleAmount(p);
      salesByWaiter[waiterId]!.tips += n(p.tip);
      salesByWaiter[waiterId]!.ticketIds.add(paidSaleIdentity(p));
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
        formatNumberEU(paymentSaleAmount(p) + n(p.tip)),
        formatNumberEU(p.tip),
        formatNumberEU(p.discountTotal ?? 0),
        paymentMethodLabel(p.paymentMethod),
        p.waiterEmail || "Equipo",
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
    <ModulePageShell title="Ventas" compactLayout operationalFocus maxWidth={1400}>
      <div className="hostly-analytics-stack">
        <div className="hostly-analytics-toolbar">
          <div className="hostly-analytics-toolbar__filters">
            <HostlySegmentedControl aria-label="Filtro de fecha" scrollable={false}>
              <button
                type="button"
                role="tab"
                aria-selected={dateFilter === "today"}
                onClick={() => setDateFilter("today")}
                className={hostlySegmentTabClassName()}
              >
                Hoy
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dateFilter === "yesterday"}
                onClick={() => setDateFilter("yesterday")}
                className={hostlySegmentTabClassName()}
              >
                Ayer
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dateFilter === "range"}
                onClick={() => setDateFilter("range")}
                className={hostlySegmentTabClassName()}
              >
                Rango
              </button>
            </HostlySegmentedControl>

            <HostlySegmentedControl aria-label="Filtro de turno" scrollable={false}>
              <button
                type="button"
                role="tab"
                aria-selected={shiftFilter === "all"}
                onClick={() => setShiftFilter("all")}
                className={hostlySegmentTabClassName()}
              >
                Todo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={shiftFilter === "morning"}
                onClick={() => setShiftFilter("morning")}
                className={hostlySegmentTabClassName()}
              >
                Mañana
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={shiftFilter === "afternoon"}
                onClick={() => setShiftFilter("afternoon")}
                className={hostlySegmentTabClassName()}
              >
                Tarde
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={shiftFilter === "night"}
                onClick={() => setShiftFilter("night")}
                className={hostlySegmentTabClassName()}
              >
                Noche
              </button>
            </HostlySegmentedControl>

            <HostlySegmentedControl aria-label="Filtro de pago" scrollable={false}>
              <button
                type="button"
                role="tab"
                aria-selected={paymentFilter === "all"}
                onClick={() => setPaymentFilter("all")}
                className={hostlySegmentTabClassName()}
              >
                Todos
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paymentFilter === "cash"}
                onClick={() => setPaymentFilter("cash")}
                className={hostlySegmentTabClassName()}
              >
                Efectivo
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paymentFilter === "card"}
                onClick={() => setPaymentFilter("card")}
                className={hostlySegmentTabClassName()}
              >
                Tarjeta
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={paymentFilter === "voucher"}
                onClick={() => setPaymentFilter("voucher")}
                className={hostlySegmentTabClassName()}
              >
                Voucher
              </button>
            </HostlySegmentedControl>

            {dateFilter === "range" ? (
              <AnalyticsDateRangeFields
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
              />
            ) : null}
          </div>

          <div className="hostly-analytics-toolbar__actions">
            <button
              type="button"
              disabled={paymentsState !== "ready"}
              onClick={() => {
                window.requestAnimationFrame(() => window.print());
              }}
              className="hostly-button-secondary hostly-button-compact"
            >
              Imprimir cierre
            </button>
            <button
              type="button"
              disabled={paymentsState !== "ready"}
              onClick={handleExportCSV}
              className="hostly-button-secondary hostly-button-compact"
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {paymentsState === "loading" ? (
          <div className="hostly-panel p-4" role="status" aria-live="polite">
            <div className="hostly-muted text-sm">Cargando cobros confirmados…</div>
          </div>
        ) : paymentsState === "error" ? (
          <div className="hostly-panel p-4" role="alert">
            <div className="hostly-muted text-sm leading-relaxed">
              No se pudieron cargar los cobros. Revisa tu conexión o tus permisos e inténtalo de nuevo.
            </div>
          </div>
        ) : (
          <>
        <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--analytics hostly-kpi-grid-unified--5">
          <HostlyKpiCard title="Ventas" value={formatEur(totals.totalVentas)} helper={dateLabel} />
          <HostlyKpiCard title="Propinas" value={formatEur(totals.totalPropinas)} />
          <HostlyKpiCard title="Total cobrado" value={formatEur(totals.totalCobrado)} />
          <HostlyKpiCard title="Ticket medio" value={`${avgTicket.toFixed(2)} €`} />
          <HostlyKpiCard title="Tickets" value={ticketsCount} />
        </div>

        <div className="hostly-kpi-grid-unified hostly-kpi-grid-unified--analytics hostly-kpi-grid-unified--5">
          <HostlyKpiCard title="Efectivo" value={`${byMethod.cash.toFixed(2)} €`} variant="soft" />
          <HostlyKpiCard title="Tarjeta" value={`${byMethod.card.toFixed(2)} €`} variant="soft" />
          <HostlyKpiCard title="Voucher" value={`${totalVoucher.toFixed(2)} €`} variant="soft" />
          <HostlyKpiCard
            title="Propinas"
            value={`${byMethod.tips.toFixed(2)} €`}
            variant="soft"
            accentColor="#16a34a"
          />
          <HostlyKpiCard
            title="Descuentos"
            value={`-${formatNumberEU(totals.totalDiscounts)} €`}
            variant="soft"
            accentColor="#dc2626"
          />
        </div>

        <HostlySurface variant="soft" className="p-[var(--hostly-op-gap-md)]">
          <p className="hostly-section-label mb-[var(--hostly-op-gap-xs)]">Ventas por hora</p>
          <div className="flex flex-col gap-1">
            {salesByHour.rows.map((h) => (
              <div key={h.hour} className="flex items-center gap-2">
                <div className="hostly-muted w-10 shrink-0 text-xs">{h.hour}:00</div>
                <div className="h-3 flex-1 rounded-[var(--hostly-radius-sm)] bg-[var(--hostly-surface-muted)]">
                  <div
                    className="h-3 rounded-[var(--hostly-radius-sm)] bg-[var(--hostly-accent)]"
                    style={{
                      width: `${(h.total / salesByHour.max) * 100}%`,
                    }}
                  />
                </div>
                <div className="w-14 shrink-0 text-right text-xs tabular-nums">{h.total.toFixed(0)}€</div>
              </div>
            ))}
          </div>
        </HostlySurface>

        <HostlySurface variant="soft" className="p-[var(--hostly-op-gap-md)]">
          <p className="hostly-section-label mb-[var(--hostly-op-gap-xs)]">Ventas por camarero</p>
          <div className="flex flex-col gap-[var(--hostly-op-gap-xs)]">
            {waiterEntries.map(([id, w]) => (
              <div
                key={id}
                className="flex items-center justify-between gap-3 border-b border-[var(--hostly-table-divider-faint)] py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[color:var(--hostly-ink-strong)]">
                    {w.email ? w.email.split("@")[0] : "Equipo"}
                  </div>
                  <div className="hostly-muted text-xs">
                    {w.email ? `${w.email} · ` : ""}{w.ticketIds.size} tickets
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold tabular-nums">{w.total.toFixed(2)} €</div>
                  <div className="text-xs text-[color:#16a34a] tabular-nums">{w.tips.toFixed(2)} € propinas</div>
                </div>
              </div>
            ))}
          </div>
        </HostlySurface>

        <HostlySurface variant="soft" className="p-[var(--hostly-op-gap-md)]">
          <div className="mb-[var(--hostly-op-gap-sm)] flex flex-wrap items-center justify-between gap-2">
            <p className="hostly-section-label mb-0">Últimos pagos</p>
          </div>
          <div className="grid gap-[var(--hostly-op-gap-xs)]">
            {filteredPayments.slice(0, 30).map((p) => {
              const ms = readTsMs(p.createdAt);
              const method = (p.paymentMethod ?? "").toLowerCase();
              const methodLabel = paymentMethodLabel(p.paymentMethod);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-[var(--hostly-table-divider-faint)] py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[color:var(--hostly-ink-strong)]">
                      {p.ticketNumber ?? "—"}
                    </div>
                    <div className="text-xs text-[color:var(--hostly-ink-muted)]">
                      {formatTime(ms)} · {methodLabel}
                    </div>
                    {method === "voucher" && p.voucherNumber ? (
                      <div className="hostly-muted text-xs">Voucher: {p.voucherNumber}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3">
                    <div className="text-sm font-semibold tabular-nums text-[color:var(--hostly-ink-strong)]">
                      {formatEur(paymentSaleAmount(p))}
                    </div>
                    <div className="text-xs tabular-nums text-[color:var(--hostly-ink-muted)]">
                      Tip {formatEur(n(p.tip))}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredPayments.length === 0 ? (
              <div className="hostly-muted text-sm">No hay cobros confirmados para estos filtros.</div>
            ) : null}
          </div>
        </HostlySurface>
          </>
        )}
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
            <div>Tickets: {ticketsCount}</div>
            <div>Ticket medio: {formatNumberEU(avgTicket)} €</div>
          </div>
        </div>
      </div>
    </ModulePageShell>
  );
}
