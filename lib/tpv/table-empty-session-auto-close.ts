/**
 * Criterio histórico (a40e5ac / 2990711 occupancy):
 * autoClose solo si no hay líneas activas (pending o sent con qty>0).
 */

export function tableEmptySessionWarrantsAutoClose(args: {
  activeLineCount: number;
  cachedActiveLineCount: number;
  linesLength: number;
  openOrderIdsLength: number;
  firestoreOccupied: boolean;
  draftOrderId: string | null;
  tableHasOperationalSession: boolean;
}): boolean {
  if (args.activeLineCount > 0) return false;
  if (args.cachedActiveLineCount > 0) return false;
  if (args.linesLength > 0) return true;
  if (args.openOrderIdsLength > 0) return true;
  if (args.draftOrderId) return true;
  if (args.firestoreOccupied) return true;
  if (args.tableHasOperationalSession) return true;
  return false;
}
