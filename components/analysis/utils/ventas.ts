import type { VentasOrderInput } from "@/components/analysis";
import { paymentSaleAmount } from "@/lib/payments/paymentSaleAmount";

export type VentasSourceLike = Array<Record<string, unknown>> | null | undefined;

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
        id: typeof item?.id === "string" ? item.id : null,
        zoneName:
          typeof item?.zoneName === "string" ? item.zoneName : null,
      };
      return out;
    })
    .filter((item): item is VentasOrderInput => item !== null);
}

