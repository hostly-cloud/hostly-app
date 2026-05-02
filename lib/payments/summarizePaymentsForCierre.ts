import { paymentSaleAmount } from "./paymentSaleAmount";

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

export type PaymentsCierreSummary = {
  totals: {
    totalVentas: number;
    totalPropinas: number;
    totalCobrado: number;
    totalDiscounts: number;
  };
  byMethod: {
    cash: number;
    card: number;
    tips: number;
  };
  totalVoucher: number;
  paymentsCount: number;
};

/**
 * Un solo recorrido de pagos para cierre de caja / KPIs.
 * Importes de venta por ticket: siempre `paymentSaleAmount` (neto con descuento).
 */
export function summarizePaymentsForCierre(
  filteredPayments: unknown,
): PaymentsCierreSummary {
  const list = Array.isArray(filteredPayments) ? filteredPayments : [];

  let totalVentas = 0;
  let totalPropinas = 0;
  let totalDiscounts = 0;
  let totalCobrado = 0;
  let cash = 0;
  let card = 0;
  let voucher = 0;

  for (const raw of list) {
    const p = raw as {
      tip?: unknown;
      received?: unknown;
      discountTotal?: unknown;
      paymentMethod?: string;
    };

    const sale = paymentSaleAmount(raw);
    totalVentas += sale;
    totalPropinas += n(p.tip);
    totalDiscounts += p.discountTotal != null ? n(p.discountTotal) : 0;
    totalCobrado += n(p.received || sale);

    const pm = String(p.paymentMethod ?? "").toLowerCase();
    if (pm === "cash") cash += sale;
    else if (pm === "card") card += sale;
    else if (pm === "voucher") voucher += sale;
  }

  const paymentsCount = list.length;

  return {
    totals: {
      totalVentas,
      totalPropinas,
      totalCobrado,
      totalDiscounts,
    },
    byMethod: {
      cash,
      card,
      tips: totalPropinas,
    },
    totalVoucher: voucher,
    paymentsCount,
  };
}
