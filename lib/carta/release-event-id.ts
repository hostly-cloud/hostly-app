/**
 * Identidad determinista de una liberación lógica Carta → producción.
 * Misma para replay / timeout / reconciliación; distinta si cambian líneas o action.
 */

/**
 * SHA-256 hex vía Web Crypto (navegador + Node moderno).
 * No usar `node:crypto`: este módulo entra en el grafo del Client Component TPV.
 */
async function sha256Hex(material: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "buildReleaseEventId: Web Crypto subtle no disponible (cliente/servidor)",
    );
  }
  const data = new TextEncoder().encode(material);
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type BuildReleaseEventIdParams = {
  restaurantId: string;
  orderId: string;
  releaseAction: string;
  lineIds: readonly string[];
  markSent: boolean;
};

/** Material canónico con separadores inequívocos (orden estable de lineIds). */
export function buildReleaseEventMaterial(params: BuildReleaseEventIdParams): string {
  const restaurantId = params.restaurantId.trim();
  const orderId = params.orderId.trim();
  const releaseAction = params.releaseAction.trim() || "send_to_comanda";
  const markSent = params.markSent === true ? "1" : "0";
  const lineIds = [...params.lineIds]
    .map((id) => String(id).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return [
    "tpvReleaseEvent",
    restaurantId,
    orderId,
    releaseAction,
    markSent,
    ...lineIds,
  ].join("\0");
}

/** SHA-256 hex (64 chars). Determinista. */
export async function buildReleaseEventId(
  params: BuildReleaseEventIdParams,
): Promise<string> {
  return sha256Hex(buildReleaseEventMaterial(params));
}
