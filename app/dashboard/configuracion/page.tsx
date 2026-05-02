"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import ConfigMesasPage from "@/app/dashboard/config/mesas/page";
import ProductosManagementPage from "@/components/productos/productos-management-page";
import ModulePageShell from "@/components/module-page-shell";
import ZonasManagement from "@/components/zonas/zonas-management";

type ConfigTab = "carta" | "mesas" | "zonas" | "empleados" | "ajustes";

const TABS: { id: ConfigTab; label: string }[] = [
  { id: "carta", label: "Carta" },
  { id: "mesas", label: "Mesas" },
  { id: "zonas", label: "Zonas" },
  { id: "empleados", label: "Empleados" },
  { id: "ajustes", label: "Ajustes" },
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

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<ConfigTab>("carta");

  if (tab === "carta") {
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        <ProductosManagementPage />
        <FloatingTabs active={tab} onChange={setTab} />
      </div>
    );
  }

  if (tab === "mesas") {
    return (
      <div style={{ position: "relative", minHeight: "100dvh" }}>
        <ConfigMesasPage />
        <FloatingTabs active={tab} onChange={setTab} />
      </div>
    );
  }

  return (
    <ModulePageShell
      title="Configuración"
      subtitle="Ajustes del negocio y del equipo"
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
          <ConfigTabsBar active={tab} onChange={setTab} />
        </div>

        {tab === "zonas" ? <ZonasManagement /> : null}
        {tab === "empleados" ? (
          <div style={placeholderStyle}>Empleados — próximamente</div>
        ) : null}
        {tab === "ajustes" ? (
          <div style={placeholderStyle}>Ajustes — próximamente</div>
        ) : null}
      </div>
    </ModulePageShell>
  );
}

function ConfigTabsBar({
  active,
  onChange,
}: {
  active: ConfigTab;
  onChange: (t: ConfigTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Secciones de configuración" style={tabBarStyle}>
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
  active: ConfigTab;
  onChange: (t: ConfigTab) => void;
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
      <ConfigTabsBar active={active} onChange={onChange} />
    </div>
  );
}
