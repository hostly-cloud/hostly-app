import type { ReactNode } from "react";

const cartaMobileAuditStyles = `
@media (max-width: 767px) {
  .hostly-carta-mobile-audit-shell {
    min-width: 0;
    width: 100%;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-actions-row {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 5px !important;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px !important;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-actions-row::-webkit-scrollbar {
    display: none;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-actions-row > button,
  .hostly-carta-mobile-audit-shell .hostly-carta-config-actions-row > a {
    flex: 0 0 auto !important;
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    line-height: 1.1 !important;
    white-space: nowrap;
    box-shadow: none !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-actions-row > a.hostly-carta-config-text-link {
    display: inline-flex !important;
    align-items: center !important;
    text-decoration: none !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-list-loading {
    min-height: 72px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 12px !important;
    font-size: 10.5px !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-empty--compact {
    padding: 14px 12px !important;
    border-radius: 10px !important;
    box-shadow: none !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-empty__title {
    margin: 0 !important;
    font-size: 13px !important;
    line-height: 1.2 !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-empty__body {
    margin-top: 4px !important;
    font-size: 10.5px !important;
    line-height: 1.3 !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-empty__actions {
    display: flex !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
    margin-top: 9px !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-empty__actions > button,
  .hostly-carta-mobile-audit-shell .hostly-carta-config-empty__actions > a {
    min-height: 40px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 7px 10px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    line-height: 1.1 !important;
    box-shadow: none !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-alert {
    padding: 8px 10px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    line-height: 1.3 !important;
    box-shadow: none !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-drawer-backdrop {
    align-items: stretch !important;
    padding: 0 !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-config-drawer.hostly-carta-category-form-drawer {
    display: flex !important;
    flex-direction: column !important;
    width: 100vw !important;
    max-width: none !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    margin: 0 !important;
    padding: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    overflow: hidden !important;
    background: #ffffff !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__title {
    flex: 0 0 auto;
    margin: 0 !important;
    padding: max(10px, env(safe-area-inset-top)) 10px 8px !important;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12) !important;
    font-size: 17px !important;
    font-weight: 760 !important;
    line-height: 1.15 !important;
    letter-spacing: -0.02em !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__body {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
    padding: 8px 10px 12px !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-grid {
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 8px !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-grid__full,
  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-grid__modifiers,
  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-grid__status {
    grid-column: 1 / -1 !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer .hostly-carta-config-form-field,
  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer .hostly-carta-config-form-checkbox {
    gap: 4px !important;
    padding: 8px 9px !important;
    border: 1px solid rgba(148, 163, 184, 0.14) !important;
    border-radius: 10px !important;
    background: #ffffff !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer .hostly-carta-config-form-label {
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer .hostly-carta-config-field-input,
  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer input:not([type="checkbox"]),
  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer select {
    min-height: 42px !important;
    padding: 8px 10px !important;
    border-radius: 10px !important;
    font-size: 13px !important;
    box-shadow: none !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__hint {
    margin: 4px 0 0 !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__chips {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 5px !important;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__chips::-webkit-scrollbar {
    display: none;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__chips .hostly-productos-carta-filter-chip {
    flex: 0 0 auto !important;
    min-height: 34px !important;
    padding: 5px 8px !important;
    border-radius: 9px !important;
    font-size: 10px !important;
    line-height: 1.1 !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-grid__status {
    min-height: 42px !important;
    display: flex !important;
    align-items: center !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-grid__status input[type="checkbox"] {
    width: 18px !important;
    height: 18px !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__footer {
    flex: 0 0 auto !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto !important;
    gap: 6px !important;
    padding: 8px 10px max(8px, env(safe-area-inset-bottom)) !important;
    border-top: 1px solid rgba(148, 163, 184, 0.12) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.035) !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__footer > button {
    min-height: 44px !important;
    padding: 7px 10px !important;
    border-radius: 10px !important;
    font-size: 11px !important;
    line-height: 1.1 !important;
  }

  .hostly-carta-mobile-audit-shell .hostly-carta-category-form-drawer__footer > button:not(:first-child) {
    min-width: 74px;
    background: transparent !important;
    box-shadow: none !important;
  }
}
`;

export default function ConfigCartaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hostly-carta-mobile-audit-shell">
      <style>{cartaMobileAuditStyles}</style>
      {children}
    </div>
  );
}
