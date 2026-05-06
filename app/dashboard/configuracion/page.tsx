"use client";

import type { CSSProperties } from "react";
import { useLayoutEffect, useState } from "react";
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
  maxWidth: "100%",
  boxSizing: "border-box",
};

/** Fila 1: módulo Config — más protagonista. */
const tabBarPrimaryStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "stretch",
  gap: 4,
  padding: 5,
  borderRadius: 14,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.72)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  maxWidth: "100%",
  boxSizing: "border-box",
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
    lineHeight: 1.2,
  };
}

function tabButtonPrimaryStyle(active: boolean): CSSProperties {
  return {
    minWidth: 76,
    padding: "10px 15px",
    borderRadius: 10,
    border: "none",
    background: active ? "rgba(56, 189, 248, 0.24)" : "transparent",
    color: active ? "#f0f9ff" : "#94a3b8",
    fontWeight: active ? 650 : 590,
    fontSize: 14.5,
    letterSpacing: "-0.021em",
    cursor: "pointer",
    lineHeight: 1.2,
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

function configStackRootStyle(isMobile: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    minHeight: "100dvh",
    background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
    ...(isMobile
      ? { overflow: "visible", height: "auto" }
      : { height: "100dvh", overflow: "hidden" }),
  };
}

const configPrimaryRow: CSSProperties = {
  flexShrink: 0,
  width: "100%",
  minWidth: 0,
  padding: "12px clamp(12px, 3vw, 28px) 0",
  boxSizing: "border-box",
};

const configPrimaryDivider: CSSProperties = {
  flexShrink: 0,
  height: 1,
  margin: "12px clamp(12px, 3vw, 28px) 0",
  background: "rgba(148, 163, 184, 0.2)",
};

const configPrimaryBreather: CSSProperties = {
  flexShrink: 0,
  height: 14,
};

const configBodyFill: CSSProperties = {
  flex: 1,
  minHeight: 0,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<ConfigTab>("carta");
  const [isMobile, setIsMobile] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (tab === "carta") {
    return (
      <div style={configStackRootStyle(isMobile)}>
        <header style={configPrimaryRow}>
          <ConfigTabsBar active={tab} onChange={setTab} variant="primary" />
        </header>
        <div style={configPrimaryDivider} aria-hidden />
        <div style={configPrimaryBreather} aria-hidden />
        <div style={configBodyFill}>
          <ProductosManagementPage lockViewportFillParent />
        </div>
      </div>
    );
  }

  if (tab === "mesas") {
    return (
      <div style={configStackRootStyle(isMobile)}>
        <header style={configPrimaryRow}>
          <ConfigTabsBar active={tab} onChange={setTab} variant="primary" />
        </header>
        <div style={configPrimaryDivider} aria-hidden />
        <div style={configPrimaryBreather} aria-hidden />
        <div style={configBodyFill}>
          <ConfigMesasPage lockViewportFillParent />
        </div>
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
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-start", flexWrap: "wrap" }}>
          <ConfigTabsBar active={tab} onChange={setTab} variant="primary" />
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
  variant = "default",
}: {
  active: ConfigTab;
  onChange: (t: ConfigTab) => void;
  variant?: "default" | "primary";
}) {
  const bar = variant === "primary" ? tabBarPrimaryStyle : tabBarStyle;
  const btn = variant === "primary" ? tabButtonPrimaryStyle : tabButtonStyle;

  return (
    <div role="tablist" aria-label="Secciones de configuración" style={bar}>
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          style={btn(active === t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
