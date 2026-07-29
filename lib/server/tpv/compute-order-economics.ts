import { computeAuthoritativeOrderTotal } from "@/lib/server/tpv/build-authoritative-sale-line";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type OrderEconomics = {
  subtotal: number;
  discountAmountValue: number;
  discountPercentValue: number;
  percentAmount: number;
  discountTotal: number;
  finalTotal: number;
};

const MAX_DISCOUNT_PERCENT = 100;
const MAX_DISCOUNT_AMOUNT = 1_000_000;

export function computeOrderEconomics(
  orderData: Record<string, unknown>,
  items: readonly Record<string, unknown>[],
): OrderEconomics {
  const subtotal = computeAuthoritativeOrderTotal(items);
  const discountAmountValue = Math.min(
    MAX_DISCOUNT_AMOUNT,
    Math.max(0, Number(orderData.discountAmount) || 0),
  );
  const discountPercentValue = Math.min(
    MAX_DISCOUNT_PERCENT,
    Math.max(0, Number(orderData.discountPercent) || 0),
  );
  const percentAmount =
    discountPercentValue > 0 ? roundMoney((subtotal * discountPercentValue) / 100) : 0;
  const discountTotal = roundMoney(Math.min(discountAmountValue + percentAmount, subtotal));
  const invPart =
    discountAmountValue > 0 ? roundMoney(Math.min(discountAmountValue, discountTotal)) : 0;
  const pctPart = roundMoney(Math.max(0, discountTotal - invPart));
  const finalTotal = roundMoney(Math.max(0, subtotal - discountTotal));
  return {
    subtotal,
    discountAmountValue: invPart,
    discountPercentValue,
    percentAmount: pctPart,
    discountTotal,
    finalTotal,
  };
}

export function sumPaidPayments(payments: readonly Record<string, unknown>[]): number {
  let sum = 0;
  for (const p of payments) {
    const status = String(p.status ?? "").toLowerCase();
    if (status !== "paid") continue;
    const amount = Number(p.amount ?? p.total);
    if (Number.isFinite(amount) && amount > 0) sum += amount;
  }
  return roundMoney(sum);
}

export function sumRefundedPayments(payments: readonly Record<string, unknown>[]): number {
  let sum = 0;
  for (const p of payments) {
    const status = String(p.status ?? "").toLowerCase();
    if (status !== "refunded") continue;
    const amount = Number(p.refundAmount ?? p.amount ?? p.total);
    if (Number.isFinite(amount) && amount > 0) sum += amount;
  }
  return roundMoney(sum);
}
