import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasUsableV2ViewportSize } from "@/app/dashboard/operacion/tpv/_components/tpv-editor-v2-ready-gate";

describe("hasUsableV2ViewportSize", () => {
  it("rechaza el viewport colapsado que ocultaba el mapa del TPV", () => {
    assert.equal(hasUsableV2ViewportSize(1_345, 0), false);
  });

  it("acepta un viewport con superficie operativa renderizable", () => {
    assert.equal(hasUsableV2ViewportSize(1_345, 820), true);
  });
});
