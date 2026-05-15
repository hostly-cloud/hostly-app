/**
 * Hook para puntos que registraban errores Firestore; la implementación queda vacía
 * para evitar ruido en consola. Mantener la firma por compatibilidad con llamadas existentes.
 */
export type FirestorePermissionDebugContext = {
  file: string;
  op: string;
  path: string;
  restaurantId?: string | null;
  tableId?: string | null;
  orderId?: string | null;
  uid?: string | null;
  email?: string | null;
};

export function logFirestorePermissionError(
  _context: FirestorePermissionDebugContext,
  _error: unknown,
): void {
  /* diagnostic logging removed post-stabilization */
}
