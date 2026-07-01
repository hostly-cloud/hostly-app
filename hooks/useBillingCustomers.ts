"use client";

import { useCallback, useEffect, useState } from "react";
import { searchBillingCustomers as filterBillingCustomers } from "@/lib/billing/search-billing-customers";
import {
  createBillingCustomerDoc,
  deleteBillingCustomerDoc,
  listenBillingCustomers,
  updateBillingCustomerDoc,
} from "@/lib/firestore/billing-customers";
import type { BillingCustomer, BillingCustomerInput } from "@/types/billing-customer";

export function useBillingCustomers(restaurantId: string | null | undefined) {
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";

  useEffect(() => {
    if (!rid) {
      setCustomers([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsub = listenBillingCustomers(
      rid,
      (items) => {
        setCustomers(items);
        setLoading(false);
        setError(null);
      },
      (listenError) => {
        const message =
          listenError instanceof Error
            ? listenError.message
            : "No se pudieron cargar las empresas de facturación.";
        setError(message);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [rid]);

  const createBillingCustomer = useCallback(
    async (input: BillingCustomerInput): Promise<BillingCustomer> => {
      if (!rid) throw new Error("Restaurante no disponible");
      setError(null);
      try {
        return await createBillingCustomerDoc(rid, input);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "No se pudo guardar la empresa.";
        setError(message);
        throw e;
      }
    },
    [rid],
  );

  const updateBillingCustomer = useCallback(
    async (customerId: string, input: BillingCustomerInput): Promise<void> => {
      if (!rid) throw new Error("Restaurante no disponible");
      setError(null);
      try {
        await updateBillingCustomerDoc(rid, customerId, input);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "No se pudo actualizar la empresa.";
        setError(message);
        throw e;
      }
    },
    [rid],
  );

  const deleteBillingCustomer = useCallback(
    async (customerId: string): Promise<void> => {
      if (!rid) throw new Error("Restaurante no disponible");
      setError(null);
      try {
        await deleteBillingCustomerDoc(rid, customerId);
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "No se pudo eliminar la empresa.";
        setError(message);
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
