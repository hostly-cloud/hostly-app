import { MAX_IDEMPOTENCY_KEY_LENGTH } from "@/lib/server/tpv/tpv-mutation-dtos";

async function sha256Hex(material: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Fallback determinista sin Node crypto (tests / entornos sin subtle).
    let h = 2166136261;
    for (let i = 0; i < material.length; i++) {
      h ^= material.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0").repeat(8).slice(0, 64);
  }
  const data = new TextEncoder().encode(material);
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Key HTTP estable dentro de MAX_IDEMPOTENCY_KEY_LENGTH sin truncar el payload
 * (hash SHA-256 / fallback FNV). Prefijo legible + digest.
 */
export async function buildHashedIdempotencyKey(
  scope: string,
  ...parts: string[]
): Promise<string> {
  const safeScope = String(scope).trim() || "tpv";
  const material = [safeScope, ...parts.map((p) => String(p))].join("\0");
  const digest = await sha256Hex(material);
  const key = `${safeScope}:${digest}`;
  if (key.length <= MAX_IDEMPOTENCY_KEY_LENGTH) return key;
  return key.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
}
