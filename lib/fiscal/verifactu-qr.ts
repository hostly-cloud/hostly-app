import type { AeatEnvironment } from "@/lib/fiscal/model";
import { formatAeatAmount } from "@/lib/fiscal/money";

const QR_BASE: Record<AeatEnvironment, Record<"verifactu" | "no_verifactu", string>> = {
  test: {
    verifactu: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
    no_verifactu: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu",
  },
  production: {
    verifactu: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
    no_verifactu: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu",
  },
};

export const AEAT_QR_SPECIFICATION = Object.freeze({
  minSizeMm: 30,
  maxSizeMm: 40,
  errorCorrectionLevel: "M" as const,
  leadingText: "QR tributario:",
  verifactuText: "Factura verificable en la sede electrónica de la AEAT",
  quietZoneMinimumMm: 2,
  quietZoneRecommendedMm: 6,
});

export type BuildAeatQrUrlInput = {
  environment: AeatEnvironment;
  mode: "verifactu" | "no_verifactu";
  issuerNif: string;
  invoiceNumber: string;
  issueDate: string;
  totalCents: number;
};

export function buildAeatQrUrl(input: BuildAeatQrUrlInput): string {
  const nif = input.issuerNif.trim().toUpperCase();
  const invoiceNumber = input.invoiceNumber.trim();
  if (!/^[A-Z0-9]{9}$/.test(nif)) throw new Error("AEAT_QR_NIF_INVALID");
  if (!invoiceNumber || invoiceNumber.length > 60) throw new Error("AEAT_QR_INVOICE_NUMBER_INVALID");
  if (!/^\d{2}-\d{2}-\d{4}$/.test(input.issueDate)) throw new Error("AEAT_QR_DATE_INVALID");
  const params = new URLSearchParams({
    nif,
    numserie: invoiceNumber,
    fecha: input.issueDate,
    importe: formatAeatAmount(input.totalCents),
  });
  return `${QR_BASE[input.environment][input.mode]}?${params.toString()}`;
}
