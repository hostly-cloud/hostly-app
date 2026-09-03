"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { HostlyButton } from "@/components/ui/hostly";

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
    id: "comercial",
    label: "Contenido",
    shortLabel: "02",
    description: "Descripción e imagen",
  },
  {
    id: "operacion",
    label: "Operación",
    shortLabel: "03",
    description: "Destino, pase y comportamiento",
  },
  {
    id: "modificadores",
    label: "Modificadores",
    shortLabel: "04",
    description: "Opciones de venta",
  },
  {
    id: "escandallo",
    label: "Escandallo",
    shortLabel: "05",
    description: "Coste y margen",
  },
];

export function ProductFormDrawerTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: ProductFormDrawerTabId;
  onTabChange: (tab: ProductFormDrawerTabId) => void;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activateTabAt = (index: number) => {
    const spec = PRODUCT_FORM_DRAWER_TAB_SPECS[index];
    if (!spec) return;
    onTabChange(spec.id);
    tabRefs.current[index]?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      activateTabAt((index + 1) % PRODUCT_FORM_DRAWER_TAB_SPECS.length);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      activateTabAt(
        (index - 1 + PRODUCT_FORM_DRAWER_TAB_SPECS.length) %
          PRODUCT_FORM_DRAWER_TAB_SPECS.length,
      );
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      activateTabAt(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      activateTabAt(PRODUCT_FORM_DRAWER_TAB_SPECS.length - 1);
    }
  };

  return (
    <nav
      className="hostly-product-form-drawer-tabs"
      aria-label="Secciones de configuración del producto"
      role="tablist"
      aria-orientation="horizontal"
    >
      {PRODUCT_FORM_DRAWER_TAB_SPECS.map((tab, index) => {
        const active = activeTab === tab.id;
        return (
          <HostlyButton
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`product-form-tab-${tab.id}`}
            variant="ghost"
            active={active}
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            aria-controls={`product-form-panel-${tab.id}`}
            className={`hostly-product-form-drawer-tabs__tab${active ? " is-active" : ""}`}
            style={{ minHeight: 44 }}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
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
          </HostlyButton>
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
