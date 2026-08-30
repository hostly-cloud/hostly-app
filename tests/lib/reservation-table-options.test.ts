import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Table } from "../../lib/firestore/tables";
import type { FloorPlan } from "../../lib/firestore/floorPlans";
import {
  activeReservationTables,
  reservationTableDisplayLabels,
  reservationTableOptionsForReference,
} from "../../lib/reservas/reservation-table-options";

function table(params: {
  id: string;
  restaurantId?: string;
  isActive?: boolean;
  name?: string;
  floorPlanId?: string;
}): Table {
  return {
    id: params.id,
    restaurantId: params.restaurantId ?? "restaurant-a",
    name: params.name ?? params.id,
    type: "table",
    status: "free",
    tableShape: "square",
    seats: 4,
    x: 0,
    y: 0,
    ...(params.floorPlanId ? { floorPlanId: params.floorPlanId } : {}),
    ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
  };
}

describe("reservation table options", () => {
  test("incluye mesas activas y legacy sin isActive, y excluye las inactivas", () => {
    const options = activeReservationTables(
      [
        table({ id: "Mesa 1", isActive: true }),
        table({ id: "Mesa 2" }),
        table({ id: "Mesa 8", isActive: false }),
      ],
      "restaurant-a",
    );

    assert.deepEqual(
      options.map((option) => option.id),
      ["Mesa 1", "Mesa 2"],
    );
  });

  test("preserva y etiqueta una referencia histórica a una mesa inactiva", () => {
    const inactive = table({ id: "Mesa 8", isActive: false });
    const activeTables = activeReservationTables([inactive], "restaurant-a");

    assert.deepEqual(
      reservationTableOptionsForReference({
        activeTables,
        allTables: [inactive],
        restaurantId: "restaurant-a",
        reference: { tableId: inactive.id, tableLabel: "Mesa 8" },
      }),
      [{ id: "Mesa 8", label: "Mesa 8 (inactiva)", disabled: true }],
    );
  });

  test("mantiene aislamiento por restaurantId", () => {
    const own = table({ id: "Mesa 3", restaurantId: "restaurant-a" });
    const foreign = table({ id: "Mesa 9", restaurantId: "restaurant-b" });

    assert.deepEqual(
      activeReservationTables([own, foreign], "restaurant-a").map(
        (option) => option.id,
      ),
      ["Mesa 3"],
    );
  });

  test("añade el nombre del plano solo cuando hay mesas homónimas", () => {
    const plans: FloorPlan[] = [
      { id: "sala", restaurantId: "restaurant-a", name: "Sala", isDefault: true },
      { id: "terraza", restaurantId: "restaurant-a", name: "Terraza" },
    ];
    const tables = [
      table({ id: "sala-1", name: "Mesa 1", floorPlanId: "sala" }),
      table({ id: "terraza-1", name: "Mesa 1", floorPlanId: "terraza" }),
      table({ id: "sala-2", name: "Mesa 2", floorPlanId: "sala" }),
    ];

    assert.deepEqual(
      [...reservationTableDisplayLabels(tables, plans)],
      [
        ["sala-1", "Mesa 1 · Sala"],
        ["terraza-1", "Mesa 1 · Terraza"],
        ["sala-2", "Mesa 2"],
      ],
    );
  });
});
