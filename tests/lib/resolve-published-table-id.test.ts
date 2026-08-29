import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Table } from "@/lib/firestore/tables";
import { stableOperationalTableIdFromEditorInstance } from "@/lib/sala-editor/identity/operational-table-identity";
import { resolvePublishedOperationalTableId } from "@/lib/tpv/resolve-published-table-id";

function table(
  id: string,
  name: string,
  editorV2InstanceId?: string,
): Table {
  return {
    id,
    restaurantId: "restaurant-1",
    name,
    type: "table",
    status: "free",
    tableShape: "square",
    seats: 4,
    x: 0,
    y: 0,
    isActive: true,
    editorV2InstanceId,
  };
}

describe("resolvePublishedOperationalTableId", () => {
  it("prioriza el tableId explícito publicado", () => {
    assert.equal(
      resolvePublishedOperationalTableId({
        explicitTableId: "legacy-table-2",
        instanceId: "op-inst-2",
        tables: [table("other", "Mesa 2", "op-inst-2")],
      }),
      "legacy-table-2",
    );
  });

  it("recupera por editorV2InstanceId aunque los nombres estén duplicados", () => {
    const tables = [
      table("sala-mesa-2", "Mesa 2", "op-inst-sala-2"),
      table("terraza-mesa-2", "Mesa 2", "op-inst-terraza-2"),
    ];
    assert.equal(
      resolvePublishedOperationalTableId({
        explicitTableId: "",
        instanceId: "op-inst-sala-2",
        tables,
      }),
      "sala-mesa-2",
    );
  });

  it("recupera el ID determinista creado por el publicador", () => {
    const instanceId = "op-inst-new-4";
    const tableId = stableOperationalTableIdFromEditorInstance(instanceId);
    assert.equal(
      resolvePublishedOperationalTableId({
        explicitTableId: null,
        instanceId,
        tables: [table(tableId, "Mesa 4")],
      }),
      tableId,
    );
  });

  it("no resuelve una identidad ambigua", () => {
    assert.equal(
      resolvePublishedOperationalTableId({
        explicitTableId: "",
        instanceId: "op-inst-2",
        tables: [
          table("table-a", "Mesa 2", "op-inst-2"),
          table("table-b", "Mesa 22", "op-inst-2"),
        ],
      }),
      "",
    );
  });

  it("nunca usa el nombre como identidad", () => {
    assert.equal(
      resolvePublishedOperationalTableId({
        explicitTableId: "",
        instanceId: "unknown-instance",
        tables: [table("table-by-name", "Mesa 2")],
      }),
      "",
    );
  });
});
