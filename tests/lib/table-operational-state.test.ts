import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  resolveTableOperationalVisualState,
  tableOperationalVisualStateLabel,
  type ResolveTableOperationalVisualStateInput,
} from "@/lib/map/table-operational-state";

function baseInput(
  overrides: Partial<ResolveTableOperationalVisualStateInput> = {},
): ResolveTableOperationalVisualStateInput {
  return {
    busy: false,
    reserved: false,
    isCriticalTable: false,
    priorityLevel: 0,
    readyToClose: false,
    reservationPressure: null,
    ...overrides,
  };
}

describe("resolveTableOperationalVisualState", () => {
  test("sin señales → libre", () => {
    assert.equal(resolveTableOperationalVisualState(baseInput()), "libre");
  });

  test("ocupación → ocupada", () => {
    assert.equal(resolveTableOperationalVisualState(baseInput({ busy: true })), "ocupada");
  });

  test("reserva sin ocupación → reservada", () => {
    assert.equal(
      resolveTableOperationalVisualState(baseInput({ reserved: true })),
      "reservada",
    );
  });

  test("atención sobre ocupada (priority 2)", () => {
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({ busy: true, priorityLevel: 2 }),
      ),
      "atencion",
    );
  });

  test("retrasada sobre atención y ocupada (reserva late + priority 2 + busy)", () => {
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({
          busy: true,
          priorityLevel: 2,
          reservationPressure: { type: "late", time: "13:00" },
        }),
      ),
      "retrasada",
    );
  });

  test("crítica sobre todos los demás estados", () => {
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({
          busy: true,
          reserved: true,
          priorityLevel: 2,
          readyToClose: true,
          reservationPressure: { type: "late", time: "13:00" },
          isCriticalTable: true,
        }),
      ),
      "critica",
    );
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({
          busy: true,
          priorityLevel: 3,
          reservationPressure: { type: "late", time: "13:00" },
        }),
      ),
      "critica",
    );
  });

  test("mesa ocupada con reserva próxima → atencion (comportamiento actual)", () => {
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({
          busy: true,
          reserved: true,
          reservationPressure: { type: "upcoming", time: "14:00" },
        }),
      ),
      "atencion",
    );
  });

  test("reserva próxima sin ocupación → atencion (comportamiento actual)", () => {
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({
          reserved: true,
          reservationPressure: { type: "upcoming", time: "14:00" },
        }),
      ),
      "atencion",
    );
  });

  test("readyToClose sobre ocupada → atencion", () => {
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({ busy: true, readyToClose: true }),
      ),
      "atencion",
    );
  });

  test("priority 1 sobre ocupada → atencion", () => {
    assert.equal(
      resolveTableOperationalVisualState(
        baseInput({ busy: true, priorityLevel: 1 }),
      ),
      "atencion",
    );
  });
});

test("expone etiquetas de estado comprensibles para lectores de pantalla", () => {
  assert.equal(tableOperationalVisualStateLabel("libre"), "Libre");
  assert.equal(tableOperationalVisualStateLabel("critica"), "Crítica");
  assert.equal(
    tableOperationalVisualStateLabel("atencion"),
    "Requiere atención",
  );
});
