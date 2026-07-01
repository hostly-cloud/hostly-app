import type { BillingCustomer } from "@/types/billing-customer";

export type BillingInvoiceStatus = "draft" | "generated" | "sent" | "cancelled";

/** Snapshot inmutable de la empresa facturada. */
export type BillingCompanySnapshot = {
  companyName: string;
  taxId: string;
  email: string;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
};

/** Snapshot inmutable del restaurante emisor. */
export type BillingRestaurantSnapshot = {
  name: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  currency: string;
};

/** Línea cobrada congelada en el momento de la factura. */
export type BillingInvoiceLineSnapshot = {
  lineId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isComped?: boolean;
};

export interface BillingInvoice {
  id: string;
  restaurantId: string;
  billingCustomerId: string;
  orderId: string | null;
  tableId: string | null;
  invoiceNumber: string;
  invoiceSeries: string;
  status: BillingInvoiceStatus;
  companySnapshot: BillingCompanySnapshot;
  restaurantSnapshot: BillingRestaurantSnapshot;
  linesSnapshot: BillingInvoiceLineSnapshot[];
  subtotal: number;
  taxes: number;
  total: number;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
  generatedAt: string | null;
  sentAt: string | null;
}

/** Entrada mínima para construir líneas de factura desde el TPV. */
export type BillingInvoiceLineSource = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isComped?: boolean;
};

export type CreateBillingInvoiceInput = {
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

export function billingCompanySnapshotFromCustomer(
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
