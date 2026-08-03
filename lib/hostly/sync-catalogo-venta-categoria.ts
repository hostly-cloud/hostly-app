/**
 * Best-effort sync: productos migrados a Firestore suelen usar id `esc-{escandalloSupabaseId}`.
 * Si no existe el doc, el PATCH falla en silencio (no bloquea la carta local).
 */
import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

export function fireAndForgetSyncCatalogoCategoria(
  restauranteId: string,
  escandalloSupabaseId: number | null | undefined,
  categoria: string,
): void {
  if (escandalloSupabaseId == null || !Number.isFinite(Number(escandalloSupabaseId))) return;
  const cat = categoria.trim();
  if (!cat) return;
  const id = `esc-${escandalloSupabaseId}`;
  void authenticatedApiFetch("/api/catalogo-venta/products", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      restauranteId,
      id,
      patch: { categoria: cat },
    }),
  }).catch(() => {});
}
