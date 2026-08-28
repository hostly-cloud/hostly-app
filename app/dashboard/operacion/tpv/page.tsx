"use client";

import { useCallback, useEffect, useState } from "react";
import { CartaPageContent } from "@/app/dashboard/carta/carta-page-content";
import { useAuth } from "@/components/auth/auth-context";
import { ActiveOperatorProvider } from "@/components/tpv/active-operator-context";
import { ActiveOperatorGate } from "@/components/tpv/active-operator-gate";
import { useTableGroups } from "@/hooks/useTableGroups";
import { OperacionModuleShell } from "../_components/operacion-module-shell";
import { TpvEditorV2ReadyGate } from "./_components/tpv-editor-v2-ready-gate";
import "./tpv-map-modern.css";
import "./tpv-map-polish-v2.css";

export default function OperacionTpvPage() {
  const { restaurantId } = useAuth();
  const restaurantIdTrimmed = restaurantId?.trim() ?? null;

  const [tablesReadyToClose, setTablesReadyToClose] = useState<Set<string>>(
    () => new Set(),
  );
  const [hideShellTopBar, setHideShellTopBar] = useState(false);

  const handleEmbeddedOperacionChromeChange = useCallback(
    (state: { hideShellTopBar: boolean }) => {
      setHideShellTopBar(state.hideShellTopBar);
    },
    [],
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
      <OperacionModuleShell title="TPV" hideTopBar={hideShellTopBar}>
        <ActiveOperatorGate>
          <TpvEditorV2ReadyGate restaurantId={restaurantIdTrimmed}>
            <CartaPageContent
              embeddedInOperacion
              tablesReadyToClose={tablesReadyToClose}
              groupedTablesMapHandlers={groupedTablesMapHandlers}
              onEmbeddedOperacionChromeChange={handleEmbeddedOperacionChromeChange}
            />
          </TpvEditorV2ReadyGate>
        </ActiveOperatorGate>
      </OperacionModuleShell>
    </ActiveOperatorProvider>
  );
}
