"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { searchBillingCustomers as filterBillingCustomers } from "@/lib/billing/search-billing-customers";
import {
  createBillingCustomerDoc,
  deleteBillingCustomerDoc,
  listenBillingCustomers,
  updateBillingCustomerDoc,
} from "@/lib/firestore/billing-customers";
import type { BillingCustomer, BillingCustomerInput } from "@/types/billing-customer";

export function useBillingCustomers(restaurantId: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<{
    restaurantId: string;
    customers: BillingCustomer[];
    error: string | null;
  } | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  const currentSnapshot = snapshot?.restaurantId === rid ? snapshot : null;
  const customers = useMemo(
    () => (rid ? (currentSnapshot?.customers ?? []) : []),
    [currentSnapshot, rid],
  );
  const loading = Boolean(rid && !currentSnapshot);
  const error = rid ? (mutationError ?? currentSnapshot?.error ?? null) : null;

  useEffect(() => {
    if (!rid) return;
    const unsub = listenBillingCustomers(
      rid,
      (items) => {
        setSnapshot({ restaurantId: rid, customers: items, error: null });
      },
      (listenError) => {
        const message =
          listenError instanceof Error
            ? listenError.message
            : "No se pudieron cargar las empresas de facturación.";
        setSnapshot({ restaurantId: rid, customers: [], error: message });
      },
    );

    return () => unsub();
  }, [rid]);

  const createBillingCustomer = useCallback(
    async (input: BillingCustomerInput): Promise<BillingCustomer> => {
      if (!rid) throw new Error("Restaurante no disponible");
      setMutationError(null);
      try {
        return await createBillingCustomerDoc(rid, input);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "No se pudo guardar la empresa.";
        setMutationError(message);
        throw e;
      }
    },
    [rid],
  );

  const updateBillingCustomer = useCallback(
    async (customerId: string, input: BillingCustomerInput): Promise<void> => {
      if (!rid) throw new Error("Restaurante no disponible");
      setMutationError(null);
      try {
        await updateBillingCustomerDoc(rid, customerId, input);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "No se pudo actualizar la empresa.";
        setMutationError(message);
        throw e;
      }
    },
    [rid],
  );

  const deleteBillingCustomer = useCallback(
    async (customerId: string): Promise<void> => {
      if (!rid) throw new Error("Restaurante no disponible");
      setMutationError(null);
      try {
        await deleteBillingCustomerDoc(rid, customerId);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "No se pudo eliminar la empresa.";
        setMutationError(message);
        throw e;
      }
    },
    [rid],
  );

  const searchBillingCustomers = useCallback(
    (query: string, limit?: number) => filterBillingCustomers(customers, query, limit),
    [customers],
  );

  return {
    customers,
    loading,
    error,
    createBillingCustomer,
    updateBillingCustomer,
    deleteBillingCustomer,
    searchBillingCustomers,
  };
}
