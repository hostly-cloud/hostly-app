"use client";

import type { ReactNode } from "react";

export type ProductFormDrawerTabId =
  | "producto"
  | "operacion"
  | "modificadores"
  | "escandallo"
  | "comercial";

export const PRODUCT_FORM_DRAWER_TAB_SPECS: ReadonlyArray<{
  id: ProductFormDrawerTabId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "producto",
    label: "Producto",
    shortLabel: "01",
    description: "Nombre, precio y carta",
  },
  {
    id: "operacion",
    label: "Cocina",
    shortLabel: "02",
    description: "Destino y pase",
  },
  {
    id: "modificadores",
    label: "Modificadores",
    shortLabel: "03",
    description: "Opciones de venta",
  },
  {
    id: "escandallo",
    label: "Costes",
    shortLabel: "04",
    description: "Escandallo y margen",
  },
  {
    id: "comercial",
    label: "Contenido",
    shortLabel: "05",
    description: "Descripción e imagen",
  },
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
            id={`product-form-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`product-form-panel-${tab.id}`}
            className={`hostly-product-form-drawer-tabs__tab${active ? " is-active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="hostly-product-form-drawer-tabs__index" aria-hidden>
              {tab.shortLabel}
            </span>
            <span className="hostly-product-form-drawer-tabs__copy">
              <span className="hostly-product-form-drawer-tabs__label">{tab.label}</span>
              <span className="hostly-product-form-drawer-tabs__description">
                {tab.description}
              </span>
            </span>
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
      id={`product-form-panel-${tabId}`}
      className="hostly-product-form-drawer-tab-panel"
      role="tabpanel"
      aria-labelledby={`product-form-tab-${tabId}`}
      data-tab={tabId}
    >
      {children}
    </div>
  );
}
