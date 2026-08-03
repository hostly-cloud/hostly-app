import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  collectGroupMemberIds,
  planJoinTopology,
  planMergeFromMemberHints,
  planSplitFromRemovedHints,
  planSplitTopology,
} from "@/lib/server/tpv/table-group-topology";

describe("table-group topology (join/split)", () => {
  test("join A+B", () => {
    const r = planJoinTopology({
      currentGroups: {},
      mainTableId: "A",
      secondaryTableId: "B",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.mainTableId, "A");
    assert.deepEqual(r.memberIds, ["A", "B"]);
    assert.deepEqual(r.nextGroups.A, ["B"]);
  });

  test("join A+B+C", () => {
    const ab = planJoinTopology({
      currentGroups: {},
      mainTableId: "A",
      secondaryTableId: "B",
    });
    assert.equal(ab.ok, true);
    if (!ab.ok) return;
    const abc = planJoinTopology({
      currentGroups: ab.nextGroups,
      mainTableId: "A",
      secondaryTableId: "C",
    });
    assert.equal(abc.ok, true);
    if (!abc.ok) return;
    assert.deepEqual(abc.memberIds, ["A", "B", "C"]);
  });

  test("(A+B)+(C+D) conserva cuatro miembros", () => {
    const r = planJoinTopology({
      currentGroups: { A: ["B"], C: ["D"] },
      mainTableId: "A",
      secondaryTableId: "C",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.memberIds, ["A", "B", "C", "D"]);
    assert.deepEqual(r.nextGroups.A, ["B", "C", "D"]);
    assert.equal(r.nextGroups.C, undefined);
  });

  test("(A+B+C)+(D+E+F) seis miembros", () => {
    const r = planJoinTopology({
      currentGroups: { A: ["B", "C"], D: ["E", "F"] },
      mainTableId: "A",
      secondaryTableId: "D",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.memberIds, ["A", "B", "C", "D", "E", "F"]);
  });

  test("join desde secundarios B sobre D resuelve grupos completos", () => {
    const r = planJoinTopology({
      currentGroups: { A: ["B"], C: ["D"] },
      mainTableId: "B",
      secondaryTableId: "D",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.mainTableId, "A");
    assert.deepEqual(r.memberIds, ["A", "B", "C", "D"]);
  });

  test("mismo grupo es idempotente", () => {
    const r = planJoinTopology({
      currentGroups: { A: ["B", "C"] },
      mainTableId: "A",
      secondaryTableId: "B",
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.memberIds, ["A", "B", "C"]);
    assert.deepEqual(r.nextGroups.A, ["B", "C"]);
  });

  test("split progresivo tras (A+B)+(C+D)", () => {
    const joined = planJoinTopology({
      currentGroups: { A: ["B"], C: ["D"] },
      mainTableId: "A",
      secondaryTableId: "C",
    });
    assert.equal(joined.ok, true);
    if (!joined.ok) return;
    const sepB = planSplitTopology({
      currentGroups: joined.nextGroups,
      mainTableId: "A",
      separateTableId: "B",
    });
    assert.equal(sepB.ok, true);
    if (!sepB.ok) return;
    assert.deepEqual(sepB.nextGroups.A, ["C", "D"]);
    const sepD = planSplitTopology({
      currentGroups: sepB.nextGroups,
      mainTableId: "A",
      separateTableId: "D",
    });
    assert.equal(sepD.ok, true);
    if (!sepD.ok) return;
    assert.deepEqual(sepD.nextGroups.A, ["C"]);
  });

  test("join clientMemberIds incorrectos → GROUP_TOPOLOGY_MISMATCH", () => {
    const r = planJoinTopology({
      currentGroups: {},
      mainTableId: "A",
      secondaryTableId: "B",
      clientMemberIds: ["A", "B", "ghost"],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "GROUP_TOPOLOGY_MISMATCH");
  });

  test("split sin grupo → GROUP_NOT_FOUND", () => {
    const r = planSplitTopology({
      currentGroups: {},
      mainTableId: "A",
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "GROUP_NOT_FOUND");
  });
});

describe("planMergeFromMemberHints (contrato actual)", () => {
  test("hint parcial C absorbe C+D al unir con A+B", () => {
    const r = planMergeFromMemberHints({
      currentGroups: { A: ["B"], C: ["D"] },
      mainTableId: "A",
      clientMemberIds: ["A", "C"],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.memberIds, ["A", "B", "C", "D"]);
    assert.deepEqual(r.nextGroups.A, ["B", "C", "D"]);
    assert.equal(r.nextGroups.C, undefined);
  });

  test("hint completo [A,B,C,D] compatible", () => {
    const r = planMergeFromMemberHints({
      currentGroups: { A: ["B"], C: ["D"] },
      mainTableId: "A",
      clientMemberIds: ["A", "B", "C", "D"],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.memberIds, ["A", "B", "C", "D"]);
  });

  test("hint con mesa suelta adicional la une (no es mismatch)", () => {
    // Un id no presente en grupos = join de mesa individual, no fantasma inválido.
    const r = planMergeFromMemberHints({
      currentGroups: { A: ["B"] },
      mainTableId: "A",
      clientMemberIds: ["A", "B", "X"],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.memberIds, ["A", "B", "X"]);
  });

  test("collectGroupMemberIds resuelve desde secundario", () => {
    assert.deepEqual(collectGroupMemberIds({ A: ["B", "C"] }, "B"), ["A", "B", "C"]);
  });
});

describe("planSplitFromRemovedHints (contrato actual)", () => {
  test("quitar B deja A+C", () => {
    const r = planSplitFromRemovedHints({
      currentGroups: { A: ["B", "C"] },
      mainTableId: "A",
      removedTableIds: ["B"],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.remainingTableIds, ["A", "C"]);
    assert.deepEqual(r.nextGroups.A, ["C"]);
    assert.equal(r.dissolveWholeGroup, false);
  });

  test("quitar todas las secundarias disuelve", () => {
    const r = planSplitFromRemovedHints({
      currentGroups: { A: ["B"] },
      mainTableId: "A",
      removedTableIds: ["B"],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.remainingTableIds, ["A"]);
    assert.equal(r.nextGroups.A, undefined);
    assert.equal(r.dissolveWholeGroup, true);
  });

  test("separar primary requiere newMainTableId", () => {
    const bad = planSplitFromRemovedHints({
      currentGroups: { A: ["B", "C"] },
      mainTableId: "A",
      removedTableIds: ["A"],
    });
    assert.equal(bad.ok, false);
    if (bad.ok) return;
    assert.equal(bad.error, "NEW_MAIN_TABLE_ID_REQUIRED");

    const ok = planSplitFromRemovedHints({
      currentGroups: { A: ["B", "C"] },
      mainTableId: "A",
      removedTableIds: ["A"],
      newMainTableId: "B",
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.effectiveMainTableId, "B");
    assert.deepEqual(ok.remainingTableIds, ["B", "C"]);
    assert.deepEqual(ok.nextGroups.B, ["C"]);
    assert.equal(ok.nextGroups.A, undefined);
  });

  test("removed fuera del grupo → TABLE_NOT_IN_GROUP", () => {
    const r = planSplitFromRemovedHints({
      currentGroups: { A: ["B"] },
      mainTableId: "A",
      removedTableIds: ["Z"],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "TABLE_NOT_IN_GROUP");
  });
});

describe("handlers usan topología autoritativa (estructural)", () => {
  test("merge planifica con planMergeFromMemberHints", () => {
    const src = readFileSync("lib/server/tpv/handle-merge-table-group-orders.ts", "utf8");
    assert.match(src, /planMergeFromMemberHints/);
    assert.match(src, /normalizeTableGroupsMap/);
    assert.match(src, /ensureTableGroupLineOrigin/);
  });

  test("split planifica con planSplitFromRemovedHints", () => {
    const src = readFileSync("lib/server/tpv/handle-split-table-group-orders.ts", "utf8");
    assert.match(src, /planSplitFromRemovedHints/);
    assert.match(src, /normalizeTableGroupsMap/);
    assert.doesNotMatch(
      src,
      /\.where\(\s*["']mergedIntoOrderId["']\s*,\s*["']==["']/,
    );
  });
});
