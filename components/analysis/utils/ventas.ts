import type { VentasOrderInput } from "@/components/analysis";
import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";

export type VentasSourceLike = Array<Record<string, unknown>> | null | undefined;

export function buildPaidVentasSource(
  payments: VentasSourceLike,
  orders: VentasSourceLike,
): Array<Record<string, unknown>> {
  const ordersById = new Map<string, Record<string, unknown>>();

  for (const order of Array.isArray(orders) ? orders : []) {
    const id = typeof order.id === "string" ? order.id.trim() : "";
    if (id) ordersById.set(id, order);
  }

  return (Array.isArray(payments) ? payments : [])
    .filter((payment) => payment.status === "paid")
    .map((payment) => {
      const orderId = typeof payment.orderId === "string" ? payment.orderId.trim() : "";
      const order = orderId ? ordersById.get(orderId) : undefined;
      const paymentZone =
        typeof payment.zoneName === "string" && payment.zoneName.trim()
          ? payment.zoneName.trim()
          : null;
      const orderZone =
        typeof order?.zoneName === "string" && order.zoneName.trim()
          ? order.zoneName.trim()
          : null;

      return {
        ...payment,
        zoneName: paymentZone ?? orderZone,
      };
    });
}

export function buildVentasOrdersAdapter(source: VentasSourceLike): VentasOrderInput[] {
  const safeSource = Array.isArray(source) ? source : [];

  return safeSource
    .map((item) => {
      const r = item as Record<string, unknown>;
      const hasNumeric =
        (typeof r.total === "number" && !Number.isNaN(r.total)) ||
        (typeof r.finalTotal === "number" && !Number.isNaN(r.finalTotal)) ||
        (typeof r.amount === "number" && !Number.isNaN(r.amount));

      if (!hasNumeric) return null;

      const total = paymentSaleAmount(item);

      const out: VentasOrderInput = {
        total,
        createdAt: item?.createdAt ?? null,
        ticketNumber:
          typeof item?.ticketNumber === "string" && item.ticketNumber.trim()
            ? item.ticketNumber.trim()
            : null,
        zoneName:
          typeof item?.zoneName === "string" ? item.zoneName : null,
      };
      return out;
    })
    .filter((item): item is VentasOrderInput => item !== null);
}
