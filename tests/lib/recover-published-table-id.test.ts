import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Table } from "@/lib/firestore/tables";
import { recoverPublishedTableIdByPlan } from "@/lib/tpv/recover-published-table-id";

function table(id: string, name: string, floorPlanId: string): Table {
  return {
    id,
    restaurantId: "restaurant-1",
    name,
    floorPlanId,
    type: "table",
    status: "free",
    tableShape: "square",
    seats: 4,
    x: 0,
    y: 0,
    isActive: true,
  };
}

describe("recoverPublishedTableIdByPlan", () => {
  it("recupera la mesa dentro del plano aunque el nombre se repita en otro", () => {
    const tables = [
      table("sala-mesa-2", "Mesa 2", "sala"),
      table("espacio-1-mesa-2", "Mesa 2", "espacio-1"),
    ];

    assert.equal(
      recoverPublishedTableIdByPlan({
        instanceName: " mesa 2 ",
        floorPlanId: "sala",
        tables,
      }),
      "sala-mesa-2",
    );
  });

  it("no adivina si hay dos documentos con el mismo nombre en el plano", () => {
    const tables = [
      table("sala-mesa-4-a", "Mesa 4", "sala"),
      table("sala-mesa-4-b", "Mesa 4", "sala"),
    ];

    assert.equal(
      recoverPublishedTableIdByPlan({
        instanceName: "Mesa 4",
        floorPlanId: "sala",
        tables,
      }),
      "",
    );
  });

  it("mantiene la recuperación global para datos antiguos sin floorPlanId", () => {
    assert.equal(
      recoverPublishedTableIdByPlan({
        instanceName: "Mesa 13",
        floorPlanId: "sala",
        tables: [table("legacy-mesa-13", "Mesa 13", "")],
      }),
      "legacy-mesa-13",
    );
  });
});
