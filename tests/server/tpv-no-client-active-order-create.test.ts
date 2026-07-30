import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const OPERATIONAL_MODULES = [
  "app/dashboard/carta/carta-page-content.tsx",
  "hooks/useMesaComanda.ts",
  "hooks/useTableGroups.ts",
  "lib/firestore/pay-table-order.ts",
  "lib/firestore/merge-table-group-orders.ts",
  "lib/firestore/persist-open-order-for-table.ts",
  "lib/firestore/orders.ts",
] as const;

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("3B-2A.1 structural: no client active order create", () => {
  test("1. operational modules do not call createOrder(", () => {
    for (const path of OPERATIONAL_MODULES) {
      if (path.endsWith("orders.ts")) continue;
      const src = read(path);
      assert.doesNotMatch(
        src,
        /\bcreateOrder\s*\(/,
        `${path} must not call createOrder`,
      );
    }
  });

  test("2. operational modules do not addDoc/dbgAddDoc new orders", () => {
    for (const path of [
      "app/dashboard/carta/carta-page-content.tsx",
      "hooks/useMesaComanda.ts",
      "hooks/useTableGroups.ts",
      "lib/firestore/pay-table-order.ts",
      "lib/firestore/merge-table-group-orders.ts",
    ]) {
      const src = read(path);
      assert.doesNotMatch(
        src,
        /dbgAddDoc\s*\(\s*collection\s*\(\s*db\s*,\s*["']orders["']/,
        `${path} must not dbgAddDoc orders`,
      );
      assert.doesNotMatch(
        src,
        /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*["']orders["']/,
        `${path} must not addDoc orders`,
      );
    }
  });

  test("3. persistOpenOrderForTable forbids create without existingOrderId", () => {
    const src = read("lib/firestore/persist-open-order-for-table.ts");
    assert.match(src, /PERSIST_OPEN_ORDER_CREATE_FORBIDDEN/);
    assert.doesNotMatch(src, /dbgAddDoc/);
    assert.doesNotMatch(src, /status:\s*["']open["']/);
  });

  test("4. createOrder legacy is hard-forbidden", () => {
    const src = read("lib/firestore/orders.ts");
    assert.match(src, /CREATE_ORDER_LEGACY_FORBIDDEN/);
    assert.doesNotMatch(src, /dbgAddDoc/);
  });

  test("5. Carta draft flush uses create-open for altas", () => {
    const src = read("app/dashboard/carta/carta-page-content.tsx");
    assert.match(src, /createOpenOrderViaApi/);
    assert.match(src, /flushPersistDraftOrderForTable/);
    // No pasar null como existingOrderId a persist
    assert.doesNotMatch(
      src,
      /persistOpenOrderForTable\s*\([\s\S]*existingOrderId:\s*knownId\s*,\s*operatorAssignment/,
    );
  });

  test("6. useMesaComanda creates via API, not client addDoc", () => {
    const src = read("hooks/useMesaComanda.ts");
    assert.match(src, /createOpenOrderViaApi/);
    assert.match(src, /closeTpvOrderViaApi/);
    assert.doesNotMatch(src, /dbgAddDoc/);
  });

  test("7. pay-table-order goes through API", () => {
    const src = read("lib/firestore/pay-table-order.ts");
    assert.match(src, /\/api\/tpv\/orders\/pay-table/);
    assert.doesNotMatch(src, /DbgWriteBatch/);
  });

  test("8. merge-table-group goes through API", () => {
    const src = read("lib/firestore/merge-table-group-orders.ts");
    assert.match(src, /\/api\/tpv\/orders\/merge-table-group/);
    assert.doesNotMatch(src, /DbgWriteBatch/);
  });
});
