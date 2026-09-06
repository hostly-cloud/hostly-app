import { createHash, randomUUID } from "node:crypto";
import type {
  AeatIndirectTaxCode,
  FiscalAddress,
  FiscalConfiguration,
  FiscalOperatingMode,
  FiscalSeries,
} from "@/lib/fiscal/model";
import { assertFiscalLiveWindowOpen } from "@/lib/fiscal/live-activation-policy";
import { assertValidSpanishTaxId } from "@/lib/fiscal/nif";
import {
  currentResponsibleDeclaration,
  isResponsibleDeclarationPublishedForCurrentVersion,
} from "@/lib/fiscal/responsible-declaration";
import {
  HOSTLY_FISCAL_MODULE_VERSION,
  HOSTLY_SIF_VERSION,
} from "@/lib/fiscal/version";

export const DEFAULT_FISCAL_SERIES: readonly FiscalSeries[] = [
  { code: "FS", kind: "simplified", resetEachYear: true, numberPadding: 6, active: true },
  { code: "FC", kind: "complete", resetEachYear: true, numberPadding: 6, active: true },
  { code: "FR", kind: "rectification", resetEachYear: true, numberPadding: 6, active: true },
] as const;

export type FiscalConfigurationInput = {
  mode: FiscalOperatingMode;
  taxpayerLegalName: string;
  taxpayerNif: string;
  taxpayerAddress: FiscalAddress;
  establishmentName: string;
  establishmentAddress: FiscalAddress;
  timezone: string;
  indirectTaxCode?: AeatIndirectTaxCode;
  defaultVatRateBps: number | null;
  series?: FiscalSeries[];
};

export type FiscalReadinessCheck = {
  key: "company" | "nif" | "address" | "series" | "taxSystem" | "taxes" | "verifactu" | "authorization" | "declaration";
  ready: boolean;
  label: string;
};

function cleanText(value: unknown, field: string, maxLength: number): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.length > maxLength) throw new Error(`${field}_INVALID`);
  return result;
}

function normalizeAddress(value: FiscalAddress, field: string): FiscalAddress {
  return {
    line1: cleanText(value?.line1, `${field}_LINE1`, 200),
    postalCode: cleanText(value?.postalCode, `${field}_POSTAL_CODE`, 12),
    city: cleanText(value?.city, `${field}_CITY`, 100),
    province: cleanText(value?.province, `${field}_PROVINCE`, 100),
    countryCode: cleanText(value?.countryCode, `${field}_COUNTRY`, 2).toUpperCase(),
  };
}

function assertTimeZone(timezone: string): string {
  const result = cleanText(timezone, "FISCAL_TIMEZONE", 100);
  try { new Intl.DateTimeFormat("es-ES", { timeZone: result }).format(new Date(0)); }
  catch { throw new Error("FISCAL_TIMEZONE_INVALID"); }
  return result;
}

function normalizeIndirectTaxCode(value: unknown): AeatIndirectTaxCode {
  const code = value == null ? "01" : String(value).trim();
  if (code !== "01" && code !== "02" && code !== "03") throw new Error("FISCAL_INDIRECT_TAX_INVALID");
  return code;
}

function normalizeSeries(input: FiscalSeries[] | undefined): FiscalSeries[] {
  const rows = input?.length ? input : [...DEFAULT_FISCAL_SERIES];
  const seen = new Set<string>();
  const result = rows.map((row) => {
    const code = cleanText(row.code, "FISCAL_SERIES_CODE", 20).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{0,19}$/.test(code)) throw new Error("FISCAL_SERIES_CODE_INVALID");
    if (seen.has(code)) throw new Error("FISCAL_SERIES_DUPLICATED");
    seen.add(code);
    if (!["simplified", "complete", "rectification"].includes(row.kind)) throw new Error("FISCAL_SERIES_KIND_INVALID");
    if (!Number.isInteger(row.numberPadding) || row.numberPadding < 1 || row.numberPadding > 12) throw new Error("FISCAL_SERIES_PADDING_INVALID");
    return { code, kind: row.kind, resetEachYear: row.resetEachYear !== false, numberPadding: row.numberPadding, active: row.active !== false };
  });
  for (const kind of ["simplified", "complete", "rectification"] as const) {
    if (!result.some((row) => row.kind === kind && row.active)) throw new Error(`FISCAL_SERIES_${kind.toUpperCase()}_REQUIRED`);
  }
  return result;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function buildFiscalConfiguration(input: { restaurantId: string; value: FiscalConfigurationInput; existing?: FiscalConfiguration | null }): FiscalConfiguration {
  const restaurantId = cleanText(input.restaurantId, "RESTAURANT_ID", 200);
  const mode = input.value.mode;
  if (!(["demo", "test", "live"] as const).includes(mode)) throw new Error("FISCAL_MODE_INVALID");
  const nif = assertValidSpanishTaxId(input.value.taxpayerNif);
  const defaultVatRateBps = input.value.defaultVatRateBps;
  if (defaultVatRateBps != null && (!Number.isInteger(defaultVatRateBps) || defaultVatRateBps < 0 || defaultVatRateBps > 10_000)) throw new Error("FISCAL_DEFAULT_VAT_INVALID");
  const taxEntityId = stableId("tax", nif);
  const existingSameTaxpayer = input.existing?.taxEntityId === taxEntityId;
  return {
    schemaVersion: 1,
    restaurantId,
    taxEntityId,
    establishmentId: existingSameTaxpayer ? input.existing!.establishmentId : stableId("est", `${restaurantId}\u0000${nif}`),
    mode,
    status: "draft",
    taxpayer: { id: taxEntityId, legalName: cleanText(input.value.taxpayerLegalName, "FISCAL_LEGAL_NAME", 120), nif, address: normalizeAddress(input.value.taxpayerAddress, "FISCAL_TAXPAYER_ADDRESS") },
    establishmentName: cleanText(input.value.establishmentName, "FISCAL_ESTABLISHMENT_NAME", 120),
    establishmentAddress: normalizeAddress(input.value.establishmentAddress, "FISCAL_ESTABLISHMENT_ADDRESS"),
    timezone: assertTimeZone(input.value.timezone),
    currency: "EUR",
    indirectTaxCode: normalizeIndirectTaxCode(input.value.indirectTaxCode),
    defaultVatRateBps,
    series: normalizeSeries(input.value.series),
    software: {
      producerLegalName: process.env.HOSTLY_FISCAL_PRODUCER_LEGAL_NAME?.trim() || "HOSTLY CLOUD",
      producerNif: process.env.HOSTLY_FISCAL_PRODUCER_NIF?.trim().toUpperCase() || "PENDING",
      systemName: "Hostly", systemId: "H1", version: HOSTLY_FISCAL_MODULE_VERSION,
      installationNumber: existingSameTaxpayer ? input.existing!.software.installationNumber : randomUUID(),
      onlyVerifactuCapable: true, multiTaxpayerCapable: true, multipleTaxpayersUsed: true,
    },
    responsibleDeclaration: currentResponsibleDeclaration(),
    aeatEnvironment: mode === "live" ? "production" : "test",
    certificateSecretResource: existingSameTaxpayer ? input.existing!.certificateSecretResource : null,
    representationVerifiedAt: existingSameTaxpayer ? input.existing!.representationVerifiedAt : null,
    activatedAt: null,
    activatedBy: null,
  };
}

export function fiscalReadiness(config: FiscalConfiguration): FiscalReadinessCheck[] {
  const validProducer = config.software.producerNif !== "PENDING" && (() => { try { assertValidSpanishTaxId(config.software.producerNif); return true; } catch { return false; } })();
  return [
    { key: "company", label: "Empresa", ready: Boolean(config.taxpayer.legalName) },
    { key: "nif", label: "NIF", ready: (() => { try { assertValidSpanishTaxId(config.taxpayer.nif); return true; } catch { return false; } })() },
    { key: "address", label: "Dirección", ready: Boolean(config.taxpayer.address.line1 && config.taxpayer.address.postalCode && config.taxpayer.address.city) },
    { key: "series", label: "Series", ready: (["simplified", "complete", "rectification"] as const).every((kind) => config.series.some((row) => row.kind === kind && row.active)) },
    { key: "taxSystem", label: "Impuesto indirecto (IVA / IPSI / IGIC)", ready: config.indirectTaxCode === "01" || config.indirectTaxCode === "02" || config.indirectTaxCode === "03" },
    { key: "taxes", label: "Tipo impositivo predeterminado", ready: config.defaultVatRateBps != null },
    { key: "verifactu", label: "VERI*FACTU", ready: validProducer && config.software.onlyVerifactuCapable },
    { key: "authorization", label: "Certificado de envío AEAT", ready: Boolean(config.certificateSecretResource) },
    { key: "declaration", label: "Declaración responsable de esta versión", ready: isResponsibleDeclarationPublishedForCurrentVersion(config.responsibleDeclaration) },
  ];
}

export function assertFiscalConfigurationCanActivate(config: FiscalConfiguration, requestedMode: "test" | "live", nowMs = Date.now()): void {
  if (config.mode !== requestedMode) throw new Error("FISCAL_ACTIVATION_MODE_MISMATCH");
  const missing = fiscalReadiness(config).filter((check) => !check.ready && (requestedMode === "live" || check.key !== "declaration")).map((check) => check.key);
  if (missing.length) throw new Error(`FISCAL_CONFIGURATION_INCOMPLETE:${missing.join(",")}`);
  if (requestedMode === "live") assertFiscalLiveWindowOpen(nowMs);
  if (requestedMode === "live" && process.env.HOSTLY_FISCAL_LIVE_ACTIVATION_ENABLED !== "true") throw new Error("FISCAL_LIVE_ACTIVATION_DISABLED");
  if (requestedMode === "live" && process.env.HOSTLY_AEAT_PRODUCTION_SUBMISSION_ENABLED !== "true") throw new Error("FISCAL_AEAT_PRODUCTION_SUBMISSION_DISABLED");
  if (requestedMode === "live" && config.aeatEnvironment !== "production") throw new Error("FISCAL_LIVE_ENVIRONMENT_INVALID");
  if (config.software.version !== HOSTLY_FISCAL_MODULE_VERSION || HOSTLY_SIF_VERSION !== "1.0") throw new Error("FISCAL_SOFTWARE_VERSION_MISMATCH");
}

export function isStoredFiscalConfiguration(value: unknown): value is FiscalConfiguration {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<FiscalConfiguration>;
  return row.schemaVersion === 1 && typeof row.restaurantId === "string" && typeof row.taxEntityId === "string" && typeof row.establishmentId === "string" && (["demo", "test", "live"] as const).includes(row.mode as FiscalOperatingMode) && Array.isArray(row.series) && Boolean(row.taxpayer && row.software);
}
