import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildTableOperationalVisualInput,
  tableHasOnlyPendingUnsentLines,
} from "@/lib/map/build-table-operational-visual-input";
import { resolveTableOperationalVisualState } from "@/lib/map/table-operational-state";

describe("buildTableOperationalVisualInput", () => {
  test("pending sin enviar resuelve como ocupada, no crítica", () => {
    const input = buildTableOperationalVisualInput({
      busy: true,
      reserved: false,
      lines: [{ status: "pending" }, { status: "pending" }],
      occupancyStartMs: Date.now() - 90 * 60_000,
      orderOpenedAtMs: Date.now() - 90 * 60_000,
      orderTotal: 120,
      mapNow: Date.now(),
      readyToClose: true,
      reservationPressure: { type: "late", time: "14:00" },
    });

    assert.equal(input.isCriticalTable, false);
    assert.equal(input.priorityLevel, 0);
    assert.equal(input.readyToClose, false);
    assert.equal(resolveTableOperationalVisualState(input), "ocupada");
  });

  test("mesa con líneas enviadas conserva urgencia temporal", () => {
    const mapNow = Date.now();
    const input = buildTableOperationalVisualInput({
      busy: true,
      reserved: false,
      lines: [{ status: "pending" }, { status: "sent" }],
      occupancyStartMs: mapNow - 90 * 60_000,
      orderOpenedAtMs: mapNow - 90 * 60_000,
      orderTotal: 10,
      mapNow,
      readyToClose: false,
      reservationPressure: null,
    });

    assert.equal(input.priorityLevel, 3);
    assert.equal(resolveTableOperationalVisualState(input), "critica");
  });
});

describe("tableHasOnlyPendingUnsentLines", () => {
  test("detecta borrador solo pending", () => {
    assert.equal(
      tableHasOnlyPendingUnsentLines([{ status: "pending" }]),
      true,
    );
    assert.equal(
      tableHasOnlyPendingUnsentLines([{ status: "pending" }, { status: "sent" }]),
      false,
    );
    assert.equal(tableHasOnlyPendingUnsentLines([]), false);
  });
});
