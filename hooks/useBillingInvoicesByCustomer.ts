"use client";

import { useEffect, useState } from "react";
import { listenBillingInvoicesByCustomer } from "@/lib/firestore/billing-invoices";
import type { BillingInvoice } from "@/types/billing-invoice";

/** Base histórica billingCustomer → billingInvoices (sin UI todavía). */
export function useBillingInvoicesByCustomer(
  restaurantId: string | null | undefined,
  billingCustomerId: string | null | undefined,
) {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  const cid = typeof billingCustomerId === "string" ? billingCustomerId.trim() : "";

  useEffect(() => {
    if (!rid || !cid) {
      setInvoices([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsub = listenBillingInvoicesByCustomer(
      rid,
      cid,
      (items) => {
        setInvoices(items);
        setLoading(false);
        setError(null);
      },
      (listenError) => {
        setError(
          listenError instanceof Error
            ? listenError.message
            : "No se pudo cargar el histórico de facturas.",
        );
        setLoading(false);
      },
    );

    return () => unsub();
  }, [rid, cid]);

  return { invoices, loading, error };
}
