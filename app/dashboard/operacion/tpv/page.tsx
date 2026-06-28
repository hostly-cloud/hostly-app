"use client";

import { useCallback, useEffect, useState } from "react";
import { CartaPageContent } from "@/app/dashboard/carta/carta-page-content";
import { useAuth } from "@/components/auth/auth-context";
import { ActiveOperatorProvider } from "@/components/tpv/active-operator-context";
import { ActiveOperatorGate } from "@/components/tpv/active-operator-gate";
import { useTableGroups } from "@/hooks/useTableGroups";
import { OperacionModuleShell } from "../_components/operacion-module-shell";

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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* TODO REMOVE DEBUG DEPLOY HOSTLY */}
            <div
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                zIndex: 40,
                pointerEvents: "none",
              }}
            >
              <button
                type="button"
                aria-label="DEBUG DEPLOY HOSTLY"
                style={{
                  pointerEvents: "auto",
                  margin: 0,
                  padding: "4px 10px",
                  border: "2px solid #dc2626",
                  borderRadius: 8,
                  background: "#fef08a",
                  color: "#7f1d1d",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  cursor: "default",
                  boxShadow: "0 0 0 1px rgba(220, 38, 38, 0.35)",
                }}
              >
                DEBUG DEPLOY HOSTLY
              </button>
            </div>
            <CartaPageContent
              embeddedInOperacion
              tablesReadyToClose={tablesReadyToClose}
              groupedTablesMapHandlers={groupedTablesMapHandlers}
              onEmbeddedOperacionChromeChange={handleEmbeddedOperacionChromeChange}
            />
          </div>
        </ActiveOperatorGate>
      </OperacionModuleShell>
    </ActiveOperatorProvider>
  );
}
