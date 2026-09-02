"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { ActiveOperatorProvider } from "@/components/tpv/active-operator-context";
import { ActiveOperatorGate } from "@/components/tpv/active-operator-gate";
import { useTableGroups } from "@/hooks/useTableGroups";
import { CartaPageContent } from "./carta-page-content";

export default function CartaPage() {
  const { restaurantId } = useAuth();
  const restaurantIdTrimmed = restaurantId?.trim() ?? null;

  const [tablesReadyToClose, setTablesReadyToClose] = useState<Set<string>>(
    () => new Set(),
  );

  const { groupedTablesMapHandlers } = useTableGroups({
    restaurantId: restaurantIdTrimmed,
  });

  useEffect(() => {
    const handler = (e: CustomEvent<string[]>) => {
      setTablesReadyToClose(new Set(e.detail ?? []));
    };

    const clearHandler = (e: CustomEvent<string>) => {
      const tableId = e.detail;
      setTablesReadyToClose((prev) => {
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
    };

    window.addEventListener("tablesReadyToClose:update", handler as EventListener);
    window.addEventListener("tablesReadyToClose:clear", clearHandler as EventListener);
    return () => {
      window.removeEventListener("tablesReadyToClose:update", handler as EventListener);
      window.removeEventListener("tablesReadyToClose:clear", clearHandler as EventListener);
    };
  }, []);

  return (
    <ActiveOperatorProvider restaurantId={restaurantIdTrimmed}>
      <ActiveOperatorGate>
        <CartaPageContent
          tablesReadyToClose={tablesReadyToClose}
          groupedTablesMapHandlers={groupedTablesMapHandlers}
        />
      </ActiveOperatorGate>
    </ActiveOperatorProvider>
  );
}
