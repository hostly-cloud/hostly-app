import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  ensureTableGroupLineOrigin,
  withTableGroupLineOrigin,
} from "@/lib/server/tpv/table-group-order-utils";
import {
  planJoinTopology,
  planSplitTopology,
} from "@/lib/server/tpv/table-group-topology";

describe("table-group topology + provenance", () => {
  test("provenance nueva en merge (stamp)", () => {
    const stamped = withTableGroupLineOrigin({ id: "l1" }, "mesa-1", "ord-1");
    assert.equal(stamped.tableGroupSourceTableId, "mesa-1");
    assert.equal(stamped.tableGroupSourceOrderId, "ord-1");
  });

  test("provenance previa conservada", () => {
    const prior = withTableGroupLineOrigin({ id: "l1" }, "mesa-1", "ord-1");
    const kept = ensureTableGroupLineOrigin(prior, "mesa-2", "ord-2");
    assert.equal(kept.tableGroupSourceTableId, "mesa-1");
    assert.equal(kept.tableGroupSourceOrderId, "ord-1");
  });

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

  test("separar B y luego C", () => {
    const groups = { A: ["B", "C"] };
    const sepB = planSplitTopology({
      currentGroups: groups,
      mainTableId: "A",
      separateTableId: "B",
      clientMemberIds: ["A", "B", "C"],
    });
    assert.equal(sepB.ok, true);
    if (!sepB.ok) return;
    assert.deepEqual(sepB.nextGroups.A, ["C"]);
    const sepC = planSplitTopology({
      currentGroups: sepB.nextGroups,
      mainTableId: "A",
      separateTableId: "C",
    });
    assert.equal(sepC.ok, true);
    if (!sepC.ok) return;
    assert.equal(sepC.nextGroups.A, undefined);
  });

  test("línea post-merge a main documentada en partition", () => {
    const src = readFileSync(
      "lib/server/tpv/table-group-split-partition.ts",
      "utf8",
    );
    assert.match(src, /mesa autoritativa del grupo/);
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

  test("split: memberIds en orden distinto no abortan (servidor autoritativo)", () => {
    const r = planSplitTopology({
      currentGroups: { A: ["B"] },
      mainTableId: "A",
      clientMemberIds: ["B", "A"],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.deepEqual(r.memberIds, ["A", "B"]);
  });

  test("split: snapshot cliente stale no aborta si el servidor tiene grupo", () => {
    const r = planSplitTopology({
      currentGroups: { A: ["B"] },
      mainTableId: "A",
      clientMemberIds: ["A", "B", "ghost"],
    });
    assert.equal(r.ok, true);
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

describe("join/split atomic client + server contracts (structural)", () => {
  test("cliente no persiste tableGroups antes del API", () => {
    const hook = readFileSync("hooks/useTableGroups.ts", "utf8");
    assert.doesNotMatch(hook, /persistTableGroups/);
    assert.doesNotMatch(hook, /queuePersist/);
    assert.doesNotMatch(hook, /from "firebase\/firestore";\r?\nimport \{[^}]*setDoc/);
    assert.doesNotMatch(hook, /await setDoc\(/);
    assert.match(hook, /pendingOp/);
    assert.match(hook, /joining/);
    assert.match(hook, /splitting/);
    assert.match(hook, /operationId/);
    assert.match(hook, /showTableGroupOpError/);
  });

  test("merge escribe tableGroups + orderItems + operationId", () => {
    const src = readFileSync(
      "lib/server/tpv/handle-merge-table-group-orders.ts",
      "utf8",
    );
    assert.match(src, /tableGroupsDocRef/);
    assert.match(src, /planOrderProjectionWrites/);
    assert.match(src, /operationId/);
    assert.match(src, /IDEMPOTENCY_CONFLICT/);
    assert.match(src, /ensureTableGroupLineOrigin/);
  });

  test("split no consulta mergedIntoOrderId (evita índice faltante en prod)", () => {
    const src = readFileSync(
      "lib/server/tpv/handle-split-table-group-orders.ts",
      "utf8",
    );
    assert.doesNotMatch(
      src,
      /\.where\(\s*["']mergedIntoOrderId["']\s*,\s*["']==["']/,
    );
    assert.match(src, /scan_member_orders/);
    assert.match(src, /FieldValue\.delete\(\)/);
    // delete solo en update, no en create/set
    assert.match(src, /if \(a\.create\)/);
    assert.match(src, /FIRESTORE_INDEX_REQUIRED/);
  });

  test("menú Separar: un solo handler onClick (sin capture que ejecute split)", () => {
    const src = readFileSync("components/map/element-map-card.tsx", "utf8");
    assert.doesNotMatch(
      src,
      /addEventListener\(\s*["']click["']\s*,\s*handler\s*,\s*true\s*\)/,
    );
    assert.match(src, /runSeparateGroupedTables\("onClick"\)/);
    assert.match(src, /Un solo punto de ejecución del split/);
    // pointerUp del botón solo corta propagación
    assert.match(src, /onPointerUp=\{\(ev\) => \{\s*ev\.stopPropagation\(\);\s*\}\}/);
  });

  test("KDS transition rechaza ORDER_NOT_EDITABLE", () => {
    const src = readFileSync(
      "lib/server/tpv/handle-tpv-order-mutations.ts",
      "utf8",
    );
    assert.match(src, /if \(!isActiveTpvOrderStatus\(orderData\.status\)\) throw new Error\("ORDER_NOT_EDITABLE"\)/);
  });

  test("merge/split routes exigen operationId y rechazan restaurantId cliente", () => {
    const mergeRoute = readFileSync(
      "app/api/tpv/orders/merge-table-group/route.ts",
      "utf8",
    );
    const splitRoute = readFileSync(
      "app/api/tpv/orders/split-table-group/route.ts",
      "utf8",
    );
    assert.match(mergeRoute, /OPERATION_ID_REQUIRED/);
    assert.match(mergeRoute, /RESTAURANT_ID_NOT_ALLOWED/);
    assert.match(splitRoute, /OPERATION_ID_REQUIRED/);
    assert.match(splitRoute, /RESTAURANT_ID_NOT_ALLOWED/);
  });
});
