import test from "node:test";
import assert from "node:assert/strict";

import { shouldSurfaceProductRoutingAudit } from "../../components/productos/productos-table-cells";

test("routing audit stays silent when operational routing and resolver parity are healthy", () => {
  assert.equal(
    shouldSurfaceProductRoutingAudit({ operationalTone: "ok", parityIssues: ["OK"] }),
    false,
  );
});

test("routing audit surfaces operational or resolver problems", () => {
  assert.equal(
    shouldSurfaceProductRoutingAudit({ operationalTone: "warning", parityIssues: ["OK"] }),
    true,
  );
  assert.equal(
    shouldSurfaceProductRoutingAudit({
      operationalTone: "ok",
      parityIssues: ["DIVERGENCIA_BUCKET"],
    }),
    true,
  );
});
