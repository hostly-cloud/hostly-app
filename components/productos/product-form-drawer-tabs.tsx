"use client";

import type { ReactNode } from "react";

export type ProductFormDrawerTabId =
  | "basico"
  | "modificadores"
  | "escandallo"
  | "comercial";

export const PRODUCT_FORM_DRAWER_TAB_SPECS: ReadonlyArray<{
  id: ProductFormDrawerTabId;
  label: string;
  shortLabel: string;
}> = [
  { id: "basico", label: "Básico", shortLabel: "01" },
  { id: "modificadores", label: "Modificadores", shortLabel: "02" },
  { id: "escandallo", label: "Escandallo", shortLabel: "03" },
  { id: "comercial", label: "Info comercial", shortLabel: "04" },
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
            <span className="hostly-product-form-drawer-tabs__index" aria-hidden>
              {tab.shortLabel}
            </span>
            <span>{tab.label}</span>
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
