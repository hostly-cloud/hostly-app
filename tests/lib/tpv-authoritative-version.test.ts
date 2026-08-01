import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { readOrderUpdatedAtMs } from "@/lib/firestore/order-table-occupancy";

describe("versión autoritativa post-mutación", () => {
  test("API client propaga updatedAtMs", () => {
    const src = readFileSync("lib/firestore/tpv-mutations-via-api.ts", "utf8");
    assert.match(src, /readUpdatedAtMsFromApiPayload/);
    assert.match(src, /updatedAtMs: readUpdatedAtMsFromApiPayload/);
  });

  test("servidor relee updatedAt tras mutación (no Date.now local)", () => {
    const src = readFileSync("lib/server/tpv/handle-tpv-order-mutations.ts", "utf8");
    assert.match(src, /loadAuthoritativeUpdatedAtMs/);
    assert.match(src, /updatedAtMs: await loadAuthoritativeUpdatedAtMs/);
    assert.match(src, /VERSION_CONFLICT/);
  });

  test("CAS sigue activo en assertExpectedVersion", () => {
    const src = readFileSync("lib/server/tpv/handle-tpv-order-mutations.ts", "utf8");
    assert.match(src, /function assertExpectedVersion/);
    assert.match(src, /error: "VERSION_CONFLICT"/);
  });

  test("serverTimestamp pendiente no se convierte en Date.now", () => {
    // Sentinel / objeto incompleto → undefined (cliente no inventa ms).
    assert.equal(readOrderUpdatedAtMs(undefined), undefined);
    assert.equal(readOrderUpdatedAtMs(null), undefined);
    assert.equal(readOrderUpdatedAtMs({}), undefined);
    assert.equal(readOrderUpdatedAtMs(1_700_000_000_000), 1_700_000_000_000);
  });
});
