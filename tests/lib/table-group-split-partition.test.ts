import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  partitionMergedLinesForSplit,
  planTableGroupSplitPartition,
  readSplitLineSourceOrderId,
  readSplitLineSourceTableId,
} from "@/lib/server/tpv/table-group-split-partition";

function line(
  id: string,
  opts: {
    sourceTable?: string;
    sourceOrder?: string;
    status?: string;
    quantity?: number;
    price?: number;
    total?: number;
    modifiers?: unknown;
    routing?: string;
    course?: string;
  } = {},
): Record<string, unknown> {
  return {
    id,
    productId: `p-${id}`,
    quantity: opts.quantity ?? 1,
    qty: opts.quantity ?? 1,
    status: opts.status ?? "sent",
    price: opts.price ?? 10,
    total: opts.total ?? opts.price ?? 10,
    ...(opts.modifiers != null ? { modifiers: opts.modifiers } : {}),
    ...(opts.routing ? { routing: opts.routing } : {}),
    ...(opts.course ? { course: opts.course } : {}),
    ...(opts.sourceTable ? { tableGroupSourceTableId: opts.sourceTable } : {}),
    ...(opts.sourceOrder ? { tableGroupSourceOrderId: opts.sourceOrder } : {}),
  };
}

function plan(args: {
  lines: Record<string, unknown>[];
  main?: string;
  members?: string[];
  removed?: string[];
  remaining?: string[];
  dest?: string;
  sources?: { id: string; tableId: string }[];
  restaurantId?: string;
}) {
  const main = args.main ?? "A";
  const members = args.members ?? ["A", "B"];
  const removed = args.removed ?? ["B"];
  const remaining = args.remaining ?? members.filter((m) => !removed.includes(m));
  return planTableGroupSplitPartition({
    restaurantId: args.restaurantId ?? "rest-1",
    primaryTableId: main,
    mainTableId: main,
    memberTableIds: members,
    removedTableIds: removed,
    remainingTableIds: remaining,
    destOrderId: args.dest ?? "dest-A",
    lines: args.lines,
    sourceOrders:
      args.sources ??
      removed.map((tid, i) => ({ id: `src-${tid}`, tableId: tid })),
  });
}

describe("planTableGroupSplitPartition", () => {
  test("1. split simple A+B, cada línea vuelve a su mesa", () => {
    const r = plan({
      lines: [
        line("la", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("lb", { sourceTable: "B", sourceOrder: "src-B" }),
      ],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-B"]?.[0]?.id, "lb");
    assert.deepEqual(
      r.remainingOnPrimary.map((l) => l.id),
      ["la"],
    );
  });

  test("2. A+B+C separar C", () => {
    const r = plan({
      members: ["A", "B", "C"],
      removed: ["C"],
      lines: [
        line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("b", { sourceTable: "B", sourceOrder: "src-B" }),
        line("c", { sourceTable: "C", sourceOrder: "src-C" }),
      ],
      sources: [{ id: "src-C", tableId: "C" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-C"]?.[0]?.id, "c");
    assert.deepEqual(
      r.remainingOnPrimary.map((l) => l.id).sort(),
      ["a", "b"],
    );
  });

  test("3. A+B+C separar B+C", () => {
    const r = plan({
      members: ["A", "B", "C"],
      removed: ["B", "C"],
      lines: [
        line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("b", { sourceTable: "B", sourceOrder: "src-B" }),
        line("c", { sourceTable: "C", sourceOrder: "src-C" }),
      ],
      sources: [
        { id: "src-B", tableId: "B" },
        { id: "src-C", tableId: "C" },
      ],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-B"]?.[0]?.id, "b");
    assert.equal(r.bySourceOrderId["src-C"]?.[0]?.id, "c");
    assert.deepEqual(
      r.remainingOnPrimary.map((l) => l.id),
      ["a"],
    );
  });

  test("4. mesa principal permanece", () => {
    const r = plan({
      lines: [
        line("keep", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("go", { sourceTable: "B", sourceOrder: "src-B" }),
      ],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.remainingOnPrimary.some((l) => l.id === "keep"));
    assert.ok(!r.bySourceOrderId["src-B"]!.some((l) => l.id === "keep"));
  });

  test("5. provenance completa", () => {
    const r = plan({
      lines: [line("x", { sourceTable: "B", sourceOrder: "src-B" })],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-B"]?.length, 1);
  });

  test("6. provenance parcial reconstruible (solo orderId)", () => {
    const r = plan({
      lines: [
        line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("b", { sourceOrder: "src-B" }),
      ],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-B"]?.[0]?.id, "b");
  });

  test("7. provenance parcial ambigua (tableId con 2 sources) → Case F", () => {
    const r = plan({
      members: ["A", "B"],
      removed: ["B"],
      lines: [
        line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("b", { sourceTable: "B" }),
      ],
      sources: [
        { id: "src-B1", tableId: "B" },
        { id: "src-B2", tableId: "B" },
      ],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "PROVENANCE_INSUFFICIENT");
  });

  test("8. provenance inexistente con único destino (sin sources) → remain", () => {
    const r = planTableGroupSplitPartition({
      restaurantId: "rest-1",
      primaryTableId: "A",
      mainTableId: "A",
      memberTableIds: ["A", "B"],
      removedTableIds: ["B"],
      remainingTableIds: ["A"],
      destOrderId: "dest-A",
      lines: [line("solo")],
      sourceOrders: [],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.remainingOnPrimary.length, 1);
  });

  test("9. provenance inexistente con varios destinos → Case F", () => {
    const r = plan({
      lines: [line("x"), line("y")],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "PROVENANCE_INSUFFICIENT");
  });

  test("10. provenance contradictoria → Case F", () => {
    const r = plan({
      members: ["A", "B", "C"],
      removed: ["B", "C"],
      lines: [
        line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("bad", { sourceTable: "C", sourceOrder: "src-B" }),
      ],
      sources: [
        { id: "src-B", tableId: "B" },
        { id: "src-C", tableId: "C" },
      ],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "PROVENANCE_INSUFFICIENT");
  });

  test("11. línea nueva post-merge con destino demostrable (Case D)", () => {
    const r = plan({
      lines: [
        line("old", { sourceTable: "B", sourceOrder: "src-B" }),
        line("nuevo-post-merge"),
      ],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.remainingOnPrimary.some((l) => l.id === "nuevo-post-merge"));
    assert.equal(r.bySourceOrderId["src-B"]?.[0]?.id, "old");
  });

  test("12. línea nueva ambigua sin stamps en ticket → Case F", () => {
    const r = plan({
      lines: [line("nuevo")],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error, "PROVENANCE_INSUFFICIENT");
  });

  test("13. re-merge conserva origen (order histórico)", () => {
    const r = plan({
      members: ["A", "B", "C"],
      removed: ["B"],
      lines: [
        line("from-b", { sourceTable: "B", sourceOrder: "src-B-original" }),
        line("from-c", { sourceTable: "C", sourceOrder: "src-C" }),
      ],
      sources: [{ id: "src-B-original", tableId: "B" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-B-original"]?.[0]?.id, "from-b");
    assert.ok(r.remainingOnPrimary.some((l) => l.id === "from-c"));
  });

  test("14. dos grupos previamente unidos", () => {
    const r = plan({
      members: ["A", "B", "C", "D"],
      removed: ["C", "D"],
      lines: [
        line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("b", { sourceTable: "B", sourceOrder: "src-B" }),
        line("c", { sourceTable: "C", sourceOrder: "src-C" }),
        line("d", { sourceTable: "D", sourceOrder: "src-D" }),
      ],
      sources: [
        { id: "src-C", tableId: "C" },
        { id: "src-D", tableId: "D" },
      ],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-C"]?.[0]?.id, "c");
    assert.equal(r.bySourceOrderId["src-D"]?.[0]?.id, "d");
  });

  test("15-19. quantities, status, modifiers, routing, suma monetaria", () => {
    const mods = [{ id: "m1", name: "extra" }];
    const lines = [
      line("a", {
        sourceTable: "A",
        sourceOrder: "dest-A",
        quantity: 2,
        price: 5,
        total: 10,
        status: "pending",
        modifiers: mods,
        routing: "barra",
        course: "1",
      }),
      line("b", {
        sourceTable: "B",
        sourceOrder: "src-B",
        quantity: 3,
        price: 4,
        total: 12,
        status: "prepared",
        routing: "cocina",
        course: "2",
      }),
    ];
    const r = plan({ lines, sources: [{ id: "src-B", tableId: "B" }] });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const kept = r.remainingOnPrimary[0]!;
    const restored = r.bySourceOrderId["src-B"]![0]!;
    assert.equal(kept.quantity, 2);
    assert.equal(kept.status, "pending");
    assert.deepEqual(kept.modifiers, mods);
    assert.equal(kept.routing, "barra");
    assert.equal(kept.course, "1");
    assert.equal(restored.quantity, 3);
    assert.equal(restored.status, "prepared");
    assert.equal(restored.routing, "cocina");
    const sum =
      Number(kept.total ?? 0) +
      Number(restored.total ?? 0);
    assert.equal(sum, 22);
  });

  test("20-21. orden determinista e input order distinto → mismo plan lógico", () => {
    const a = line("a", { sourceTable: "A", sourceOrder: "dest-A" });
    const b = line("b", { sourceTable: "B", sourceOrder: "src-B" });
    const c = line("c", { sourceTable: "B", sourceOrder: "src-B" });
    const r1 = plan({
      lines: [a, b, c],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    const r2 = plan({
      lines: [c, a, b],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r1.ok && r2.ok, true);
    if (!r1.ok || !r2.ok) return;
    assert.deepEqual(
      r1.bySourceOrderId["src-B"]!.map((l) => l.id).sort(),
      r2.bySourceOrderId["src-B"]!.map((l) => l.id).sort(),
    );
    assert.deepEqual(
      r1.remainingOnPrimary.map((l) => l.id).sort(),
      r2.remainingOnPrimary.map((l) => l.id).sort(),
    );
    assert.deepEqual(
      r1.bySourceOrderId["src-B"]!.map((l) => l.id),
      ["b", "c"],
    );
  });

  test("22. no muta inputs", () => {
    const lines = [
      line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
      line("b", { sourceTable: "B", sourceOrder: "src-B" }),
    ];
    const snapshot = JSON.stringify(lines);
    const r = plan({ lines, sources: [{ id: "src-B", tableId: "B" }] });
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify(lines), snapshot);
  });

  test("23. cross-tenant (restaurantId vacío) → Case F", () => {
    const r = plan({
      restaurantId: "  ",
      lines: [line("b", { sourceTable: "B", sourceOrder: "src-B" })],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, false);
  });

  test("24. mesa fuera de topología (table stamp externo) → main, no pierde", () => {
    const r = plan({
      lines: [
        line("ext", { sourceTable: "Z", sourceOrder: "ord-z" }),
        line("b", { sourceTable: "B", sourceOrder: "src-B" }),
      ],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.ok(r.remainingOnPrimary.some((l) => l.id === "ext"));
  });

  test("25-26. grupo vacío / sin líneas con sources → Case F", () => {
    const empty = plan({
      lines: [],
      sources: [{ id: "src-B", tableId: "B" }],
    });
    assert.equal(empty.ok, false);
  });

  test("27. primary removida (effective main distinta) usa mainTableId del plan", () => {
    const r = planTableGroupSplitPartition({
      restaurantId: "rest-1",
      primaryTableId: "A",
      mainTableId: "B",
      memberTableIds: ["A", "B", "C"],
      removedTableIds: ["A"],
      remainingTableIds: ["B", "C"],
      destOrderId: "dest-was-A",
      lines: [
        line("from-a", { sourceTable: "A", sourceOrder: "src-A" }),
        line("keep-b", { sourceTable: "B", sourceOrder: "dest-was-A" }),
      ],
      sourceOrders: [{ id: "src-A", tableId: "A" }],
    });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.bySourceOrderId["src-A"]?.[0]?.id, "from-a");
    assert.ok(r.remainingOnPrimary.some((l) => l.id === "keep-b"));
  });

  test("28. líneas sin destino no se pierden (conteo)", () => {
    const lines = [
      line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
      line("b", { sourceTable: "B", sourceOrder: "src-B" }),
      line("nuevo"),
    ];
    const r = plan({ lines, sources: [{ id: "src-B", tableId: "B" }] });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    const n =
      r.remainingOnPrimary.length +
      Object.values(r.bySourceOrderId).reduce((acc, xs) => acc + xs.length, 0);
    assert.equal(n, lines.length);
  });

  test("29. múltiples pedidos plausibles misma mesa → Case F", () => {
    const r = plan({
      lines: [
        line("a", { sourceTable: "A", sourceOrder: "dest-A" }),
        line("b", { sourceTable: "B" }),
      ],
      sources: [
        { id: "s1", tableId: "B" },
        { id: "s2", tableId: "B" },
      ],
    });
    assert.equal(r.ok, false);
  });

  test("30. helper no genera writes (estructural: archivo puro)", () => {
    const src = readFileSync("lib/server/tpv/table-group-split-partition.ts", "utf8");
    assert.doesNotMatch(src, /firebase-admin/);
    assert.doesNotMatch(src, /from ["']firebase/);
    assert.doesNotMatch(src, /runTransaction/);
    assert.doesNotMatch(src, /FieldValue/);
    assert.doesNotMatch(src, /getFirestore/);
    assert.match(src, /PROVENANCE_INSUFFICIENT/);
    assert.match(src, /Case F/);
  });
});

describe("partitionMergedLinesForSplit (compat Case A–F)", () => {
  test("Caso A/D/F históricos", () => {
    const a = partitionMergedLinesForSplit({
      lines: [
        line("bruschetta", { sourceTable: "mesa-1", sourceOrder: "o1" }),
        line("berenjena", { sourceTable: "mesa-2", sourceOrder: "o2" }),
      ],
      mainTableId: "mesa-1",
      memberIds: ["mesa-1", "mesa-2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(a.ok, true);
    if (!a.ok) return;
    assert.equal(a.byTableId["mesa-1"]?.[0]?.id, "bruschetta");

    const d = partitionMergedLinesForSplit({
      lines: [line("old", { sourceTable: "m2" }), line("nuevo")],
      mainTableId: "m1",
      memberIds: ["m1", "m2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(d.ok, true);
    if (!d.ok) return;
    assert.ok(d.byTableId["m1"]?.some((l) => l.id === "nuevo"));

    const f = partitionMergedLinesForSplit({
      lines: [line("x"), line("y")],
      mainTableId: "m1",
      memberIds: ["m1", "m2"],
      hasMergedSourceOrders: true,
    });
    assert.equal(f.ok, false);
  });
});

describe("split handler wiring (estructural)", () => {
  test("usa planTableGroupSplitPartition y mapea 409", () => {
    const src = readFileSync(
      "lib/server/tpv/handle-split-table-group-orders.ts",
      "utf8",
    );
    assert.match(src, /planTableGroupSplitPartition/);
    assert.match(src, /PROVENANCE_INSUFFICIENT/);
    assert.match(src, /planSplitFromRemovedHints/);
    assert.doesNotMatch(src, /ensureTableGroupLineOrigin/);
  });

  test("readers de provenance exportados", () => {
    assert.equal(readSplitLineSourceTableId({ tableGroupSourceTableId: " A " }), "A");
    assert.equal(readSplitLineSourceOrderId({ tableGroupSourceOrderId: " o " }), "o");
  });
});
