import {
  computeOrderEconomics,
  sumPaidPayments,
} from "@/lib/server/tpv/compute-order-economics";
import { lineHasActiveQuantity } from "@/lib/server/tpv/table-group-order-utils";

export const MONEY_EPS = 0.01;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function existingItemsArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
}

export type OrderBalance = {
  finalTotal: number;
  paidSoFar: number;
  remaining: number;
};

export function computeOrderBalance(
  orderData: Record<string, unknown>,
  items: readonly Record<string, unknown>[],
  payments: readonly Record<string, unknown>[],
): OrderBalance {
  const economics = computeOrderEconomics(orderData, items);
  const paidSoFar = sumPaidPayments(payments);
  const remaining = roundMoney(Math.max(0, economics.finalTotal - paidSoFar));
  return { finalTotal: economics.finalTotal, paidSoFar, remaining };
}

export function isOrderEconomicallySettled(
  orderData: Record<string, unknown>,
  items: readonly Record<string, unknown>[],
  payments: readonly Record<string, unknown>[],
): boolean {
  return computeOrderBalance(orderData, items, payments).remaining <= MONEY_EPS;
}

export function isOrderEmptyWithZeroTotal(orderData: Record<string, unknown>): boolean {
  const items = existingItemsArray(orderData.items);
  const hasActive = items.some((line) => lineHasActiveQuantity(line));
  if (hasActive) return false;
  const total = Number(orderData.total);
  return Number.isFinite(total) && total <= MONEY_EPS;
}

export function hasPaidPaymentRecords(payments: readonly Record<string, unknown>[]): boolean {
  return payments.some((p) => String(p.status ?? "").toLowerCase() === "paid");
}
