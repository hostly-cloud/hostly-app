import { computeOrderEconomics } from "@/lib/server/tpv/compute-order-economics";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import { roundMoney } from "@/lib/server/tpv/order-payment-balance";

function lineIdFromItem(item: Record<string, unknown>): string {
  return typeof item.id === "string" ? item.id.trim() : "";
}

function lineAuthoritativeTotal(item: Record<string, unknown>): number {
  const lineTotal = Number(item.total);
  if (Number.isFinite(lineTotal) && lineTotal >= 0) return roundMoney(lineTotal);
  const qty = Number(item.quantity ?? item.qty);
  const price = Number(item.price ?? item.precio);
  const modifierTotal = Number(item.modifierTotal ?? 0);
  if (Number.isFinite(qty) && Number.isFinite(price) && qty > 0) {
    return roundMoney(price * qty + modifierTotal * qty);
  }
  return 0;
}

function paidLineIdsFromPayments(payments: readonly Record<string, unknown>[]): Set<string> {
  const ids = new Set<string>();
  for (const p of payments) {
    if (String(p.status ?? "").toLowerCase() !== "paid") continue;
    if (String(p.type ?? "") !== "split_by_items") continue;
    const itemIds = Array.isArray(p.itemIds) ? p.itemIds : [];
    for (const id of itemIds) {
      if (typeof id === "string" && id.trim()) ids.add(id.trim());
    }
  }
  return ids;
}

function splitEqualPartAlreadyPaid(
  payments: readonly Record<string, unknown>[],
  part: number,
  totalParts: number,
): boolean {
  return payments.some((p) => {
    if (String(p.status ?? "").toLowerCase() !== "paid") return false;
    if (String(p.type ?? "") !== "split_equal") return false;
    return Number(p.part) === part && Number(p.totalParts) === totalParts;
  });
}

/** Usa el importe elegible original (finalTotal), no remaining/totalParts por llamada. */
export function computeSplitEqualAmount(
  orderFinalTotal: number,
  part: number,
  totalParts: number,
  payments: readonly Record<string, unknown>[],
): number | { error: string } {
  if (!Number.isInteger(part) || !Number.isInteger(totalParts)) {
    return { error: "SPLIT_PARTS_INVALID" };
  }
  if (part < 1 || part > totalParts || totalParts < 2) {
    return { error: "SPLIT_PARTS_INVALID" };
  }
  if (orderFinalTotal <= 0) return { error: "AMOUNT_INVALID" };
  if (splitEqualPartAlreadyPaid(payments, part, totalParts)) {
    return { error: "SPLIT_PART_ALREADY_PAID" };
  }
  const perPart = roundMoney(orderFinalTotal / totalParts);
  if (part < totalParts) return perPart;
  return roundMoney(orderFinalTotal - perPart * (totalParts - 1));
}

/**
 * Distribuye descuentos de order proporcionalmente al subtotal de cada línea elegible.
 */
export function computeSplitByItemsAmount(
  orderData: Record<string, unknown>,
  items: readonly Record<string, unknown>[],
  itemIds: readonly string[],
  payments: readonly Record<string, unknown>[],
): number | { error: string } {
  const unique = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length !== itemIds.length) return { error: "DUPLICATE_ITEM_ID" };
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const id = lineIdFromItem(item);
    if (id) byId.set(id, item);
  }
  const paidIds = paidLineIdsFromPayments(payments);
  const economics = computeOrderEconomics(orderData, items);
  if (economics.subtotal <= 0) return { error: "AMOUNT_INVALID" };

  let sum = 0;
  for (const id of unique) {
    const line = byId.get(id);
    if (!line) return { error: "LINE_NOT_FOUND" };
    const st = normalizeProductionLineStatus(line.status);
    if (st === "cancelled") return { error: "LINE_CANCELLED" };
    if (paidIds.has(id)) return { error: "LINE_ALREADY_PAID" };
    const lineGross = lineAuthoritativeTotal(line);
    if (lineGross <= 0) return { error: "AMOUNT_INVALID" };
    const discountShare = roundMoney(
      (economics.discountTotal * lineGross) / economics.subtotal,
    );
    sum += roundMoney(Math.max(0, lineGross - discountShare));
  }
  const total = roundMoney(sum);
  if (total <= 0) return { error: "AMOUNT_INVALID" };
  return total;
}
