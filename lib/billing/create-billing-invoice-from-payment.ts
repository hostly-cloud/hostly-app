import { createBillingInvoice } from "@/lib/billing/create-billing-invoice";
import type { BillingInvoiceLineSource } from "@/types/billing-invoice";
import type { BillingCustomer } from "@/types/billing-customer";

export type CreateBillingInvoiceFromPaymentParams = {
  restaurantId: string;
  billingCustomer: BillingCustomer;
  orderId: string | null;
  tableId: string | null;
  paymentMethod: string;
  lines: BillingInvoiceLineSource[];
  subtotal: number;
  taxes: number;
  total: number;
  currency?: string;
};

/** Orquestación TPV → factura sin acoplar lógica de pagos. */
export async function createBillingInvoiceFromPayment(
  params: CreateBillingInvoiceFromPaymentParams,
) {
  return createBillingInvoice({
    restaurantId: params.restaurantId,
    billingCustomer: params.billingCustomer,
    orderId: params.orderId,
    tableId: params.tableId,
    paymentMethod: params.paymentMethod,
    lines: params.lines,
    subtotal: params.subtotal,
    taxes: params.taxes,
    total: params.total,
    currency: params.currency,
  });
}
