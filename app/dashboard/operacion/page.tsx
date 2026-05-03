"use client";

import type { CSSProperties } from "react";
import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CartaPageContent } from "@/app/dashboard/carta/carta-page-content";
import BarView from "@/components/kds/bar-view";
import KitchenView from "@/components/kds/kitchen-view";
import OperationFilterBar from "@/components/kds/operation-filter-bar";
import { OperationFilterProvider } from "@/components/kds/operation-filter-context";
import SalaView from "@/components/kds/sala-view";
import ReservasView from "@/components/reservas/reservas-view";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyBackButton } from "@/components/hostly/back-button";

type OperacionTab = "tpv" | "cocina" | "barra" | "sala" | "reservas";

const TABS: { id: OperacionTab; label: string }[] = [
  { id: "tpv", label: "TPV" },
  { id: "cocina", label: "Cocina" },
  { id: "barra", label: "Barra" },
  { id: "sala", label: "Sala" },
  { id: "reservas", label: "Reservas" },
];

const operacionTabsOuterStyle: CSSProperties = {
  flexShrink: 0,
  marginTop: 10,
  marginBottom: 12,
  width: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  WebkitOverflowScrolling: "touch",
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "nowrap",
  alignItems: "center",
  gap: 8,
  padding: 4,
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.55)",
  width: "max-content",
  maxWidth: "none",
  boxSizing: "border-box",
};

function tabButtonStyle(active: boolean): CSSProperties {
  return {
    flexShrink: 0,
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
    whiteSpace: "nowrap",
  };
}

const mobileMenuGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  width: "100%",
  marginTop: 16,
};

const mobileMenuButtonStyle: CSSProperties = {
  padding: "28px 16px",
  borderRadius: 16,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.55)",
  color: "#e0f2fe",
  fontWeight: 700,
  fontSize: 18,
  letterSpacing: "-0.02em",
  cursor: "pointer",
  minHeight: 96,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

const mobileShellStyle: CSSProperties = {
  boxSizing: "border-box",
  background: "linear-gradient(180deg, #0f172a 0%, #111827 100%)",
  color: "#f8fafc",
  minHeight: "100dvh",
  height: "100dvh",
  maxHeight: "100dvh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  padding: 0,
  fontFamily: "Arial, sans-serif",
};

const mobileTopBarStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(2, 6, 23, 0.28)",
};

const mobileModuleLabelStyle: CSSProperties = {
  marginLeft: "auto",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const mobileContentStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

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

  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const initialTab = ((): OperacionTab | null => {
    const raw = searchParams.get("tab");
    if (raw === "cocina" || raw === "barra" || raw === "sala" || raw === "reservas" || raw === "tpv") {
      return raw;
    }
    return null;
  })();
  const [tab, setTab] = useState<OperacionTab | null>(initialTab);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "cocina" || raw === "barra" || raw === "sala" || raw === "reservas" || raw === "tpv") {
      setTab(raw);
    } else {
      setTab(null);
    }
  }, [searchParams]);

  const handleChangeTab = (t: OperacionTab | null) => {
    setTab(t);
    const next = new URLSearchParams(searchParams.toString());
    if (t) {
      next.set("tab", t);
    } else {
      next.delete("tab");
    }
    const qs = next.toString();
    router.replace(`/dashboard/operacion${qs ? `?${qs}` : ""}`);
  };

  const desktopTab: OperacionTab = tab ?? "tpv";

  if (isMobile && tab) {
    const moduleLabel = TABS.find((x) => x.id === tab)?.label ?? "";
    return (
      <main style={mobileShellStyle}>
        <div style={mobileTopBarStyle}>
          <HostlyBackButton
            onClick={() => handleChangeTab(null)}
            label="Volver a Operación"
            ariaLabel="Volver a Operación"
          />
          <span style={mobileModuleLabelStyle}>{moduleLabel}</span>
        </div>

        {tab !== "tpv" ? (
          <div style={{ flexShrink: 0, padding: "8px 12px 0 12px" }}>
            <OperationFilterBar />
          </div>
        ) : null}

        <div style={mobileContentStyle}>
          {tab === "tpv" ? <CartaPageContent embeddedInOperacion /> : null}
          {tab === "cocina" ? <KitchenView /> : null}
          {tab === "barra" ? <BarView /> : null}
          {tab === "sala" ? <SalaView /> : null}
          {tab === "reservas" ? <ReservasView /> : null}
        </div>
      </main>
    );
  }

  if (isMobile) {
    return (
      <ModulePageShell
        title="Operación"
        subtitle="Flujo diario del servicio"
        maxWidth={1400}
        compactLayout
      >
        <nav aria-label="Módulos de operación" style={mobileMenuGridStyle}>
          {TABS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handleChangeTab(m.id)}
              style={mobileMenuButtonStyle}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </ModulePageShell>
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
          gap: 0,
        }}
      >
        <div style={operacionTabsOuterStyle}>
          <OperacionTabsBar active={desktopTab} onChange={handleChangeTab} />
        </div>

        {desktopTab !== "tpv" ? (
          <div style={{ flexShrink: 0, marginBottom: 12 }}>
            <OperationFilterBar />
          </div>
        ) : null}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {desktopTab === "tpv" ? <CartaPageContent embeddedInOperacion /> : null}
          {desktopTab === "cocina" ? <KitchenView /> : null}
          {desktopTab === "barra" ? <BarView /> : null}
          {desktopTab === "sala" ? <SalaView /> : null}
          {desktopTab === "reservas" ? <ReservasView /> : null}
        </div>
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
