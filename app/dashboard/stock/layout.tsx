import type { ReactNode } from "react";

const stockResponsiveAuditStyles = `
@media (max-width: 767px) {
  .hostly-stock-route-audit {
    min-width: 0;
    width: 100%;
  }

  /*
   * La tabla legacy de Stock usa la misma rejilla inline en cabecera y filas.
   * Sus cinco mínimos no caben en PDA; reducimos la vista operativa móvil a
   * Producto · Actual · Acciones. Desktop conserva las cinco columnas.
   */
  .hostly-stock-route-audit div[style*="1.55fr"] {
    grid-template-columns: minmax(0, 1fr) 64px minmax(118px, auto) !important;
    gap: 6px !important;
    min-width: 0 !important;
  }

  .hostly-stock-route-audit div[style*="1.55fr"] > :nth-child(3),
  .hostly-stock-route-audit div[style*="1.55fr"] > :nth-child(4) {
    display: none !important;
  }

  .hostly-stock-route-audit div[style*="1.55fr"] > :nth-child(5) {
    min-width: 0 !important;
  }

  .hostly-stock-route-audit div[style*="1.55fr"] > :nth-child(5) > div {
    gap: 4px !important;
    flex-wrap: wrap !important;
  }

  .hostly-stock-route-audit div[style*="1.55fr"] > :nth-child(5) button {
    min-height: 38px !important;
    min-width: 0 !important;
    padding: 5px 7px !important;
    font-size: 10px !important;
    line-height: 1.1 !important;
    white-space: normal !important;
  }
}

@media (max-width: 390px) {
  .hostly-stock-route-audit div[style*="1.55fr"] {
    grid-template-columns: minmax(0, 1fr) 58px minmax(92px, auto) !important;
  }

  .hostly-stock-route-audit div[style*="1.55fr"] > :nth-child(5) button {
    padding-inline: 5px !important;
    font-size: 9px !important;
  }
}
`;

export default function StockAuditLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hostly-stock-route-audit">
      <style>{stockResponsiveAuditStyles}</style>
      {children}
    </div>
  );
}
