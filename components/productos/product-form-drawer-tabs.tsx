"use client";

import type { ReactNode } from "react";

export type ProductFormDrawerTabId =
  | "basico"
  | "produccion"
  | "venta"
  | "clasificacion"
  | "modificadores"
  | "escandallo"
  | "comercial";

export const PRODUCT_FORM_DRAWER_TAB_SPECS: ReadonlyArray<{
  id: ProductFormDrawerTabId;
  label: string;
}> = [
  { id: "basico", label: "Básico" },
  { id: "produccion", label: "Producción" },
  { id: "venta", label: "Venta" },
  { id: "clasificacion", label: "Clasificación" },
  { id: "modificadores", label: "Modificadores" },
  { id: "escandallo", label: "Escandallo" },
  { id: "comercial", label: "Info comercial" },
];

export function ProductFormDrawerTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: ProductFormDrawerTabId;
  onTabChange: (tab: ProductFormDrawerTabId) => void;
}) {
  return (
    <nav
      className="hostly-product-form-drawer-tabs"
      aria-label="Secciones de configuración del producto"
    >
      {PRODUCT_FORM_DRAWER_TAB_SPECS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`hostly-product-form-drawer-tabs__tab${active ? " is-active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

export function ProductFormDrawerTabPanel({
  tabId,
  activeTab,
  children,
}: {
  tabId: ProductFormDrawerTabId;
  activeTab: ProductFormDrawerTabId;
  children: ReactNode;
}) {
  if (activeTab !== tabId) return null;
  return (
    <div
      className="hostly-product-form-drawer-tab-panel"
      role="tabpanel"
      data-tab={tabId}
    >
      {children}
    </div>
  );
}
