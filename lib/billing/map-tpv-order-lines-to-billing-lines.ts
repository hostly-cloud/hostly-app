import type { BillingInvoiceLineSource } from "@/types/billing-invoice";

/** Mapeo mínimo desde líneas de comanda TPV → líneas de factura. */
export type TpvOrderLineForBilling = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isComped?: boolean;
};

export function mapTpvOrderLinesToBillingLines(
  lines: readonly TpvOrderLineForBilling[],
): BillingInvoiceLineSource[] {
  return lines.map((line) => ({
    id: line.id,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    ...(line.isComped ? { isComped: true } : {}),
  }));
}
