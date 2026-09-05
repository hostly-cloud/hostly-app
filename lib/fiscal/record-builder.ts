import type {
  AeatInvoiceType,
  FiscalCancellationRecord,
  FiscalInvoiceCalculation,
  FiscalRegistrationRecord,
  FiscalRecordPrevious,
  FiscalSoftwareIdentity,
  FiscalCustomerSnapshot,
} from "@/lib/fiscal/model";
import {
  calculateCancellationHash,
  calculateRegistrationHash,
} from "@/lib/fiscal/verifactu-hash";

export type BuildRegistrationRecordInput = {
  issuerNif: string;
  issuerLegalName: string;
  invoiceNumber: string;
  issueDate: string;
  generatedAt: string;
  invoiceType: AeatInvoiceType;
  description: string;
  customer: FiscalCustomerSnapshot | null;
  calculation: FiscalInvoiceCalculation;
  previous: FiscalRecordPrevious | null;
  software: FiscalSoftwareIdentity;
  correctedInvoices?: FiscalRecordPrevious[];
  substitutedInvoices?: FiscalRecordPrevious[];
  rectificationType?: "S" | "I";
};

export function buildRegistrationRecord(
  input: BuildRegistrationRecordInput,
): FiscalRegistrationRecord {
  if (!input.issuerLegalName.trim()) throw new Error("FISCAL_ISSUER_NAME_REQUIRED");
  if (!input.invoiceNumber.trim()) throw new Error("FISCAL_INVOICE_NUMBER_REQUIRED");
  if (!input.description.trim()) throw new Error("FISCAL_DESCRIPTION_REQUIRED");
  if ((input.invoiceType === "F1" || input.invoiceType === "F3") && !input.customer) {
    throw new Error("FISCAL_COMPLETE_CUSTOMER_REQUIRED");
  }
  const isRectification = input.invoiceType.startsWith("R");
  if (isRectification && (!input.rectificationType || !input.correctedInvoices?.length)) {
    throw new Error("FISCAL_RECTIFICATION_REFERENCE_REQUIRED");
  }
  if (!isRectification && (input.rectificationType || input.correctedInvoices?.length)) {
    throw new Error("FISCAL_RECTIFICATION_FIELDS_NOT_ALLOWED");
  }
  if (input.invoiceType === "F3" && !input.substitutedInvoices?.length) {
    throw new Error("FISCAL_SUBSTITUTED_INVOICE_REFERENCE_REQUIRED");
  }
  if (input.invoiceType !== "F3" && input.substitutedInvoices?.length) {
    throw new Error("FISCAL_SUBSTITUTED_INVOICES_NOT_ALLOWED");
  }

  const hash = calculateRegistrationHash({
    issuerNif: input.issuerNif,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    invoiceType: input.invoiceType,
    taxAmountCents: input.calculation.totals.taxAmountCents,
    totalCents: input.calculation.totals.totalCents,
    previousHash: input.previous?.hash ?? null,
    generatedAt: input.generatedAt,
  });

  return {
    schemaVersion: "1.0",
    kind: "alta",
    issuerNif: input.issuerNif,
    issuerLegalName: input.issuerLegalName.trim(),
    invoiceNumber: input.invoiceNumber.trim(),
    issueDate: input.issueDate,
    generatedAt: input.generatedAt,
    invoiceType: input.invoiceType,
    description: input.description.trim(),
    customer: input.customer,
    ...(input.correctedInvoices ? { correctedInvoices: input.correctedInvoices } : {}),
    ...(input.substitutedInvoices ? { substitutedInvoices: input.substitutedInvoices } : {}),
    ...(input.rectificationType ? { rectificationType: input.rectificationType } : {}),
    breakdown: input.calculation.breakdown,
    taxAmountCents: input.calculation.totals.taxAmountCents,
    totalCents: input.calculation.totals.totalCents,
    previous: input.previous,
    software: input.software,
    hashAlgorithm: "01",
    hash,
  };
}

export function buildCancellationRecord(input: {
  issuerNif: string;
  invoiceNumber: string;
  issueDate: string;
  generatedAt: string;
  previous: FiscalRecordPrevious | null;
  software: FiscalSoftwareIdentity;
}): FiscalCancellationRecord {
  const hash = calculateCancellationHash({
    issuerNif: input.issuerNif,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    generatedAt: input.generatedAt,
    previousHash: input.previous?.hash ?? null,
  });
  return {
    schemaVersion: "1.0",
    kind: "anulacion",
    issuerNif: input.issuerNif,
    invoiceNumber: input.invoiceNumber,
    issueDate: input.issueDate,
    generatedAt: input.generatedAt,
    previous: input.previous,
    software: input.software,
    hashAlgorithm: "01",
    hash,
  };
}
