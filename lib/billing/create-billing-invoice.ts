import { getRestaurantById } from "@/lib/firestore/restaurants";
import { allocateNextBillingInvoiceNumber } from "@/lib/billing/billing-invoice-numbering";
import {
  buildBillingCompanySnapshot,
  buildBillingInvoiceLineSnapshots,
  buildBillingRestaurantSnapshot,
} from "@/lib/billing/billing-invoice-snapshots";
import { persistBillingInvoiceDoc } from "@/lib/firestore/billing-invoices";
import type { CreateBillingInvoiceInput, BillingInvoice } from "@/types/billing-invoice";
import { DEFAULT_RESTAURANT_CURRENCY } from "@/lib/firestore/restaurant-types";

/**
 * Crea un registro de factura con numeración, snapshots y persistencia Firestore.
 * Punto de entrada principal del módulo de facturación.
 */
export async function createBillingInvoice(
  input: CreateBillingInvoiceInput,
): Promise<BillingInvoice> {
  const rid = input.restaurantId.trim();
  if (!rid) throw new Error("createBillingInvoice: restaurantId no disponible");
  if (!input.billingCustomer.id.trim()) {
    throw new Error("createBillingInvoice: billingCustomerId no disponible");
  }

  const restaurant = await getRestaurantById(rid);
  if (!restaurant) {
    throw new Error("createBillingInvoice: restaurante no encontrado");
  }

  const { invoiceNumber, invoiceSeries } = await allocateNextBillingInvoiceNumber(rid);
  const now = new Date().toISOString();
  const currency = input.currency?.trim() || restaurant.currency || DEFAULT_RESTAURANT_CURRENCY;

  return persistBillingInvoiceDoc({
    restaurantId: rid,
    billingCustomerId: input.billingCustomer.id,
    orderId: input.orderId,
    tableId: input.tableId,
    invoiceNumber,
    invoiceSeries,
    status: "generated",
    companySnapshot: buildBillingCompanySnapshot(input.billingCustomer),
    restaurantSnapshot: buildBillingRestaurantSnapshot(restaurant),
    linesSnapshot: buildBillingInvoiceLineSnapshots(input.lines),
    subtotal: input.subtotal,
    taxes: input.taxes,
    total: input.total,
    currency,
    paymentMethod: input.paymentMethod,
    generatedAt: now,
    sentAt: null,
  });
}
