/**
 * Política de salida al mapa con borrador pending (TPV).
 *
 * Un borrador no enviado debe:
 * - flushearse antes de navegar (también el vacío `[]` si hay orderId);
 * - esperar ACK real del servidor;
 * - conservar orderId + líneas locales recuperables si el flush falla;
 * - no tratarse como “draft vacío” para cierre/borrado indebido.
 */

export function shouldFlushDraftBeforeBackToMap(args: {
  activeLineCount: number;
  hasDebounceTimer: boolean;
  /** Pedido activo conocido: hay que confirmar `[]` en servidor al vaciar. */
  hasDraftOrderId: boolean;
  /** Key local en ordersByTable (incluye `[]`). */
  hasLocalDraftKey: boolean;
  /** Flush/create-open aún en vuelo. */
  hasPersistChain: boolean;
}): boolean {
  if (args.hasDebounceTimer || args.hasPersistChain) return true;
  if (args.activeLineCount > 0) return true;
  // 1→0 pending: activeCount=0 pero hay orderId + key local → persistir [].
  if (args.hasDraftOrderId && args.hasLocalDraftKey) return true;
  return false;
}

/**
 * Con líneas activas (pending o sent) no se debe destruir el cache local
 * al volver al mapa: el mapa y la reapertura lo usan como fallback.
 * Tras ACK de vacío confirmado, el caller puede limpiar la key.
 */
export function shouldPreserveLocalDraftCacheOnBackToMap(
  activeLineCount: number,
): boolean {
  return activeLineCount > 0;
}
