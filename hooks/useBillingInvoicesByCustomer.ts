"use client";

import { useEffect, useState } from "react";
import { listenBillingInvoicesByCustomer } from "@/lib/firestore/billing-invoices";
import type { BillingInvoice } from "@/types/billing-invoice";

/** Base histórica billingCustomer → billingInvoices (sin UI todavía). */
export function useBillingInvoicesByCustomer(
  restaurantId: string | null | undefined,
  billingCustomerId: string | null | undefined,
) {
  const [snapshot, setSnapshot] = useState<{
    key: string;
    invoices: BillingInvoice[];
    error: string | null;
  } | null>(null);

  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  const cid = typeof billingCustomerId === "string" ? billingCustomerId.trim() : "";
  const key = rid && cid ? `${rid}:${cid}` : "";
  const currentSnapshot = snapshot?.key === key ? snapshot : null;
  const invoices = key ? (currentSnapshot?.invoices ?? []) : [];
  const loading = Boolean(key && !currentSnapshot);
  const error = key ? (currentSnapshot?.error ?? null) : null;

  useEffect(() => {
    if (!rid || !cid) return;
    const unsub = listenBillingInvoicesByCustomer(
      rid,
      cid,
      (items) => {
        setSnapshot({ key, invoices: items, error: null });
      },
      (listenError) => {
        setSnapshot({
          key,
          invoices: [],
          error:
            listenError instanceof Error
              ? listenError.message
              : "No se pudo cargar el histórico de facturas.",
        });
      },
    );

    return () => unsub();
  }, [rid, cid, key]);

  return { invoices, loading, error };
}
