import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { pickActiveOrderDocForTable } from "@/lib/tpv/pick-active-order-doc-for-table";

function mockDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    data: () => data,
  };
}

describe("useMesaComanda identity tableId/mesaId", () => {
  test("create-open escribe tableId (contrato estructural)", () => {
    const src = readFileSync("lib/server/tpv/handle-tpv-order-mutations.ts", "utf8");
    assert.match(src, /tableId,\s*\r?\n\s*table:/);
    assert.match(src, /\.where\(\s*["']tableId["']\s*,\s*["']==["']/);
    assert.doesNotMatch(
      src,
      /collection\("orders"\)[\s\S]{0,200}mesaId:\s*tableId/,
    );
  });

  test("hook consulta tableId canónico y no Date.now como versión", () => {
    const src = readFileSync("hooks/useMesaComanda.ts", "utf8");
    assert.match(src, /buildOrderConstraints\("tableId", tableId/);
    assert.match(src, /pickActiveOrderDocForTable\(tableId/);
    assert.match(src, /createOpenOrderViaApi\(\{\s*\r?\n\s*tableId,/);
    assert.match(src, /readOrderUpdatedAtMs/);
    assert.match(src, /updatedAtMs/);
    assert.doesNotMatch(src, /setCurrentOrderUpdatedAt\(now\)/);
    assert.doesNotMatch(src, /const now = Date\.now\(\)/);
    assert.doesNotMatch(src, /where\("mesaId", "==", mesaId\)/);
  });

  test("prevalece tableId sobre legacy mesaId", () => {
    const tid = "mesa-1";
    const primary = [
      mockDoc("ord-table", { tableId: tid, mesaId: tid, status: "open" }),
    ];
    const legacy = [
      mockDoc("ord-legacy", { mesaId: tid, status: "open" }),
    ];
    const picked = pickActiveOrderDocForTable(tid, primary, legacy);
    assert.equal(picked?.id, "ord-table");
  });

  test("legacy solo mesaId se recupera si no hay tableId", () => {
    const tid = "mesa-1";
    const picked = pickActiveOrderDocForTable(
      tid,
      [],
      [mockDoc("ord-legacy", { mesaId: tid, status: "open" })],
    );
    assert.equal(picked?.id, "ord-legacy");
  });

  test("doc con tableId distinto no se mezcla desde legacy", () => {
    const picked = pickActiveOrderDocForTable(
      "mesa-1",
      [],
      [mockDoc("ord-other", { tableId: "mesa-2", mesaId: "mesa-1", status: "open" })],
    );
    assert.equal(picked, null);
  });

  test("dedupe por id no crea dos pedidos activos", () => {
    const tid = "mesa-1";
    const same = mockDoc("ord-1", { tableId: tid, mesaId: tid, status: "open" });
    const picked = pickActiveOrderDocForTable(tid, [same], [same]);
    assert.equal(picked?.id, "ord-1");
  });
});
