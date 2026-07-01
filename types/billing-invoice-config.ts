/** Configuración de numeración de facturas por restaurante (extensible vía Firestore). */
export type BillingInvoiceSeriesConfig = {
  /** Código de serie visible (p. ej. A, FAC, TPV). */
  defaultSeriesCode: string;
  /** Dígitos del correlativo (p. ej. 6 → 000001). */
  numberPadding: number;
};

export const DEFAULT_BILLING_INVOICE_SERIES_CONFIG: BillingInvoiceSeriesConfig = {
  defaultSeriesCode: "A",
  numberPadding: 6,
};
