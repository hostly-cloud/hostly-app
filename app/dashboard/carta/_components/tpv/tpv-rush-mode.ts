/** Líneas pending en comanda actual para activar densidad compacta. */
export const TPV_RUSH_PENDING_LINES_THRESHOLD = 12;

/** Mesas ocupadas en mapa para activar densidad compacta. */
export const TPV_RUSH_OCCUPIED_TABLES_THRESHOLD = 8;

export function computeTpvRushMode(params: {
  pendingLineCount: number;
  occupiedTableCount: number;
}): boolean {
  return (
    params.pendingLineCount >= TPV_RUSH_PENDING_LINES_THRESHOLD ||
    params.occupiedTableCount >= TPV_RUSH_OCCUPIED_TABLES_THRESHOLD
  );
}
