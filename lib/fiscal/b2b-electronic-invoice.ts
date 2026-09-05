export type B2bStructuredInvoiceFormat = "UBL_EN16931" | "CII_EN16931" | "EDIFACT_EN16931" | "FACTURAE";
export type B2bInvoiceLifecycleStatus = "issued" | "sent" | "received" | "accepted" | "rejected" | "paid";

export type B2bElectronicInvoice = {
  restaurantId: string;
  fiscalInvoiceId: string;
  format: B2bStructuredInvoiceFormat;
  payload: Uint8Array;
};

export interface B2bElectronicInvoiceAdapter {
  readonly adapterId: string;
  readonly channel: "public_solution" | "private_platform";
  send(invoice: B2bElectronicInvoice, idempotencyKey: string): Promise<{ externalId: string; status: B2bInvoiceLifecycleStatus }>;
  readStatus(externalId: string): Promise<{ status: B2bInvoiceLifecycleStatus; occurredAt: string }>;
}

export const HOSTLY_B2B_IMPLEMENTATION_STATUS = Object.freeze({
  enabled: false,
  reason: "PENDING_FINAL_MINISTERIAL_TECHNICAL_SPECIFICATION",
  formatsPrepared: ["UBL_EN16931", "CII_EN16931", "EDIFACT_EN16931", "FACTURAE"] as const,
});

export function requireConfiguredB2bAdapter(adapter: B2bElectronicInvoiceAdapter | null): B2bElectronicInvoiceAdapter {
  if (!HOSTLY_B2B_IMPLEMENTATION_STATUS.enabled || !adapter) {
    throw new Error("B2B_EINVOICE_PROTOCOL_NOT_ENABLED");
  }
  return adapter;
}
