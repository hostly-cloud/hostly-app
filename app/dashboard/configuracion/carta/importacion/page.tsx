import { ImportMenuPageContent } from "./_components/import-menu-page-content";

const importMenuMobileStyles = `
@media (max-width: 767px) {
  .hostly-import-mobile-skin {
    min-width: 0;
    width: 100%;
  }

  .hostly-import-mobile-skin .hostly-carta-config-layout-split {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    min-width: 0;
  }

  .hostly-import-mobile-skin .hostly-carta-config-layout-split__aside {
    position: static !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
  }

  .hostly-import-mobile-skin .hostly-carta-config-layout-split__aside > * {
    padding: 9px 10px !important;
    border-radius: 10px !important;
    box-shadow: none !important;
  }

  .hostly-import-mobile-skin .hostly-carta-config-layout-split__aside ul {
    max-height: none !important;
    overflow: visible !important;
    padding-right: 0 !important;
  }

  .hostly-import-mobile-skin .hostly-carta-config-layout-split__aside li + li {
    margin-top: 5px !important;
  }

  .hostly-import-mobile-skin .hostly-carta-config-layout-split__aside li button {
    min-height: 48px !important;
    padding: 7px 8px !important;
    border-radius: 9px !important;
    box-shadow: none !important;
  }

  .hostly-import-mobile-skin [role="tablist"] {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 4px !important;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px !important;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }

  .hostly-import-mobile-skin [role="tablist"]::-webkit-scrollbar {
    display: none;
  }

  .hostly-import-mobile-skin [role="tablist"] > button {
    flex: 0 0 auto !important;
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    line-height: 1.1 !important;
    white-space: nowrap;
  }

  .hostly-import-mobile-skin .hostly-input,
  .hostly-import-mobile-skin .hostly-select,
  .hostly-import-mobile-skin input[type="url"],
  .hostly-import-mobile-skin input[type="text"],
  .hostly-import-mobile-skin input[type="number"],
  .hostly-import-mobile-skin select,
  .hostly-import-mobile-skin textarea {
    min-height: 40px;
    border-radius: 9px !important;
    font-size: 12px !important;
  }

  .hostly-import-mobile-skin .hostly-button-primary,
  .hostly-import-mobile-skin .hostly-button-secondary {
    min-height: 40px;
    border-radius: 9px !important;
    box-shadow: none !important;
  }

  .hostly-import-mobile-skin .hostly-button-primary.w-full {
    min-height: 44px;
    font-size: 12px !important;
    font-weight: 740 !important;
  }

  .hostly-import-mobile-skin .hostly-section-label {
    font-size: 9px !important;
    line-height: 1.1 !important;
    letter-spacing: 0.04em !important;
  }

  .hostly-import-mobile-skin .hostly-stack-sm {
    gap: 5px !important;
  }

  .hostly-import-mobile-skin table {
    font-size: 10px !important;
  }

  .hostly-import-mobile-skin table th {
    padding: 6px 7px !important;
    font-size: 8.5px !important;
  }

  .hostly-import-mobile-skin table td {
    padding: 7px !important;
  }

  .hostly-import-mobile-skin input[type="checkbox"] {
    min-width: 18px;
    min-height: 18px;
  }

  .hostly-import-mobile-skin details > summary {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
  }

  .hostly-import-mobile-skin .grid.gap-3.sm\:grid-cols-2.xl\:grid-cols-4 {
    display: flex !important;
    gap: 5px !important;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .hostly-import-mobile-skin .grid.gap-3.sm\:grid-cols-2.xl\:grid-cols-4::-webkit-scrollbar {
    display: none;
  }

  .hostly-import-mobile-skin .grid.gap-3.sm\:grid-cols-2.xl\:grid-cols-4 > * {
    flex: 0 0 108px !important;
    min-width: 108px !important;
    padding: 7px 8px !important;
    border-radius: 9px !important;
    box-shadow: none !important;
  }

  .hostly-import-mobile-skin .overflow-x-auto {
    -webkit-overflow-scrolling: touch;
  }
}
`;

export default function ConfigCartaImportacionPage() {
  return (
    <div className="hostly-import-mobile-skin">
      <style>{importMenuMobileStyles}</style>
      <ImportMenuPageContent />
    </div>
  );
}
