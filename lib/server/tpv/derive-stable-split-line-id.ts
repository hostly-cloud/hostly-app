import { createHash } from "node:crypto";

/** Stable child line id for quantity-split idempotent transitions (Block 1). */
export function deriveStableSplitLineId(lineId: string, idempotencyKey: string): string {
  const digest = createHash("sha256")
    .update(`${lineId.trim()}:${idempotencyKey.trim()}`)
    .digest("hex")
    .slice(0, 16);
  return `${lineId.trim()}-sq-${digest}`;
}
