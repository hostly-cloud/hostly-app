import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createTableGroupSplitActionGate } from "@/lib/tpv/table-group-split-action-gate";

describe("table-group-split-action-gate", () => {
  test("A. doble evento UI (pointerUp + click) → una sola run / mismo operationId", () => {
    let uuid = 0;
    const gate = createTableGroupSplitActionGate({
      createOperationId: () => `op-${++uuid}`,
    });

    const first = gate.begin({
      mainTableId: "A",
      separateTableId: "B",
      isLocallyGrouped: true,
      origin: "onPointerUp",
    });
    assert.equal(first.action, "run");
    if (first.action !== "run") return;

    const second = gate.begin({
      mainTableId: "A",
      separateTableId: "B",
      isLocallyGrouped: true,
      origin: "onClick",
    });
    assert.equal(second.action, "ignore");
    if (second.action !== "ignore") return;
    assert.equal(second.reason, "in_flight");
    assert.equal(second.operationId, first.attempt.operationId);
    assert.equal(uuid, 1);
  });

  test("B. doble llamada inmediata antes de resolver → una en vuelo", () => {
    const gate = createTableGroupSplitActionGate({
      createOperationId: () => "stable-op",
    });
    const a = gate.begin({
      mainTableId: "A",
      isLocallyGrouped: true,
      origin: "hook",
    });
    const b = gate.begin({
      mainTableId: "A",
      isLocallyGrouped: true,
      origin: "hook",
    });
    assert.equal(a.action, "run");
    assert.equal(b.action, "ignore");
    assert.equal(gate.getInFlight(), true);
    if (a.action === "run") {
      gate.succeed(a.attempt.operationId);
    }
    assert.equal(gate.getInFlight(), false);
  });

  test("tras éxito, gesto tardío sin grupo local no genera nueva operación", () => {
    const gate = createTableGroupSplitActionGate({
      createOperationId: () => "op-1",
    });
    const run = gate.begin({
      mainTableId: "A",
      isLocallyGrouped: true,
      origin: "onClick",
    });
    assert.equal(run.action, "run");
    if (run.action !== "run") return;
    gate.succeed(run.attempt.operationId);

    const late = gate.begin({
      mainTableId: "A",
      isLocallyGrouped: false,
      origin: "onClick",
    });
    assert.equal(late.action, "ignore");
    if (late.action !== "ignore") return;
    assert.equal(late.reason, "already_succeeded");
  });

  test("not_grouped sin éxito previo se ignora (no inventa POST)", () => {
    const gate = createTableGroupSplitActionGate({
      createOperationId: () => "should-not-run",
    });
    const d = gate.begin({
      mainTableId: "A",
      isLocallyGrouped: false,
      origin: "carta-callback",
    });
    assert.equal(d.action, "ignore");
    if (d.action !== "ignore") return;
    assert.equal(d.reason, "not_grouped");
  });
});
