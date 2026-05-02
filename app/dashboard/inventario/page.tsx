"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import InventarioStockSection from "@/app/dashboard/inventario/inventario-stock-section";
import ModulePageShell from "@/components/module-page-shell";

type InventarioTab = "stock" | "compras" | "recepciones" | "mermas";

const TABS: { id: InventarioTab; label: string }[] = [
  { id: "stock", label: "Stock" },
  { id: "compras", label: "Compras" },
  { id: "recepciones", label: "Recepciones" },
  { id: "mermas", label: "Mermas" },
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

const placeholderStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.55)",
  color: "#94a3b8",
  fontSize: 14,
  fontWeight: 600,
  textAlign: "center",
  lineHeight: 1.5,
};

export default function InventarioPage() {
  const [tab, setTab] = useState<InventarioTab>("stock");

  if (tab === "stock") {
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        <InventarioStockSection />
        <FloatingTabs active={tab} onChange={setTab} />
      </div>
    );
  }

  return (
    <ModulePageShell
      title="Inventario"
      subtitle="Stock, compras, recepciones y mermas"
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
        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <InventarioTabsBar active={tab} onChange={setTab} />
        </div>

        {tab === "compras" ? (
          <div style={placeholderStyle}>Compras — próximamente</div>
        ) : null}
        {tab === "recepciones" ? (
          <div style={placeholderStyle}>Recepciones — próximamente</div>
        ) : null}
        {tab === "mermas" ? (
          <div style={placeholderStyle}>Mermas — próximamente</div>
        ) : null}
      </div>
    </ModulePageShell>
  );
}

function InventarioTabsBar({
  active,
  onChange,
}: {
  active: InventarioTab;
  onChange: (t: InventarioTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Secciones de inventario" style={tabBarStyle}>
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

function FloatingTabs({
  active,
  onChange,
}: {
  active: InventarioTab;
  onChange: (t: InventarioTab) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
      }}
    >
      <InventarioTabsBar active={active} onChange={onChange} />
    </div>
  );
}
