export const COMANDA_PANEL_WIDTH_DEFAULT = 40;
export const COMANDA_PANEL_WIDTH_MIN = 20;
export const COMANDA_PANEL_WIDTH_MAX = 80;

export function clampComandaPanelWidthPct(value: number): number {
  if (!Number.isFinite(value)) return COMANDA_PANEL_WIDTH_DEFAULT;
  return Math.min(
    COMANDA_PANEL_WIDTH_MAX,
    Math.max(COMANDA_PANEL_WIDTH_MIN, value),
  );
}
