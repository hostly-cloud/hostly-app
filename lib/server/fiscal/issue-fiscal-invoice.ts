import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isStoredFiscalConfiguration } from "@/lib/fiscal/configuration";
import {
  fiscalYearForDate,
  formatAeatDateTime,
  formatAeatIssueDate,
  formatFiscalInvoiceNumber,
} from "@/lib/fiscal/format";
import type {
  FiscalConfiguration,
  FiscalCustomerSnapshot,
  FiscalDocumentKind,
  FiscalInvoiceCalculation,
  FiscalRecordPrevious,
  FiscalSeries,
} from "@/lib/fiscal/model";
import { calculateFiscalCredit, calculateFiscalInvoice, eurosToCents } from "@/lib/fiscal/money";
import { assertValidSpanishTaxId } from "@/lib/fiscal/nif";
import { buildCancellationRecord, buildRegistrationRecord } from "@/lib/fiscal/record-builder";
import { buildAeatQrUrl } from "@/lib/fiscal/verifactu-qr";
import { buildVerifactuSoapEnvelope } from "@/lib/fiscal/verifactu-xml";
import { HOSTLY_FISCAL_VERSION_SNAPSHOT } from "@/lib/fiscal/version";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import type { OrderEconomics } from "@/lib/server/tpv/compute-order-economics";
import type { ChargeOrderIntent, PaymentInvoiceIntent } from "@/lib/server/tpv/tpv-mutation-dtos";

export const RESTAURANT_SIMPLIFIED_INVOICE_LIMIT_CENTS = 300_000;

export type FiscalEmissionSummary = {
  invoiceId: string;
  recordId: string;
  invoiceNumber: string;
  documentKind: FiscalDocumentKind;
  recordStatus: "pending";
  mode: "test" | "live";
  qrUrl: string;
};

function stableDocumentId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000"), "utf8").digest("hex");
}

function activeSeries(config: FiscalConfiguration, kind: FiscalSeries["kind"]): FiscalSeries {
  const row = config.series.find((series) => series.kind === kind && series.active);
  if (!row) throw new Error(`FISCAL_SERIES_${kind.toUpperCase()}_NOT_CONFIGURED`);
  return row;
}

function customerSnapshot(intent: PaymentInvoiceIntent): FiscalCustomerSnapshot {
  const legalName = intent.name.trim();
  const address = intent.address?.trim() ?? "";
  const postalCode = intent.postalCode?.trim() ?? "";
  const city = intent.city?.trim() ?? "";
  const province = intent.province?.trim() ?? "";
  const countryCode = intent.countryCode?.trim().toUpperCase() ?? "ES";
  if (!legalName || !address || !postalCode || !city || !province || countryCode.length !== 2) {
    throw new Error("FISCAL_COMPLETE_CUSTOMER_ADDRESS_REQUIRED");
  }
  return {
    legalName,
    nif: assertValidSpanishTaxId(intent.taxId),
    address: { line1: address, postalCode, city, province, countryCode },
    email: intent.email.trim() || null,
  };
}

function buildFiscalLines(
  items: readonly Record<string, unknown>[],
  defaultVatRateBps: number | null,
) {
  return items.flatMap((item, index) => {
    if (normalizeProductionLineStatus(item.status) === "cancelled" || item.isComped === true) return [];
    const gross = Number(item.total);
    const quantity = Number(item.quantity ?? item.qty);
    const lineId = String(item.id ?? item.lineId ?? `line-${index}`).trim();
    const description = String(item.displayName ?? item.productName ?? item.name ?? "").trim();
    const explicitVat = item.vatRateBps;
    const vatRateBps = typeof explicitVat === "number" && Number.isInteger(explicitVat)
      ? explicitVat
      : defaultVatRateBps;
    if (vatRateBps == null) throw new Error("FISCAL_LINE_VAT_RATE_REQUIRED");
    if (!Number.isFinite(gross) || gross < 0 || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("FISCAL_LINE_ECONOMICS_INVALID");
    }
    return [{
      lineId,
      description,
      quantity,
      grossAmountCents: eurosToCents(gross),
      vatRateBps,
    }];
  });
}

function readPrevious(value: unknown): FiscalRecordPrevious | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<FiscalRecordPrevious>;
  if (typeof row.issuerNif !== "string" || typeof row.invoiceNumber !== "string" || typeof row.issueDate !== "string" || typeof row.hash !== "string") return null;
  return { issuerNif: row.issuerNif, invoiceNumber: row.invoiceNumber, issueDate: row.issueDate, hash: row.hash };
}

export async function issueFiscalInvoiceInPaymentTransaction(input: {
  db: Firestore;
  tx: Transaction;
  restaurantId: string;
  actorUid: string;
  orderId: string;
  orderData: Record<string, unknown>;
  items: readonly Record<string, unknown>[];
  economics: OrderEconomics;
  paymentId: string;
  settledPayments: readonly { id: string; paymentMethod: ChargeOrderIntent["paymentMethod"] }[];
  invoiceIntent?: PaymentInvoiceIntent;
  issuedAt: Date;
}): Promise<FiscalEmissionSummary | null> {
  const configRef = input.db.collection("fiscalConfigurations").doc(input.restaurantId);
  const configSnap = await input.tx.get(configRef);
  if (!configSnap.exists) return null;
  const rawConfig = configSnap.data();
  if (!isStoredFiscalConfiguration(rawConfig)) throw new Error("FISCAL_CONFIGURATION_CORRUPT");
  const config = rawConfig;
  if (config.restaurantId !== input.restaurantId) throw new Error("FISCAL_CONFIGURATION_TENANT_MISMATCH");
  if (config.mode === "demo" || config.status !== "active") return null;

  const invoiceId = stableDocumentId("invoice", input.restaurantId, input.orderId);
  const recordId = stableDocumentId("record", input.restaurantId, input.orderId, "alta");
  const invoiceRef = input.db.collection("fiscalInvoices").doc(invoiceId);
  const existingInvoice = await input.tx.get(invoiceRef);
  if (existingInvoice.exists) {
    const existing = existingInvoice.data() as FiscalEmissionSummary;
    return {
      invoiceId,
      recordId: String(existing.recordId),
      invoiceNumber: String(existing.invoiceNumber),
      documentKind: existing.documentKind,
      recordStatus: "pending",
      mode: config.mode,
      qrUrl: String(existing.qrUrl),
    };
  }

  const documentKind: FiscalDocumentKind = input.invoiceIntent ? "complete" : "simplified";
  const customer = input.invoiceIntent ? customerSnapshot(input.invoiceIntent) : null;
  const invoiceType = input.invoiceIntent ? "F1" as const : "F2" as const;
  const fiscalLines = buildFiscalLines(input.items, config.defaultVatRateBps);
  const calculation = calculateFiscalInvoice(fiscalLines, eurosToCents(input.economics.discountTotal));
  const expectedTotal = eurosToCents(input.economics.finalTotal);
  if (calculation.totals.totalCents !== expectedTotal) throw new Error("FISCAL_TOTAL_MISMATCH");
  if (invoiceType === "F2" && expectedTotal > RESTAURANT_SIMPLIFIED_INVOICE_LIMIT_CENTS) {
    throw new Error("FISCAL_COMPLETE_INVOICE_REQUIRED");
  }

  const issuedAtMs = input.issuedAt.getTime();
  const issueDate = formatAeatIssueDate(input.issuedAt, config.timezone);
  const generatedAt = formatAeatDateTime(input.issuedAt, config.timezone);
  const fiscalYear = fiscalYearForDate(input.issuedAt, config.timezone);
  const series = activeSeries(config, documentKind);
  const counterPeriod = series.resetEachYear ? String(fiscalYear) : "continuous";
  const counterId = stableDocumentId("counter", config.taxEntityId, config.establishmentId, series.code, counterPeriod);
  const chainId = stableDocumentId("chain", config.taxEntityId, config.software.installationNumber);
  const counterRef = input.db.collection("fiscalCounters").doc(counterId);
  const chainRef = input.db.collection("fiscalChains").doc(chainId);
  const [counterSnap, chainSnap] = await Promise.all([
    input.tx.get(counterRef),
    input.tx.get(chainRef),
  ]);
  const previousSequence = counterSnap.exists ? Number(counterSnap.data()?.sequence) : 0;
  if (!Number.isSafeInteger(previousSequence) || previousSequence < 0) throw new Error("FISCAL_COUNTER_CORRUPT");
  const sequence = previousSequence + 1;
  const invoiceNumber = formatFiscalInvoiceNumber(series.code, fiscalYear, sequence, series.numberPadding);
  const previous = chainSnap.exists ? readPrevious(chainSnap.data()?.lastRecord) : null;
  if (chainSnap.exists && !previous) throw new Error("FISCAL_CHAIN_CORRUPT");
  const previousChainSequence = chainSnap.exists ? Number(chainSnap.data()?.sequence) : 0;
  if (!Number.isSafeInteger(previousChainSequence) || previousChainSequence < 0) {
    throw new Error("FISCAL_CHAIN_SEQUENCE_CORRUPT");
  }
  const record = buildRegistrationRecord({
    issuerNif: config.taxpayer.nif,
    issuerLegalName: config.taxpayer.legalName,
    invoiceNumber,
    issueDate,
    generatedAt,
    invoiceType,
    description: "Servicios de hostelería",
    customer,
    calculation,
    previous,
    software: config.software,
  });
  const qrUrl = buildAeatQrUrl({
    environment: config.aeatEnvironment,
    mode: "verifactu",
    issuerNif: record.issuerNif,
    invoiceNumber,
    issueDate,
    totalCents: record.totalCents,
  });
  const xmlEnvelope = buildVerifactuSoapEnvelope({
    taxpayerLegalName: config.taxpayer.legalName,
    taxpayerNif: config.taxpayer.nif,
    records: [record],
  });
  const chainLastRecord: FiscalRecordPrevious = {
    issuerNif: record.issuerNif,
    invoiceNumber,
    issueDate,
    hash: record.hash,
  };

  input.tx.set(counterRef, {
    taxEntityId: config.taxEntityId,
    establishmentId: config.establishmentId,
    restaurantId: input.restaurantId,
    seriesCode: series.code,
    period: counterPeriod,
    sequence,
    lastInvoiceNumber: invoiceNumber,
    updatedAtMs: issuedAtMs,
  });
  input.tx.set(chainRef, {
    taxEntityId: config.taxEntityId,
    installationNumber: config.software.installationNumber,
    sequence: previousChainSequence + 1,
    lastRecord: chainLastRecord,
    updatedAtMs: issuedAtMs,
  });
  input.tx.create(input.db.collection("fiscalRecords").doc(recordId), {
    restaurantId: input.restaurantId,
    taxEntityId: config.taxEntityId,
    invoiceId,
    recordId,
    record,
    createdAtMs: issuedAtMs,
    immutable: true,
    version: HOSTLY_FISCAL_VERSION_SNAPSHOT,
  });
  input.tx.create(invoiceRef, {
    restaurantId: input.restaurantId,
    taxEntityId: config.taxEntityId,
    establishmentId: config.establishmentId,
    invoiceId,
    recordId,
    orderId: input.orderId,
    paymentIds: input.settledPayments.map((payment) => payment.id),
    invoiceNumber,
    seriesCode: series.code,
    sequence,
    fiscalYear,
    documentKind,
    invoiceType,
    status: "issued",
    initialDeliveryStatus: "pending",
    mode: config.mode,
    aeatEnvironment: config.aeatEnvironment,
    issuerSnapshot: config.taxpayer,
    establishmentSnapshot: {
      id: config.establishmentId,
      name: config.establishmentName,
      address: config.establishmentAddress,
    },
    customerSnapshot: customer,
    linesSnapshot: calculation.lines,
    taxBreakdown: calculation.breakdown,
    totals: calculation.totals,
    paymentMethods: [...new Set(input.settledPayments.map((payment) => payment.paymentMethod))],
    issuedAtMs,
    issueDate,
    generatedAt,
    qrUrl,
    immutable: true,
    version: HOSTLY_FISCAL_VERSION_SNAPSHOT,
    createdBy: input.actorUid,
  });
  input.tx.create(input.db.collection("fiscalOutbox").doc(recordId), {
    restaurantId: input.restaurantId,
    taxEntityId: config.taxEntityId,
    invoiceId,
    recordId,
    environment: config.aeatEnvironment,
    xmlEnvelope,
    payloadHash: createHash("sha256").update(xmlEnvelope, "utf8").digest("hex"),
    status: "pending",
    attempts: 0,
    nextAttemptAtMs: issuedAtMs,
    leaseUntilMs: null,
    createdAtMs: issuedAtMs,
    updatedAtMs: issuedAtMs,
  });
  input.tx.create(input.db.collection("fiscalDeliveryStates").doc(recordId), {
    restaurantId: input.restaurantId,
    taxEntityId: config.taxEntityId,
    invoiceId,
    recordId,
    status: "pending",
    attempts: 0,
    updatedAtMs: issuedAtMs,
  });
  input.tx.create(input.db.collection("fiscalAuditEvents").doc(stableDocumentId("audit", recordId, "issued")), {
    restaurantId: input.restaurantId,
    taxEntityId: config.taxEntityId,
    actorUid: input.actorUid,
    action: "fiscal_invoice_issued",
    entityType: "fiscalInvoice",
    entityId: invoiceId,
    recordId,
    result: "success",
    source: "tpv_payment",
    createdAtMs: issuedAtMs,
  });

  return { invoiceId, recordId, invoiceNumber, documentKind, recordStatus: "pending", mode: config.mode, qrUrl };
}

export async function issueFiscalRefundRectificationInTransaction(input: {
  db: Firestore;
  tx: Transaction;
  restaurantId: string;
  actorUid: string;
  originalInvoiceId: string;
  paymentId: string;
  paymentMethod: ChargeOrderIntent["paymentMethod"];
  refundAmountCents: number;
  issuedAt: Date;
  reason: string;
}): Promise<FiscalEmissionSummary> {
  const originalInvoiceRef = input.db.collection("fiscalInvoices").doc(input.originalInvoiceId);
  const configRef = input.db.collection("fiscalConfigurations").doc(input.restaurantId);
  const [originalInvoiceSnap, configSnap] = await Promise.all([
    input.tx.get(originalInvoiceRef),
    input.tx.get(configRef),
  ]);
  if (!originalInvoiceSnap.exists) throw new Error("FISCAL_ORIGINAL_INVOICE_NOT_FOUND");
  const original = originalInvoiceSnap.data()!;
  if (original.restaurantId !== input.restaurantId) throw new Error("FISCAL_INVOICE_TENANT_MISMATCH");
  const rawConfig = configSnap.data();
  if (!configSnap.exists || !isStoredFiscalConfiguration(rawConfig)) throw new Error("FISCAL_CONFIGURATION_NOT_FOUND");
  const config = rawConfig;
  if (config.restaurantId !== input.restaurantId || config.taxEntityId !== original.taxEntityId) {
    throw new Error("FISCAL_CONFIGURATION_TENANT_MISMATCH");
  }
  if (config.mode === "demo") throw new Error("FISCAL_RECTIFICATION_MODE_INVALID");

  const invoiceId = stableDocumentId("rectification", input.restaurantId, input.originalInvoiceId, input.paymentId);
  const recordId = stableDocumentId("record", invoiceId, "alta");
  const invoiceRef = input.db.collection("fiscalInvoices").doc(invoiceId);
  const existing = await input.tx.get(invoiceRef);
  if (existing.exists) {
    const value = existing.data()!;
    return {
      invoiceId,
      recordId: String(value.recordId),
      invoiceNumber: String(value.invoiceNumber),
      documentKind: "rectification",
      recordStatus: "pending",
      mode: config.mode,
      qrUrl: String(value.qrUrl),
    };
  }

  const originalRecordId = String(original.recordId ?? "");
  if (!originalRecordId) throw new Error("FISCAL_ORIGINAL_RECORD_MISSING");
  const originalRecordRef = input.db.collection("fiscalRecords").doc(originalRecordId);
  const ledgerRef = input.db.collection("fiscalRectificationLedgers").doc(input.originalInvoiceId);
  const [originalRecordSnap, ledgerSnap] = await Promise.all([
    input.tx.get(originalRecordRef),
    input.tx.get(ledgerRef),
  ]);
  const originalRecord = originalRecordSnap.data()?.record as Record<string, unknown> | undefined;
  if (!originalRecordSnap.exists || !originalRecord || typeof originalRecord.hash !== "string") {
    throw new Error("FISCAL_ORIGINAL_RECORD_CORRUPT");
  }
  const originalCalculation = {
    lines: original.linesSnapshot,
    breakdown: original.taxBreakdown,
    totals: original.totals,
  };
  if (!Array.isArray(originalCalculation.lines) || !Array.isArray(originalCalculation.breakdown) || !originalCalculation.totals || typeof originalCalculation.totals.totalCents !== "number") {
    throw new Error("FISCAL_ORIGINAL_CALCULATION_CORRUPT");
  }
  const creditedCents = ledgerSnap.exists ? Number(ledgerSnap.data()?.creditedCents) : 0;
  if (!Number.isSafeInteger(creditedCents) || creditedCents < 0) throw new Error("FISCAL_RECTIFICATION_LEDGER_CORRUPT");
  if (!Number.isSafeInteger(input.refundAmountCents) || input.refundAmountCents <= 0 || creditedCents + input.refundAmountCents > originalCalculation.totals.totalCents) {
    throw new Error("FISCAL_RECTIFICATION_EXCEEDS_ORIGINAL");
  }
  const calculation = calculateFiscalCredit(originalCalculation, input.refundAmountCents);
  const issuedAtMs = input.issuedAt.getTime();
  const issueDate = formatAeatIssueDate(input.issuedAt, config.timezone);
  const generatedAt = formatAeatDateTime(input.issuedAt, config.timezone);
  const fiscalYear = fiscalYearForDate(input.issuedAt, config.timezone);
  const series = activeSeries(config, "rectification");
  const counterPeriod = series.resetEachYear ? String(fiscalYear) : "continuous";
  const counterRef = input.db.collection("fiscalCounters").doc(stableDocumentId("counter", config.taxEntityId, config.establishmentId, series.code, counterPeriod));
  const chainRef = input.db.collection("fiscalChains").doc(stableDocumentId("chain", config.taxEntityId, config.software.installationNumber));
  const [counterSnap, chainSnap] = await Promise.all([input.tx.get(counterRef), input.tx.get(chainRef)]);
  const previousSequence = counterSnap.exists ? Number(counterSnap.data()?.sequence) : 0;
  const previousChainSequence = chainSnap.exists ? Number(chainSnap.data()?.sequence) : 0;
  if (!Number.isSafeInteger(previousSequence) || previousSequence < 0) throw new Error("FISCAL_COUNTER_CORRUPT");
  if (!Number.isSafeInteger(previousChainSequence) || previousChainSequence < 0) throw new Error("FISCAL_CHAIN_SEQUENCE_CORRUPT");
  const sequence = previousSequence + 1;
  const invoiceNumber = formatFiscalInvoiceNumber(series.code, fiscalYear, sequence, series.numberPadding);
  const previous = chainSnap.exists ? readPrevious(chainSnap.data()?.lastRecord) : null;
  if (chainSnap.exists && !previous) throw new Error("FISCAL_CHAIN_CORRUPT");
  const correctedInvoice = {
    issuerNif: String(originalRecord.issuerNif),
    invoiceNumber: String(originalRecord.invoiceNumber),
    issueDate: String(originalRecord.issueDate),
    hash: String(originalRecord.hash),
  };
  const record = buildRegistrationRecord({
    issuerNif: config.taxpayer.nif,
    issuerLegalName: config.taxpayer.legalName,
    invoiceNumber,
    issueDate,
    generatedAt,
    invoiceType: "R1",
    rectificationType: "I",
    correctedInvoices: [correctedInvoice],
    description: input.reason.trim().slice(0, 500) || "Devolución de cobro",
    customer: original.customerSnapshot ?? null,
    calculation,
    previous,
    software: config.software,
  });
  const qrUrl = buildAeatQrUrl({ environment: config.aeatEnvironment, mode: "verifactu", issuerNif: record.issuerNif, invoiceNumber, issueDate, totalCents: record.totalCents });
  const xmlEnvelope = buildVerifactuSoapEnvelope({ taxpayerLegalName: config.taxpayer.legalName, taxpayerNif: config.taxpayer.nif, records: [record] });
  const chainLastRecord: FiscalRecordPrevious = { issuerNif: record.issuerNif, invoiceNumber, issueDate, hash: record.hash };

  input.tx.set(counterRef, { taxEntityId: config.taxEntityId, establishmentId: config.establishmentId, restaurantId: input.restaurantId, seriesCode: series.code, period: counterPeriod, sequence, lastInvoiceNumber: invoiceNumber, updatedAtMs: issuedAtMs });
  input.tx.set(chainRef, { taxEntityId: config.taxEntityId, installationNumber: config.software.installationNumber, sequence: previousChainSequence + 1, lastRecord: chainLastRecord, updatedAtMs: issuedAtMs });
  input.tx.set(ledgerRef, { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, originalInvoiceId: input.originalInvoiceId, originalTotalCents: originalCalculation.totals.totalCents, creditedCents: creditedCents + input.refundAmountCents, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalRecords").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId, recordId, record, createdAtMs: issuedAtMs, immutable: true, version: HOSTLY_FISCAL_VERSION_SNAPSHOT });
  input.tx.create(invoiceRef, {
    restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, establishmentId: config.establishmentId,
    invoiceId, recordId, originalInvoiceId: input.originalInvoiceId, orderId: original.orderId ?? null,
    paymentIds: [input.paymentId], invoiceNumber, seriesCode: series.code, sequence, fiscalYear,
    documentKind: "rectification", invoiceType: "R1", rectificationType: "I", status: "issued",
    initialDeliveryStatus: "pending", mode: config.mode, aeatEnvironment: config.aeatEnvironment,
    issuerSnapshot: config.taxpayer, establishmentSnapshot: original.establishmentSnapshot ?? null,
    customerSnapshot: original.customerSnapshot ?? null, linesSnapshot: calculation.lines,
    taxBreakdown: calculation.breakdown, totals: calculation.totals, paymentMethods: [input.paymentMethod],
    issuedAtMs, issueDate, generatedAt, qrUrl, immutable: true, version: HOSTLY_FISCAL_VERSION_SNAPSHOT,
    createdBy: input.actorUid, rectificationReason: input.reason.trim().slice(0, 500),
  });
  input.tx.create(input.db.collection("fiscalOutbox").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId, recordId, environment: config.aeatEnvironment, xmlEnvelope, payloadHash: createHash("sha256").update(xmlEnvelope, "utf8").digest("hex"), status: "pending", attempts: 0, nextAttemptAtMs: issuedAtMs, leaseUntilMs: null, createdAtMs: issuedAtMs, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalDeliveryStates").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId, recordId, status: "pending", attempts: 0, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalRelations").doc(invoiceId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, kind: "rectifies", fromInvoiceId: invoiceId, toInvoiceId: input.originalInvoiceId, paymentId: input.paymentId, createdAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalAuditEvents").doc(stableDocumentId("audit", recordId, "issued")), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, actorUid: input.actorUid, action: "fiscal_rectification_issued", entityType: "fiscalInvoice", entityId: invoiceId, recordId, result: "success", source: "tpv_refund", createdAtMs: issuedAtMs });

  return { invoiceId, recordId, invoiceNumber, documentKind: "rectification", recordStatus: "pending", mode: config.mode, qrUrl };
}

export async function issueFiscalReplacementInTransaction(input: {
  db: Firestore;
  tx: Transaction;
  restaurantId: string;
  actorUid: string;
  originalInvoiceId: string;
  customer: PaymentInvoiceIntent;
  issuedAt: Date;
}): Promise<FiscalEmissionSummary> {
  const originalRef = input.db.collection("fiscalInvoices").doc(input.originalInvoiceId);
  const configRef = input.db.collection("fiscalConfigurations").doc(input.restaurantId);
  const replacementInvoiceId = stableDocumentId("replacement", input.restaurantId, input.originalInvoiceId);
  const replacementRef = input.db.collection("fiscalInvoices").doc(replacementInvoiceId);
  const [originalSnap, configSnap, existingSnap] = await Promise.all([
    input.tx.get(originalRef),
    input.tx.get(configRef),
    input.tx.get(replacementRef),
  ]);
  if (!originalSnap.exists) throw new Error("FISCAL_ORIGINAL_INVOICE_NOT_FOUND");
  const original = originalSnap.data()!;
  const rawConfig = configSnap.data();
  if (!configSnap.exists || !isStoredFiscalConfiguration(rawConfig)) throw new Error("FISCAL_CONFIGURATION_NOT_FOUND");
  const config = rawConfig;
  if (original.restaurantId !== input.restaurantId || original.taxEntityId !== config.taxEntityId || config.restaurantId !== input.restaurantId) {
    throw new Error("FISCAL_INVOICE_TENANT_MISMATCH");
  }
  if (config.mode === "demo" || config.status !== "active") throw new Error("FISCAL_REPLACEMENT_MODE_INVALID");
  if (original.documentKind !== "simplified" || original.invoiceType !== "F2") {
    throw new Error("FISCAL_REPLACEMENT_REQUIRES_SIMPLIFIED_INVOICE");
  }
  if (existingSnap.exists) {
    const value = existingSnap.data()!;
    return {
      invoiceId: replacementInvoiceId,
      recordId: String(value.recordId),
      invoiceNumber: String(value.invoiceNumber),
      documentKind: "replacement",
      recordStatus: "pending",
      mode: config.mode,
      qrUrl: String(value.qrUrl),
    };
  }

  const originalRecordId = String(original.recordId ?? "");
  const recordId = stableDocumentId("record", replacementInvoiceId, "alta");
  const originalRecordRef = input.db.collection("fiscalRecords").doc(originalRecordId);
  const rectificationLedgerRef = input.db.collection("fiscalRectificationLedgers").doc(input.originalInvoiceId);
  const cancellationRef = input.db.collection("fiscalCancellations").doc(stableDocumentId("cancellation", input.originalInvoiceId));
  const chainRef = input.db.collection("fiscalChains").doc(stableDocumentId("chain", config.taxEntityId, config.software.installationNumber));
  const issuedAtMs = input.issuedAt.getTime();
  const fiscalYear = fiscalYearForDate(input.issuedAt, config.timezone);
  const series = activeSeries(config, "complete");
  const counterPeriod = series.resetEachYear ? String(fiscalYear) : "continuous";
  const counterRef = input.db.collection("fiscalCounters").doc(stableDocumentId("counter", config.taxEntityId, config.establishmentId, series.code, counterPeriod));
  const [originalRecordSnap, rectificationLedgerSnap, cancellationSnap, chainSnap, counterSnap] = await Promise.all([
    input.tx.get(originalRecordRef),
    input.tx.get(rectificationLedgerRef),
    input.tx.get(cancellationRef),
    input.tx.get(chainRef),
    input.tx.get(counterRef),
  ]);
  if (!originalRecordSnap.exists) throw new Error("FISCAL_ORIGINAL_RECORD_CORRUPT");
  if (cancellationSnap.exists) throw new Error("FISCAL_REPLACEMENT_CANCELLED_INVOICE");
  if (rectificationLedgerSnap.exists && Number(rectificationLedgerSnap.data()?.creditedCents) > 0) {
    throw new Error("FISCAL_REPLACEMENT_RECTIFIED_INVOICE");
  }
  const originalRecord = originalRecordSnap.data()?.record as Record<string, unknown> | undefined;
  if (!originalRecord || typeof originalRecord.hash !== "string" || typeof originalRecord.issuerNif !== "string" || typeof originalRecord.invoiceNumber !== "string" || typeof originalRecord.issueDate !== "string") {
    throw new Error("FISCAL_ORIGINAL_RECORD_CORRUPT");
  }
  const calculation = {
    lines: original.linesSnapshot,
    breakdown: original.taxBreakdown,
    totals: original.totals,
  } as FiscalInvoiceCalculation;
  if (!Array.isArray(calculation.lines) || !Array.isArray(calculation.breakdown) || !calculation.totals || !Number.isSafeInteger(calculation.totals.totalCents)) {
    throw new Error("FISCAL_ORIGINAL_CALCULATION_CORRUPT");
  }
  const customer = customerSnapshot(input.customer);
  const previousSequence = counterSnap.exists ? Number(counterSnap.data()?.sequence) : 0;
  const previousChainSequence = chainSnap.exists ? Number(chainSnap.data()?.sequence) : 0;
  if (!Number.isSafeInteger(previousSequence) || previousSequence < 0) throw new Error("FISCAL_COUNTER_CORRUPT");
  if (!Number.isSafeInteger(previousChainSequence) || previousChainSequence < 0) throw new Error("FISCAL_CHAIN_SEQUENCE_CORRUPT");
  const previous = chainSnap.exists ? readPrevious(chainSnap.data()?.lastRecord) : null;
  if (chainSnap.exists && !previous) throw new Error("FISCAL_CHAIN_CORRUPT");
  const sequence = previousSequence + 1;
  const invoiceNumber = formatFiscalInvoiceNumber(series.code, fiscalYear, sequence, series.numberPadding);
  const issueDate = formatAeatIssueDate(input.issuedAt, config.timezone);
  const generatedAt = formatAeatDateTime(input.issuedAt, config.timezone);
  const substitutedInvoice: FiscalRecordPrevious = {
    issuerNif: originalRecord.issuerNif,
    invoiceNumber: originalRecord.invoiceNumber,
    issueDate: originalRecord.issueDate,
    hash: originalRecord.hash,
  };
  const record = buildRegistrationRecord({
    issuerNif: config.taxpayer.nif,
    issuerLegalName: config.taxpayer.legalName,
    invoiceNumber,
    issueDate,
    generatedAt,
    invoiceType: "F3",
    description: "Factura completa en sustitución de factura simplificada",
    customer,
    substitutedInvoices: [substitutedInvoice],
    calculation,
    previous,
    software: config.software,
  });
  const qrUrl = buildAeatQrUrl({ environment: config.aeatEnvironment, mode: "verifactu", issuerNif: record.issuerNif, invoiceNumber, issueDate, totalCents: record.totalCents });
  const xmlEnvelope = buildVerifactuSoapEnvelope({ taxpayerLegalName: config.taxpayer.legalName, taxpayerNif: config.taxpayer.nif, records: [record] });
  const chainLastRecord: FiscalRecordPrevious = { issuerNif: record.issuerNif, invoiceNumber, issueDate, hash: record.hash };

  input.tx.set(counterRef, { taxEntityId: config.taxEntityId, establishmentId: config.establishmentId, restaurantId: input.restaurantId, seriesCode: series.code, period: counterPeriod, sequence, lastInvoiceNumber: invoiceNumber, updatedAtMs: issuedAtMs });
  input.tx.set(chainRef, { taxEntityId: config.taxEntityId, installationNumber: config.software.installationNumber, sequence: previousChainSequence + 1, lastRecord: chainLastRecord, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalRecords").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId: replacementInvoiceId, recordId, record, createdAtMs: issuedAtMs, immutable: true, version: HOSTLY_FISCAL_VERSION_SNAPSHOT });
  input.tx.create(replacementRef, {
    restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, establishmentId: config.establishmentId,
    invoiceId: replacementInvoiceId, recordId, originalInvoiceId: input.originalInvoiceId, orderId: original.orderId ?? null,
    paymentIds: Array.isArray(original.paymentIds) ? original.paymentIds : [], invoiceNumber, seriesCode: series.code,
    sequence, fiscalYear, documentKind: "replacement", invoiceType: "F3", status: "issued",
    initialDeliveryStatus: "pending", mode: config.mode, aeatEnvironment: config.aeatEnvironment,
    issuerSnapshot: config.taxpayer, establishmentSnapshot: original.establishmentSnapshot ?? null,
    customerSnapshot: customer, linesSnapshot: calculation.lines, taxBreakdown: calculation.breakdown,
    totals: calculation.totals, paymentMethods: Array.isArray(original.paymentMethods) ? original.paymentMethods : [],
    issuedAtMs, issueDate, generatedAt, qrUrl, immutable: true, version: HOSTLY_FISCAL_VERSION_SNAPSHOT,
    createdBy: input.actorUid,
  });
  input.tx.create(input.db.collection("fiscalOutbox").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId: replacementInvoiceId, recordId, environment: config.aeatEnvironment, xmlEnvelope, payloadHash: createHash("sha256").update(xmlEnvelope, "utf8").digest("hex"), status: "pending", attempts: 0, nextAttemptAtMs: issuedAtMs, leaseUntilMs: null, createdAtMs: issuedAtMs, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalDeliveryStates").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId: replacementInvoiceId, recordId, status: "pending", attempts: 0, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalRelations").doc(replacementInvoiceId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, kind: "replaces", fromInvoiceId: replacementInvoiceId, toInvoiceId: input.originalInvoiceId, createdAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalAuditEvents").doc(stableDocumentId("audit", recordId, "issued")), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, actorUid: input.actorUid, action: "fiscal_replacement_issued", entityType: "fiscalInvoice", entityId: replacementInvoiceId, recordId, result: "success", source: "fiscal_api", createdAtMs: issuedAtMs });

  return { invoiceId: replacementInvoiceId, recordId, invoiceNumber, documentKind: "replacement", recordStatus: "pending", mode: config.mode, qrUrl };
}

export type FiscalCancellationSummary = {
  cancellationId: string;
  recordId: string;
  invoiceId: string;
  invoiceNumber: string;
  recordStatus: "pending";
  mode: "test" | "live";
};

export async function issueFiscalCancellationInTransaction(input: {
  db: Firestore;
  tx: Transaction;
  restaurantId: string;
  actorUid: string;
  invoiceId: string;
  issuedAt: Date;
  reason: string;
}): Promise<FiscalCancellationSummary> {
  const invoiceRef = input.db.collection("fiscalInvoices").doc(input.invoiceId);
  const configRef = input.db.collection("fiscalConfigurations").doc(input.restaurantId);
  const [invoiceSnap, configSnap] = await Promise.all([input.tx.get(invoiceRef), input.tx.get(configRef)]);
  if (!invoiceSnap.exists) throw new Error("FISCAL_INVOICE_NOT_FOUND");
  const invoice = invoiceSnap.data()!;
  const rawConfig = configSnap.data();
  if (!configSnap.exists || !isStoredFiscalConfiguration(rawConfig)) throw new Error("FISCAL_CONFIGURATION_NOT_FOUND");
  const config = rawConfig;
  if (invoice.restaurantId !== input.restaurantId || invoice.taxEntityId !== config.taxEntityId) {
    throw new Error("FISCAL_INVOICE_TENANT_MISMATCH");
  }
  if (config.mode === "demo") throw new Error("FISCAL_CANCELLATION_MODE_INVALID");
  const recordId = stableDocumentId("record", input.invoiceId, "anulacion");
  const cancellationId = stableDocumentId("cancellation", input.invoiceId);
  const cancellationRef = input.db.collection("fiscalCancellations").doc(cancellationId);
  const existing = await input.tx.get(cancellationRef);
  if (existing.exists) {
    return { cancellationId, recordId, invoiceId: input.invoiceId, invoiceNumber: String(invoice.invoiceNumber), recordStatus: "pending", mode: config.mode };
  }
  const originalRecordId = String(invoice.recordId ?? "");
  const originalRecordRef = input.db.collection("fiscalRecords").doc(originalRecordId);
  const ledgerRef = input.db.collection("fiscalRectificationLedgers").doc(input.invoiceId);
  const chainRef = input.db.collection("fiscalChains").doc(stableDocumentId("chain", config.taxEntityId, config.software.installationNumber));
  const [originalRecordSnap, ledgerSnap, chainSnap] = await Promise.all([
    input.tx.get(originalRecordRef), input.tx.get(ledgerRef), input.tx.get(chainRef),
  ]);
  if (!originalRecordSnap.exists) throw new Error("FISCAL_ORIGINAL_RECORD_CORRUPT");
  if (ledgerSnap.exists && Number(ledgerSnap.data()?.creditedCents) > 0) {
    throw new Error("FISCAL_CANCELLATION_HAS_RECTIFICATIONS");
  }
  const previous = chainSnap.exists ? readPrevious(chainSnap.data()?.lastRecord) : null;
  if (chainSnap.exists && !previous) throw new Error("FISCAL_CHAIN_CORRUPT");
  const previousChainSequence = chainSnap.exists ? Number(chainSnap.data()?.sequence) : 0;
  if (!Number.isSafeInteger(previousChainSequence) || previousChainSequence < 0) throw new Error("FISCAL_CHAIN_SEQUENCE_CORRUPT");
  const issuedAtMs = input.issuedAt.getTime();
  const generatedAt = formatAeatDateTime(input.issuedAt, config.timezone);
  const record = buildCancellationRecord({
    issuerNif: config.taxpayer.nif,
    invoiceNumber: String(invoice.invoiceNumber),
    issueDate: String(invoice.issueDate),
    generatedAt,
    previous,
    software: config.software,
  });
  const xmlEnvelope = buildVerifactuSoapEnvelope({ taxpayerLegalName: config.taxpayer.legalName, taxpayerNif: config.taxpayer.nif, records: [record] });
  const chainLastRecord: FiscalRecordPrevious = { issuerNif: record.issuerNif, invoiceNumber: record.invoiceNumber, issueDate: record.issueDate, hash: record.hash };
  input.tx.set(chainRef, { taxEntityId: config.taxEntityId, installationNumber: config.software.installationNumber, sequence: previousChainSequence + 1, lastRecord: chainLastRecord, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalRecords").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId: input.invoiceId, recordId, record, createdAtMs: issuedAtMs, immutable: true, version: HOSTLY_FISCAL_VERSION_SNAPSHOT });
  input.tx.create(cancellationRef, { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, cancellationId, recordId, invoiceId: input.invoiceId, invoiceNumber: invoice.invoiceNumber, reason: input.reason.trim().slice(0, 500), createdBy: input.actorUid, createdAtMs: issuedAtMs, immutable: true });
  input.tx.create(input.db.collection("fiscalOutbox").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId: input.invoiceId, recordId, environment: config.aeatEnvironment, xmlEnvelope, payloadHash: createHash("sha256").update(xmlEnvelope, "utf8").digest("hex"), status: "pending", attempts: 0, nextAttemptAtMs: issuedAtMs, leaseUntilMs: null, createdAtMs: issuedAtMs, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalDeliveryStates").doc(recordId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, invoiceId: input.invoiceId, recordId, status: "pending", attempts: 0, updatedAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalRelations").doc(cancellationId), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, kind: "cancels_record", cancellationId, invoiceId: input.invoiceId, recordId, createdAtMs: issuedAtMs });
  input.tx.create(input.db.collection("fiscalAuditEvents").doc(stableDocumentId("audit", recordId, "issued")), { restaurantId: input.restaurantId, taxEntityId: config.taxEntityId, actorUid: input.actorUid, action: "fiscal_cancellation_record_issued", entityType: "fiscalInvoice", entityId: input.invoiceId, recordId, result: "success", source: "fiscal_api", createdAtMs: issuedAtMs });
  return { cancellationId, recordId, invoiceId: input.invoiceId, invoiceNumber: String(invoice.invoiceNumber), recordStatus: "pending", mode: config.mode };
}
