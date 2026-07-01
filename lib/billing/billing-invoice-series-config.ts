import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  DEFAULT_BILLING_INVOICE_SERIES_CONFIG,
  type BillingInvoiceSeriesConfig,
} from "@/types/billing-invoice-config";

const SETTINGS_COLLECTION = "billingInvoiceSettings";

function parseSeriesConfig(raw: unknown): BillingInvoiceSeriesConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_BILLING_INVOICE_SERIES_CONFIG };
  }
  const data = raw as Record<string, unknown>;
  const defaultSeriesCode =
    typeof data.defaultSeriesCode === "string" && data.defaultSeriesCode.trim()
      ? data.defaultSeriesCode.trim()
      : DEFAULT_BILLING_INVOICE_SERIES_CONFIG.defaultSeriesCode;
  const paddingRaw = Number(data.numberPadding);
  const numberPadding =
    Number.isFinite(paddingRaw) && paddingRaw >= 3 && paddingRaw <= 12
      ? Math.round(paddingRaw)
      : DEFAULT_BILLING_INVOICE_SERIES_CONFIG.numberPadding;

  return { defaultSeriesCode, numberPadding };
}

/** Lee configuración de serie por restaurante; defaults seguros si no existe doc. */
export async function getBillingInvoiceSeriesConfig(
  restaurantId: string,
): Promise<BillingInvoiceSeriesConfig> {
  const rid = restaurantId.trim();
  if (!rid) return { ...DEFAULT_BILLING_INVOICE_SERIES_CONFIG };

  const snap = await getDoc(doc(db, SETTINGS_COLLECTION, rid));
  if (!snap.exists()) return { ...DEFAULT_BILLING_INVOICE_SERIES_CONFIG };
  return parseSeriesConfig(snap.data());
}

export function formatBillingInvoiceNumber(
  config: BillingInvoiceSeriesConfig,
  year: number,
  sequence: number,
): { invoiceNumber: string; invoiceSeries: string } {
  const invoiceSeries = config.defaultSeriesCode.trim() || "A";
  const padded = String(Math.max(0, Math.floor(sequence))).padStart(
    config.numberPadding,
    "0",
  );
  return {
    invoiceSeries,
    invoiceNumber: `${invoiceSeries}-${year}-${padded}`,
  };
}
