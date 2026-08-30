import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("resumen compacto de Cocina", () => {
  const source = readFileSync(
    "components/kds/service-metrics-bar.tsx",
    "utf8",
  );

  it("nombra los contadores según sus estados KDS reales", () => {
    assert.match(
      source,
      /label="Listos"\s+value=\{metrics\.prepared\}/,
    );
    assert.match(
      source,
      /label="Servidos"\s+value=\{metrics\.served\}/,
    );
    assert.doesNotMatch(
      source,
      /label="Listos"\s+value=\{metrics\.served\}/,
    );
  });
});
