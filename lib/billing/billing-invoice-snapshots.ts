import type { RestaurantDocument } from "@/lib/firestore/restaurant-types";
import type {
  BillingCompanySnapshot,
  BillingInvoiceLineSnapshot,
  BillingInvoiceLineSource,
  BillingRestaurantSnapshot,
} from "@/types/billing-invoice";
import type { BillingCustomer } from "@/types/billing-customer";

export function buildBillingRestaurantSnapshot(
  restaurant: RestaurantDocument,
): BillingRestaurantSnapshot {
  return {
    name: restaurant.name,
    taxId: restaurant.taxId,
    email: restaurant.email,
    phone: restaurant.phone,
    address: restaurant.address,
    city: restaurant.city,
    country: restaurant.country,
    currency: restaurant.currency,
  };
}

export function buildBillingCompanySnapshot(
  customer: BillingCustomer,
): BillingCompanySnapshot {
  return {
    companyName: customer.companyName,
    taxId: customer.taxId,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    postalCode: customer.postalCode,
    city: customer.city,
    province: customer.province,
    country: customer.country,
  };
}

export function buildBillingInvoiceLineSnapshots(
  lines: BillingInvoiceLineSource[],
): BillingInvoiceLineSnapshot[] {
  return lines.map((line) => ({
    lineId: line.id,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    ...(line.isComped ? { isComped: true } : {}),
  }));
}
