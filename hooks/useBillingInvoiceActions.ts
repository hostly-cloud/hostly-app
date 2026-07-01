"use client";

import { useCallback, useState } from "react";
import {
  downloadBillingInvoicePdf,
  printBillingInvoicePdf,
} from "@/lib/billing/generate-billing-invoice-pdf";
import {
  prepareInvoiceEmail,
  sendPreparedInvoiceEmail,
} from "@/lib/billing/prepare-invoice-email";
import { markBillingInvoiceSent } from "@/lib/firestore/billing-invoices";
import type { BillingInvoice } from "@/types/billing-invoice";

export function useBillingInvoiceActions() {
  const [isSending, setIsSending] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);

  const downloadPdf = useCallback((invoice: BillingInvoice) => {
    downloadBillingInvoicePdf(invoice);
  }, []);

  const printPdf = useCallback((invoice: BillingInvoice) => {
    printBillingInvoicePdf(invoice);
  }, []);

  const sendInvoice = useCallback(async (invoice: BillingInvoice) => {
    setIsSending(true);
    setSendMessage(null);
    try {
      const { prepared, canSend, reasonIfBlocked } = prepareInvoiceEmail(invoice);
      if (!canSend) {
        throw new Error(reasonIfBlocked ?? "No se puede enviar la factura.");
      }
      const result = await sendPreparedInvoiceEmail(prepared);
      if (!result.ok) {
        throw new Error(result.message);
      }
      await markBillingInvoiceSent(invoice.id);
      setSendMessage(result.message);
      return result;
    } finally {
      setIsSending(false);
    }
  }, []);

  return {
    isSending,
    sendMessage,
    downloadPdf,
    printPdf,
    sendInvoice,
  };
}
