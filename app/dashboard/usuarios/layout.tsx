import type { ReactNode } from "react";

const usuariosResponsiveAuditStyles = `
@media (max-width: 767px) {
  .hostly-usuarios-route-audit {
    min-width: 0;
    width: 100%;
  }

  /*
   * La vista legacy de Usuarios comparte una rejilla inline de cinco columnas.
   * En PDA priorizamos identidad, estado y acciones para garantizar que ningún
   * botón quede fuera del viewport. Rol y acceso permanecen completos en desktop
   * y en el formulario de edición.
   */
  .hostly-usuarios-route-audit div[style*="1.35fr"] {
    grid-template-columns: minmax(0, 1fr) 78px minmax(116px, auto) !important;
    gap: 6px !important;
    min-width: 0 !important;
  }

  .hostly-usuarios-route-audit div[style*="1.35fr"] > :nth-child(2),
  .hostly-usuarios-route-audit div[style*="1.35fr"] > :nth-child(3) {
    display: none !important;
  }

  .hostly-usuarios-route-audit div[style*="1.35fr"] > :nth-child(4) {
    min-width: 0 !important;
  }

  .hostly-usuarios-route-audit div[style*="1.35fr"] > :nth-child(4) > span {
    min-width: 0 !important;
    padding: 5px 6px !important;
    font-size: 8.5px !important;
    white-space: normal !important;
    text-align: center !important;
  }

  .hostly-usuarios-route-audit div[style*="1.35fr"] > :nth-child(5) {
    min-width: 0 !important;
    gap: 4px !important;
    flex-wrap: wrap !important;
  }

  .hostly-usuarios-route-audit div[style*="1.35fr"] > :nth-child(5) button {
    min-height: 40px !important;
    min-width: 0 !important;
    padding: 5px 7px !important;
    border-radius: 9px !important;
    font-size: 10px !important;
    line-height: 1.1 !important;
    white-space: normal !important;
  }
}

@media (max-width: 390px) {
  .hostly-usuarios-route-audit div[style*="1.35fr"] {
    grid-template-columns: minmax(0, 1fr) 68px minmax(96px, auto) !important;
  }

  .hostly-usuarios-route-audit div[style*="1.35fr"] > :nth-child(5) button {
    padding-inline: 5px !important;
    font-size: 9px !important;
  }
}
`;

export default function UsuariosAuditLayout({ children }: { children: ReactNode }) {
  return (
    <div className="hostly-usuarios-route-audit">
      <style>{usuariosResponsiveAuditStyles}</style>
      {children}
    </div>
  );
}
