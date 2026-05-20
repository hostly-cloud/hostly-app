/**
 * ModulePageShell — presentación compartida del hub Inventario (Stock central, Compras, Recepciones, Mermas).
 * Solo constantes visuales; sin lógica de negocio.
 */
export const inventoryHubShellLayout = {
  maxWidth: 1280,
  shellSurface: "configLight" as const,
  compactLayout: true as const,
  operationalFocus: true as const,
  lockViewport: true as const,
  denseWorkbench: true as const,
  denseInventoryHeader: true as const,
};
