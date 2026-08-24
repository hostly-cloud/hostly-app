"use client";

import type { ReactNode } from "react";

const productFormDrawerMobileStyles = `
@media (max-width: 767px) {
  .hostly-product-form-drawer-backdrop {
    padding: 0 !important;
    align-items: stretch !important;
  }

  .hostly-product-form-drawer.hostly-product-form-drawer--v3 {
    width: 100vw !important;
    max-width: none !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    border-left: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__header {
    align-items: center !important;
    gap: 8px !important;
    padding: max(8px, env(safe-area-inset-top)) 10px 7px !important;
    background: rgba(255, 255, 255, 0.98) !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__header-text {
    min-width: 0;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__title {
    margin: 0 !important;
    font-size: 17px !important;
    line-height: 1.15 !important;
    letter-spacing: -0.02em !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__subtitle {
    display: none !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__header > button {
    flex: 0 0 auto;
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    font-size: 11px !important;
    line-height: 1.1 !important;
    background: transparent !important;
    box-shadow: none !important;
  }

  .hostly-product-form-drawer-tabs {
    gap: 3px !important;
    padding: 5px 8px !important;
    background: rgba(255, 255, 255, 0.98) !important;
    overscroll-behavior-x: contain;
  }

  .hostly-product-form-drawer-tabs__tab {
    min-height: 36px !important;
    padding: 5px 9px !important;
    border-radius: 9px !important;
    font-size: 11px !important;
    font-weight: 650 !important;
    line-height: 1.1 !important;
  }

  .hostly-product-form-drawer-tabs__tab.is-active {
    font-weight: 760 !important;
    box-shadow: none !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__body--tabbed {
    padding: 0 !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-product-form-drawer-tab-panel {
    padding: 8px 10px 12px !important;
    scroll-padding-bottom: 84px;
  }

  .hostly-product-form-drawer-tab-panel__stack {
    gap: 8px !important;
  }

  .hostly-product-form-drawer-zone {
    padding: 8px 9px !important;
    border-color: rgba(148, 163, 184, 0.16) !important;
    border-radius: 9px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-product-form-drawer-zone__header {
    margin-bottom: 6px !important;
  }

  .hostly-product-form-drawer-zone__title {
    font-size: 10.5px !important;
    line-height: 1.15 !important;
    letter-spacing: 0.035em !important;
  }

  .hostly-product-form-drawer-zone__description {
    margin-top: 2px !important;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer-primary__grid {
    gap: 7px !important;
  }

  .hostly-product-form-drawer--v3 .hostly-carta-config-form-field {
    gap: 4px !important;
  }

  .hostly-product-form-drawer--v3 .hostly-carta-config-form-label {
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-form-drawer--v3 .hostly-carta-config-form-hint,
  .hostly-product-form-drawer--v3 .hostly-product-form-drawer-primary__hint {
    margin-top: 1px !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-product-form-drawer--v3 input:not([type="checkbox"]):not([type="radio"]),
  .hostly-product-form-drawer--v3 select,
  .hostly-product-form-drawer--v3 textarea,
  .hostly-product-form-drawer--v3 .hostly-product-form-drawer-readonly {
    min-height: 42px !important;
    border-radius: 10px !important;
    font-size: 13px !important;
  }

  .hostly-product-form-drawer--v3 textarea {
    min-height: 84px !important;
  }

  .hostly-product-form-drawer-radio-group--inline {
    gap: 5px !important;
  }

  .hostly-product-form-drawer-radio {
    min-height: 36px !important;
    padding: 5px 8px !important;
    border-radius: 9px !important;
    font-size: 11px !important;
  }

  .hostly-product-form-derived-family__card {
    padding: 7px 9px !important;
    border-radius: 9px !important;
  }

  .hostly-product-form-derived-family__value {
    font-size: 11px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-form-derived-family__hint {
    font-size: 9px !important;
    line-height: 1.2 !important;
  }

  .hostly-product-form-family-override,
  .hostly-product-form-internal-classification {
    border-radius: 9px !important;
  }

  .hostly-product-form-family-override__summary,
  .hostly-product-form-internal-classification__summary {
    min-height: 36px !important;
    padding: 6px 8px !important;
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-form-drawer-checkbox {
    min-height: 40px !important;
  }

  .hostly-product-form-field-warning {
    padding: 6px 8px !important;
    border-radius: 8px !important;
  }

  .hostly-product-form-field-warning__line {
    font-size: 9.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__footer {
    gap: 6px !important;
    padding: 8px 10px max(8px, env(safe-area-inset-bottom)) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.035) !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__footer > button {
    min-height: 44px !important;
    border-radius: 11px !important;
    font-size: 12px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__footer-primary {
    flex: 1 1 auto !important;
  }

  .hostly-product-form-drawer--v3 .hostly-product-form-drawer__footer > button:not(.hostly-product-form-drawer__footer-primary) {
    flex: 0 0 auto !important;
    min-width: 88px;
    background: transparent !important;
    box-shadow: none !important;
  }
}
`;

export type ProductFormDrawerTabId =
  | "basico"
  | "modificadores"
  | "escandallo"
  | "comercial";

export const PRODUCT_FORM_DRAWER_TAB_SPECS: ReadonlyArray<{
  id: ProductFormDrawerTabId;
  label: string;
}> = [
  { id: "basico", label: "Básico" },
  { id: "modificadores", label: "Modificadores" },
  { id: "escandallo", label: "Escandallo" },
  { id: "comercial", label: "Comercial" },
];

export function ProductFormDrawerTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: ProductFormDrawerTabId;
  onTabChange: (tab: ProductFormDrawerTabId) => void;
}) {
  return (
    <>
      <style>{productFormDrawerMobileStyles}</style>
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
    </>
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
