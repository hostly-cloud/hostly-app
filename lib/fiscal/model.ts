export type FiscalOperatingMode = "demo" | "test" | "live";

export type FiscalConfigurationStatus =
  | "draft"
  | "ready"
  | "active"
  | "suspended";

export type FiscalDocumentKind =
  | "simplified"
  | "complete"
  | "replacement"
  | "rectification";

export type AeatInvoiceType = "F1" | "F2" | "F3" | "R1" | "R2" | "R3" | "R4" | "R5";
export type AeatRectificationType = "S" | "I";
export type AeatRecordKind = "alta" | "anulacion";
export type AeatEnvironment = "test" | "production";
export type AeatRecordStatus =
  | "pending"
  | "sending"
  | "accepted"
  | "accepted_with_errors"
  | "rejected"
  | "retry_scheduled"
  | "cancelled";

export type FiscalAddress = {
  line1: string;
  postalCode: string;
  city: string;
  province: string;
  countryCode: string;
};

export type FiscalTaxpayer = {
  id: string;
  legalName: string;
  nif: string;
  address: FiscalAddress;
};

export type FiscalCustomerSnapshot = {
  legalName: string;
  nif: string;
  address: FiscalAddress;
  email?: string | null;
};

export type FiscalSeries = {
  code: string;
  kind: "simplified" | "complete" | "rectification";
  resetEachYear: boolean;
  numberPadding: number;
  active: boolean;
};

export type FiscalSoftwareIdentity = {
  producerLegalName: string;
  producerNif: string;
  systemName: string;
  systemId: string;
  version: string;
  installationNumber: string;
  onlyVerifactuCapable: boolean;
  multiTaxpayerCapable: boolean;
  multipleTaxpayersUsed: boolean;
};

export type FiscalResponsibleDeclaration = {
  status: "draft" | "published";
  declaredFiscalModuleVersion: string;
  documentUrl: string | null;
  producerPostalAddress: string;
  signedAt: string | null;
  signedPlace: string;
};

export type FiscalConfiguration = {
  schemaVersion: 1;
  restaurantId: string;
  taxEntityId: string;
  establishmentId: string;
  mode: FiscalOperatingMode;
  status: FiscalConfigurationStatus;
  taxpayer: FiscalTaxpayer;
  establishmentName: string;
  establishmentAddress: FiscalAddress;
  timezone: string;
  currency: "EUR";
  defaultVatRateBps: number | null;
  series: FiscalSeries[];
  software: FiscalSoftwareIdentity;
  responsibleDeclaration: FiscalResponsibleDeclaration;
  aeatEnvironment: AeatEnvironment;
  certificateSecretResource: string | null;
  representationVerifiedAt: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
};

export type FiscalInvoiceLineInput = {
  lineId: string;
  description: string;
  quantity: number;
  grossAmountCents: number;
  vatRateBps: number;
};

export type FiscalInvoiceLine = FiscalInvoiceLineInput & {
  discountCents: number;
  netGrossCents: number;
  taxableBaseCents: number;
  taxAmountCents: number;
};

export type FiscalTaxBreakdown = {
  taxCode: "01";
  regimeCode: "01";
  operationClassification: "S1";
  vatRateBps: number;
  taxableBaseCents: number;
  taxAmountCents: number;
  grossAmountCents: number;
};

export type FiscalInvoiceTotals = {
  grossBeforeDiscountCents: number;
  discountCents: number;
  taxableBaseCents: number;
  taxAmountCents: number;
  totalCents: number;
};

export type FiscalInvoiceCalculation = {
  lines: FiscalInvoiceLine[];
  breakdown: FiscalTaxBreakdown[];
  totals: FiscalInvoiceTotals;
};

export type FiscalRecordPrevious = {
  issuerNif: string;
  invoiceNumber: string;
  issueDate: string;
  hash: string;
};

export type FiscalRecordBase = {
  schemaVersion: "1.0";
  kind: AeatRecordKind;
  issuerNif: string;
  invoiceNumber: string;
  issueDate: string;
  generatedAt: string;
  previous: FiscalRecordPrevious | null;
  software: FiscalSoftwareIdentity;
  hashAlgorithm: "01";
  hash: string;
};

export type FiscalRegistrationRecord = FiscalRecordBase & {
  kind: "alta";
  issuerLegalName: string;
  invoiceType: AeatInvoiceType;
  description: string;
  customer: FiscalCustomerSnapshot | null;
  correctedInvoices?: FiscalRecordPrevious[];
  substitutedInvoices?: FiscalRecordPrevious[];
  rectificationType?: AeatRectificationType;
  breakdown: FiscalTaxBreakdown[];
  taxAmountCents: number;
  totalCents: number;
};

export type FiscalCancellationRecord = FiscalRecordBase & {
  kind: "anulacion";
};

export type FiscalRecord = FiscalRegistrationRecord | FiscalCancellationRecord;
