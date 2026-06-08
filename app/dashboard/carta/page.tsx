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
    const handler = (e: any) => {
      setTablesReadyToClose(new Set(e.detail ?? []));
    };

    const clearHandler = (e: any) => {
      const tableId = e.detail;
      setTablesReadyToClose((prev) => {
        const next = new Set(prev);
        next.delete(tableId);
        return next;
      });
    };

    window.addEventListener("tablesReadyToClose:update", handler);
    window.addEventListener("tablesReadyToClose:clear", clearHandler);
    return () => {
      window.removeEventListener("tablesReadyToClose:update", handler);
      window.removeEventListener("tablesReadyToClose:clear", clearHandler);
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
