import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";

export type RentabilidadSourceLike =
  Array<Record<string, unknown>> | null | undefined;

function timestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date.getTime() : null;
  }
  return null;
}

export function buildSettledMarginOrdersSource(
  payments: RentabilidadSourceLike,
  orders: RentabilidadSourceLike,
): Array<Record<string, unknown>> {
  const paidByOrder = new Map<
    string,
    { recognizedSalesTotal: number; settledAt: unknown; settledAtMs: number }
  >();

  for (const payment of Array.isArray(payments) ? payments : []) {
    if (
      String(payment.status ?? "")
        .trim()
        .toLowerCase() !== "paid"
    )
      continue;
    const orderId =
      typeof payment.orderId === "string" ? payment.orderId.trim() : "";
    if (!orderId) continue;

    const previous = paidByOrder.get(orderId);
    const createdAtMs = timestampMs(payment.createdAt) ?? -1;
    paidByOrder.set(orderId, {
      recognizedSalesTotal:
        (previous?.recognizedSalesTotal ?? 0) + paymentSaleAmount(payment),
      settledAt:
        !previous || createdAtMs >= previous.settledAtMs
          ? payment.createdAt
          : previous.settledAt,
      settledAtMs: Math.max(previous?.settledAtMs ?? -1, createdAtMs),
    });
  }

  const settledStatuses = new Set(["paid", "closed"]);
  const result: Array<Record<string, unknown>> = [];

  for (const order of Array.isArray(orders) ? orders : []) {
    const id = typeof order.id === "string" ? order.id.trim() : "";
    const status = String(order.status ?? "")
      .trim()
      .toLowerCase();
    const paid = id ? paidByOrder.get(id) : undefined;
    if (!paid || !settledStatuses.has(status)) continue;

    result.push({
      ...order,
      createdAt: paid.settledAt ?? order.createdAt,
      recognizedSalesTotal:
        Math.round(Math.max(0, paid.recognizedSalesTotal) * 100) / 100,
    });
  }

  return result;
}
