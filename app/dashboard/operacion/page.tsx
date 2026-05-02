"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CartaPage from "@/app/dashboard/carta/page";
import BarView from "@/components/kds/bar-view";
import KitchenView from "@/components/kds/kitchen-view";
import OperationFilterBar from "@/components/kds/operation-filter-bar";
import { OperationFilterProvider } from "@/components/kds/operation-filter-context";
import SalaView from "@/components/kds/sala-view";
import ReservasView from "@/components/reservas/reservas-view";
import ModulePageShell from "@/components/module-page-shell";

type OperacionTab = "tpv" | "cocina" | "barra" | "sala" | "reservas";

const TABS: { id: OperacionTab; label: string }[] = [
  { id: "tpv", label: "TPV" },
  { id: "cocina", label: "Cocina" },
  { id: "barra", label: "Barra" },
  { id: "sala", label: "Sala" },
  { id: "reservas", label: "Reservas" },
];

const tabBarStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "stretch",
  gap: 2,
  padding: 4,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.55)",
};

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    minWidth: 96,
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    background: active ? "rgba(56, 189, 248, 0.18)" : "transparent",
    color: active ? "#e0f2fe" : "#94a3b8",
    fontWeight: 600,
    fontSize: 14,
    letterSpacing: "-0.02em",
    cursor: "pointer",
  };
}

export default function OperacionPage() {
  return (
    <OperationFilterProvider>
      <OperacionPageInner />
    </OperationFilterProvider>
  );
}

function OperacionPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = ((): OperacionTab => {
    const raw = searchParams.get("tab");
    if (raw === "cocina" || raw === "barra" || raw === "sala" || raw === "reservas" || raw === "tpv") {
      return raw;
    }
    return "tpv";
  })();
  const [tab, setTab] = useState<OperacionTab>(initialTab);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "cocina" || raw === "barra" || raw === "sala" || raw === "reservas" || raw === "tpv") {
      setTab(raw);
    }
  }, [searchParams]);

  const handleChangeTab = (t: OperacionTab) => {
    setTab(t);
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", t);
    router.replace(`/dashboard/operacion?${next.toString()}`);
  };

  if (tab === "tpv") {
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        <CartaPage />
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
          }}
        >
          <OperacionTabsBar active={tab} onChange={handleChangeTab} />
        </div>
      </div>
    );
  }

  return (
    <ModulePageShell
      title="Operación"
      subtitle="Flujo diario del servicio"
      maxWidth={1400}
      compactLayout
      operationalFocus
      lockViewport
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <OperacionTabsBar active={tab} onChange={handleChangeTab} />
          <OperationFilterBar />
        </div>

        {tab === "cocina" ? <KitchenView /> : null}

        {tab === "barra" ? <BarView /> : null}

        {tab === "sala" ? <SalaView /> : null}

        {tab === "reservas" ? <ReservasView /> : null}
      </div>
    </ModulePageShell>
  );
}

function OperacionTabsBar({
  active,
  onChange,
}: {
  active: OperacionTab;
  onChange: (t: OperacionTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Modo de operación"
      style={tabBarStyle}
    >
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          style={tabButtonStyle(active === t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
