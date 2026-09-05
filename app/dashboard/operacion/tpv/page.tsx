"use client";

import { useCallback, useEffect, useState } from "react";
import { CartaPageContent } from "@/app/dashboard/carta/carta-page-content";
import { useAuth } from "@/components/auth/auth-context";
import { ActiveOperatorProvider } from "@/components/tpv/active-operator-context";
import { ActiveOperatorGate } from "@/components/tpv/active-operator-gate";
import { TpvProductInfoPlanGuard } from "@/components/tpv/tpv-product-info-plan-guard";
import { useTableGroups } from "@/hooks/useTableGroups";
import { preloadTpvEditorV2OperationalMap } from "@/lib/tpv/load-editor-v2-operational-map";
import { OperacionModuleShell } from "../_components/operacion-module-shell";
import { TpvEditorV2ReadyGate } from "./_components/tpv-editor-v2-ready-gate";
import { TpvVoiceCommandButton } from "./_components/tpv-voice-command-button";
import { TpvVoiceCommandRuntime } from "./_components/tpv-voice-command-runtime";
import { TpvCustomerControl } from "./_components/tpv-customer-control";
import "./tpv-map-modern.css";
import "./tpv-map-polish-v2.css";

export default function OperacionTpvPage() {
  const { restaurantId } = useAuth();
  const restaurantIdTrimmed = restaurantId?.trim() ?? null;
  const [tablesReadyToClose, setTablesReadyToClose] = useState<Set<string>>(() => new Set());
  const [hideShellTopBar, setHideShellTopBar] = useState(false);

  const handleEmbeddedOperacionChromeChange = useCallback((state: { hideShellTopBar: boolean }) => { setHideShellTopBar(state.hideShellTopBar); }, []);
  const { groupedTablesMapHandlers } = useTableGroups({ restaurantId: restaurantIdTrimmed });

  useEffect(() => {
    const rid = restaurantIdTrimmed?.trim() ?? ""; if (!rid) return;
    void preloadTpvEditorV2OperationalMap(rid).catch((error) => {
      console.warn("[TPV] preload del plano V2 no disponible", { restaurantId: rid, error: error instanceof Error ? error.message : String(error) });
    });
  }, [restaurantIdTrimmed]);

  useEffect(() => {
    const handler = (e: CustomEvent<string[]>) => { setTablesReadyToClose(new Set(e.detail ?? [])); };
    const clearHandler = (e: CustomEvent<string>) => { const tableId = e.detail; setTablesReadyToClose((prev) => { const next = new Set(prev); next.delete(tableId); return next; }); };
    window.addEventListener("tablesReadyToClose:update", handler as EventListener);
    window.addEventListener("tablesReadyToClose:clear", clearHandler as EventListener);
    return () => { window.removeEventListener("tablesReadyToClose:update", handler as EventListener); window.removeEventListener("tablesReadyToClose:clear", clearHandler as EventListener); };
  }, []);

  return (
    <ActiveOperatorProvider restaurantId={restaurantIdTrimmed}>
      <TpvProductInfoPlanGuard />
      <OperacionModuleShell title="TPV" hideTopBar={hideShellTopBar}>
        <ActiveOperatorGate>
          <TpvEditorV2ReadyGate restaurantId={restaurantIdTrimmed}>
            <CartaPageContent embeddedInOperacion tablesReadyToClose={tablesReadyToClose} groupedTablesMapHandlers={groupedTablesMapHandlers} onEmbeddedOperacionChromeChange={handleEmbeddedOperacionChromeChange} />
          </TpvEditorV2ReadyGate>
        </ActiveOperatorGate>
      </OperacionModuleShell>
      <div className="hidden xl:block">
        <TpvCustomerControl />
      </div>
      <TpvVoiceCommandRuntime />
      <TpvVoiceCommandButton />
    </ActiveOperatorProvider>
  );
}
