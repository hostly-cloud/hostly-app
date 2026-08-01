import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { tableEmptySessionWarrantsAutoClose } from "@/lib/tpv/table-empty-session-auto-close";
import { orderDocHasActiveLinesForMapOccupancy } from "@/lib/firestore/order-table-occupancy";

const CARTA = "app/dashboard/carta/carta-page-content.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("BLOQUE 1 — autoridad key 2990711", () => {
  const src = read(CARTA);

  test("autoridad usa hasOwnProperty de ordersByTable, no mapa epoch", () => {
    assert.match(
      src,
      /Object\.prototype\.hasOwnProperty\.call\(\s*ordersByTableRef\.current/,
    );
    assert.doesNotMatch(src, /localDraftAuthorityByTableRef/);
    assert.doesNotMatch(src, /markLocalDraftAuthoritative/);
    assert.doesNotMatch(src, /releaseLocalDraftAuthorityForPersistEpoch/);
  });

  test("buildSynced restaura fórmula 2990711 (flag || localLines.length)", () => {
    assert.match(
      src,
      /opts\?\.localDraftAuthoritative === true \|\| localLines\.length > 0/,
    );
  });

  test("create-open sigue siendo el alta (b5c2dfb)", () => {
    assert.match(src, /createOpenOrderViaApi/);
    assert.match(src, /createOpen\.request/);
  });
});

describe("BLOQUE 2 — persist-draft sin empty noop", () => {
  test("persistOpenOrderForTable usa persistDraftItemsViaApi", () => {
    const src = read("lib/firestore/persist-open-order-for-table.ts");
    assert.match(src, /persistDraftItemsViaApi/);
    assert.match(src, /selectDraftPersistableFirestoreItems/);
    assert.doesNotMatch(src, /dbgUpdateDoc/);
  });

  test("sync persist_items no hace early-return ok en []", () => {
    const src = read("lib/firestore/sync-order-items-via-api.ts");
    assert.match(src, /persistDraftItemsViaApi/);
    assert.doesNotMatch(
      src,
      /if\s*\(\s*!markSent\s*&&\s*itemsForUpsert\.length\s*===\s*0\s*\)/,
    );
  });
});

describe("BLOQUE 3 — borrado / realtime structural", () => {
  test("onSnapshot usa key hasOwnProperty como hasLocalDraft", () => {
    const src = read(CARTA);
    assert.match(
      src,
      /localDraftAuthoritative = Object\.prototype\.hasOwnProperty\.call\(\s*prev,\s*tableId/,
    );
    assert.match(src, /isShrink/);
    assert.match(src, /persist\.enqueue\.shrink/);
  });
});

describe("BLOQUE 4 — volver al mapa", () => {
  test("flush before leave y preserve cache", () => {
    const src = read(CARTA);
    assert.match(src, /shouldFlushDraftBeforeBackToMap/);
    assert.match(src, /shouldPreserveLocalDraftCacheOnBackToMap/);
    assert.match(src, /navigation\.backToMap\.flushStart/);
    assert.doesNotMatch(
      src,
      /const handleBackToMap = useCallback\(\(\) => \{\s*const tid[\s\S]*?delete openDraftOrderIdByTableRef\.current\[tid\];/,
    );
  });
});

describe("BLOQUE 6 — autoClose y ocupación", () => {
  test("pending activo no justifica autoClose", () => {
    assert.equal(
      tableEmptySessionWarrantsAutoClose({
        activeLineCount: 1,
        cachedActiveLineCount: 0,
        linesLength: 1,
        openOrderIdsLength: 1,
        firestoreOccupied: true,
        draftOrderId: "ord-1",
        tableHasOperationalSession: true,
      }),
      false,
    );
  });

  test("cache pending bloquea autoClose aunque order UI vacío", () => {
    assert.equal(
      tableEmptySessionWarrantsAutoClose({
        activeLineCount: 0,
        cachedActiveLineCount: 2,
        linesLength: 0,
        openOrderIdsLength: 1,
        firestoreOccupied: false,
        draftOrderId: "ord-1",
        tableHasOperationalSession: false,
      }),
      false,
    );
  });

  test("sesión vacía sin líneas sí justifica autoClose", () => {
    assert.equal(
      tableEmptySessionWarrantsAutoClose({
        activeLineCount: 0,
        cachedActiveLineCount: 0,
        linesLength: 0,
        openOrderIdsLength: 1,
        firestoreOccupied: false,
        draftOrderId: "ord-1",
        tableHasOperationalSession: false,
      }),
      true,
    );
  });

  test("pending qty>0 ocupa mesa (occupancy histórico)", () => {
    assert.equal(
      orderDocHasActiveLinesForMapOccupancy({
        status: "open",
        items: [{ id: "a", quantity: 1, status: "pending" }],
      }),
      true,
    );
  });

  test("carta salta autoClose si Firestore tiene líneas activas", () => {
    const src = read(CARTA);
    assert.match(src, /autoClose\.skip\.hasActiveLines/);
    assert.match(src, /closeTpvOrderViaApi/);
  });
});
