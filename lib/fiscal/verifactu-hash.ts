import { createHash } from "node:crypto";
import type {
  FiscalCancellationRecord,
  FiscalRegistrationRecord,
} from "@/lib/fiscal/model";
import { formatAeatAmount } from "@/lib/fiscal/money";

type RegistrationHashInput = Pick<
  FiscalRegistrationRecord,
  "issuerNif" | "invoiceNumber" | "issueDate" | "invoiceType" | "taxAmountCents" | "totalCents" | "generatedAt"
> & { previousHash: string | null };

type CancellationHashInput = Pick<
  FiscalCancellationRecord,
  "issuerNif" | "invoiceNumber" | "issueDate" | "generatedAt"
> & { previousHash: string | null };

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function sha256UpperHex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").toUpperCase();
}

export function buildRegistrationHashInput(input: RegistrationHashInput): string {
  return [
    ["IDEmisorFactura", clean(input.issuerNif)],
    ["NumSerieFactura", clean(input.invoiceNumber)],
    ["FechaExpedicionFactura", clean(input.issueDate)],
    ["TipoFactura", input.invoiceType],
    ["CuotaTotal", formatAeatAmount(input.taxAmountCents)],
    ["ImporteTotal", formatAeatAmount(input.totalCents)],
    ["Huella", clean(input.previousHash)],
    ["FechaHoraHusoGenRegistro", clean(input.generatedAt)],
  ]
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

export function calculateRegistrationHash(input: RegistrationHashInput): string {
  return sha256UpperHex(buildRegistrationHashInput(input));
}

export function buildCancellationHashInput(input: CancellationHashInput): string {
  return [
    ["IDEmisorFacturaAnulada", clean(input.issuerNif)],
    ["NumSerieFacturaAnulada", clean(input.invoiceNumber)],
    ["FechaExpedicionFacturaAnulada", clean(input.issueDate)],
    ["Huella", clean(input.previousHash)],
    ["FechaHoraHusoGenRegistro", clean(input.generatedAt)],
  ]
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

export function calculateCancellationHash(input: CancellationHashInput): string {
  return sha256UpperHex(buildCancellationHashInput(input));
}
