/**
 * Cliente de facturación reutilizable por restaurante.
 * Preparado para persistencia futura en Firestore; sin uso operativo aún.
 */
export interface BillingCustomer {
  id: string;
  restaurantId: string;
  companyName: string;
  taxId: string;
  email: string;
  phone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos editables de un cliente de facturación (sin metadatos). */
export type BillingCustomerInput = Pick<
  BillingCustomer,
  | "companyName"
  | "taxId"
  | "email"
  | "phone"
  | "address"
  | "postalCode"
  | "city"
  | "province"
  | "country"
  | "notes"
>;

export function createEmptyBillingCustomerInput(): BillingCustomerInput {
  return {
    companyName: "",
    taxId: "",
    email: "",
    phone: null,
    address: null,
    postalCode: null,
    city: null,
    province: null,
    country: null,
    notes: null,
  };
}
