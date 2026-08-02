import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  partitionMergedLinesForSplit,
  resolveSplitTargetOrderId,
  tableHasActiveSplitLines,
} from "@/lib/server/tpv/table-group-split-partition";

function line(
  id: string,
  opts: {
    sourceTable?: string;
    sourceOrder?: string;
    status?: string;
  } = {},
): Record<string, unknown> {
  return {
    id,
    productId: `p-${id}`,
    quantity: 1,
    qty: 1,
    status: opts.status ?? "sent",
    total: 10,
    ...(opts.sourceTable
      ? { tableGroupSourceTableId: opts.sourceTable }
      : {}),
    ...(opts.sourceOrder
      ? { tableGroupSourceOrderId: opts.sourceOrder }
      : {}),
  };
}

describe("partitionMergedLinesForSplit", () => {
  test("Caso A: cada línea vuelve a su mesa de origen", () => {
    const result = partitionMergedLinesForSplit({
      lines: [
        line("bruschetta", { sourceTable: "mesa-1", sourceOrder: "o1" }),
        line("berenjena", { sourceTable: "mesa-2", sourceOrder: "o2" }),
      ],
      mainTableId: "mesa-1",
      memberIds: ["mesa-1", "mesa-2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.byTableId["mesa-1"]?.length, 1);
    assert.equal(result.byTableId["mesa-1"]?.[0]?.id, "bruschetta");
    assert.equal(result.byTableId["mesa-2"]?.length, 1);
    assert.equal(result.byTableId["mesa-2"]?.[0]?.id, "berenjena");
  });

  test("Caso B: varias líneas por mesa", () => {
    const result = partitionMergedLinesForSplit({
      lines: [
        line("a", { sourceTable: "m1", sourceOrder: "o1" }),
        line("b", { sourceTable: "m1", sourceOrder: "o1" }),
        line("c", { sourceTable: "m2", sourceOrder: "o2" }),
        line("d", { sourceTable: "m2", sourceOrder: "o2" }),
      ],
      mainTableId: "m1",
      memberIds: ["m1", "m2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(
      result.byTableId["m1"]?.map((l) => l.id).sort(),
      ["a", "b"],
    );
    assert.deepEqual(
      result.byTableId["m2"]?.map((l) => l.id).sort(),
      ["c", "d"],
    );
  });

  test("Caso C: conserva pending y prepared", () => {
    const result = partitionMergedLinesForSplit({
      lines: [
        line("p", { sourceTable: "m1", sourceOrder: "o1", status: "pending" }),
        line("r", {
          sourceTable: "m2",
          sourceOrder: "o2",
          status: "prepared",
        }),
      ],
      mainTableId: "m1",
      memberIds: ["m1", "m2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.byTableId["m1"]?.[0]?.status, "pending");
    assert.equal(result.byTableId["m2"]?.[0]?.status, "prepared");
  });

  test("Caso D: línea sin provenance → mesa autoritativa del grupo", () => {
    const result = partitionMergedLinesForSplit({
      lines: [
        line("old", { sourceTable: "m2", sourceOrder: "o2" }),
        line("nuevo-post-merge"),
      ],
      mainTableId: "m1",
      memberIds: ["m1", "m2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.byTableId["m2"]?.[0]?.id, "old");
    assert.equal(result.byTableId["m1"]?.some((l) => l.id === "nuevo-post-merge"), true);
  });

  test("Caso F: legacy sin provenance → aborta", () => {
    const result = partitionMergedLinesForSplit({
      lines: [line("x"), line("y")],
      mainTableId: "m1",
      memberIds: ["m1", "m2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error, "PROVENANCE_INSUFFICIENT");
  });

  test("Caso G helper: active vs cancelled", () => {
    assert.equal(
      tableHasActiveSplitLines([line("a", { status: "sent" })]),
      true,
    );
    assert.equal(
      tableHasActiveSplitLines([line("a", { status: "cancelled" })]),
      false,
    );
  });
});

describe("resolveSplitTargetOrderId", () => {
  test("usa provenance unánime", () => {
    const id = resolveSplitTargetOrderId({
      tableId: "m2",
      mainTableId: "m1",
      destOrderId: "dest",
      lines: [
        line("a", { sourceTable: "m2", sourceOrder: "src-2" }),
        line("b", { sourceTable: "m2", sourceOrder: "src-2" }),
      ],
      mergedSourceByTableId: new Map([["m2", "src-2"]]),
    });
    assert.equal(id, "src-2");
  });

  test("main sin provenance unánime usa dest", () => {
    const id = resolveSplitTargetOrderId({
      tableId: "m1",
      mainTableId: "m1",
      destOrderId: "dest",
      lines: [line("nuevo")],
      mergedSourceByTableId: new Map(),
    });
    assert.equal(id, "dest");
  });
});

describe("merge stamps provenance (structural)", () => {
  test("handleMergeTableGroupOrders usa ensureTableGroupLineOrigin", () => {
    const src = readFileSync(
      "lib/server/tpv/handle-merge-table-group-orders.ts",
      "utf8",
    );
    assert.match(src, /ensureTableGroupLineOrigin/);
  });

  test("split API route y client existen", () => {
    assert.match(
      readFileSync("app/api/tpv/orders/split-table-group/route.ts", "utf8"),
      /handleSplitTableGroupOrders/,
    );
    assert.match(
      readFileSync("lib/firestore/split-table-group-orders.ts", "utf8"),
      /operationId/,
    );
    assert.match(
      readFileSync("hooks/useTableGroups.ts", "utf8"),
      /splitTableGroupOrdersViaApi/,
    );
  });
});
