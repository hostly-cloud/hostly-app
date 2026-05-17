"use client";

import { useState } from "react";
import InventarioStockSection from "@/app/dashboard/inventario/inventario-stock-section";
import HostlyComprasSection from "@/components/inventario/compras-section";
import ModulePageShell from "@/components/module-page-shell";

type InventarioTab = "stock" | "compras" | "recepciones" | "mermas";

const TABS: { id: InventarioTab; label: string }[] = [
  { id: "stock", label: "Stock" },
  { id: "compras", label: "Compras" },
  { id: "recepciones", label: "Recepciones" },
  { id: "mermas", label: "Mermas" },
];

const placeholderStyle = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 24px",
  color: "var(--hostly-ink-muted)",
  fontSize: 14,
  fontWeight: 650,
  textAlign: "center",
  lineHeight: 1.5,
} as const;

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
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <HostlyComprasSection embedded />
          </div>
        ) : null}
        {tab === "recepciones" ? (
          <div className="hostly-panel-soft" style={placeholderStyle}>Recepciones — próximamente</div>
        ) : null}
        {tab === "mermas" ? (
          <div className="hostly-panel-soft" style={placeholderStyle}>Mermas — próximamente</div>
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
    <div role="tablist" aria-label="Secciones de inventario" className="hostly-segmented">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className="hostly-tab"
          style={{ minWidth: 96, padding: "8px 16px", cursor: "pointer" }}
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
