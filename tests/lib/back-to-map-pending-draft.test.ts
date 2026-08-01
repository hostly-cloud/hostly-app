import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  shouldFlushDraftBeforeBackToMap,
  shouldPreserveLocalDraftCacheOnBackToMap,
} from "@/lib/tpv/back-to-map-pending-draft";

const emptyFlushFlags = {
  hasDraftOrderId: false,
  hasLocalDraftKey: false,
  hasPersistChain: false,
} as const;

describe("back-to-map pending draft policy", () => {
  test("flushea si hay líneas activas aunque no haya debounce", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 2,
        hasDebounceTimer: false,
        ...emptyFlushFlags,
      }),
      true,
    );
  });

  test("flushea si hay debounce pendiente (salida inmediata)", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 1,
        hasDebounceTimer: true,
        ...emptyFlushFlags,
      }),
      true,
    );
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 0,
        hasDebounceTimer: true,
        ...emptyFlushFlags,
      }),
      true,
    );
  });

  test("no flushea mesa vacía sin debounce ni orderId local", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 0,
        hasDebounceTimer: false,
        ...emptyFlushFlags,
      }),
      false,
    );
  });

  test("flushea 1→0 pending cuando hay orderId + key local vacía", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 0,
        hasDebounceTimer: false,
        hasDraftOrderId: true,
        hasLocalDraftKey: true,
        hasPersistChain: false,
      }),
      true,
    );
  });

  test("flushea si hay cadena de persistencia en vuelo", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 0,
        hasDebounceTimer: false,
        hasDraftOrderId: false,
        hasLocalDraftKey: false,
        hasPersistChain: true,
      }),
      true,
    );
  });

  test("conserva cache local con pending/sent activos", () => {
    assert.equal(shouldPreserveLocalDraftCacheOnBackToMap(1), true);
    assert.equal(shouldPreserveLocalDraftCacheOnBackToMap(0), false);
  });
});

describe("handleBackToMap structural — no perder pending", () => {
  const src = readFileSync(
    "app/dashboard/carta/carta-page-content.tsx",
    "utf8",
  );

  test("espera flush antes de navegar al mapa", () => {
    assert.match(src, /navigation\.backToMap\.request/);
    assert.match(src, /navigation\.backToMap\.flushStart/);
    assert.match(src, /navigation\.backToMap\.flushSuccess/);
    assert.match(src, /shouldFlushDraftBeforeBackToMap/);
    assert.match(src, /await \(draftPersistChainByTableRef\.current\[tid\]/);
  });

  test("no navega si el flush falla (ACK real)", () => {
    const backToMapBlock = src.slice(
      src.indexOf("const handleBackToMap = useCallback"),
      src.indexOf("const handlePrintPreTicket"),
    );
    assert.match(backToMapBlock, /navigation\.backToMap\.flushError/);
    assert.match(backToMapBlock, /return;/);
    assert.match(
      backToMapBlock,
      /No se pudo guardar la comanda\. Revisa la conexión e inténtalo otra vez\./,
    );
  });

  test("no borra draft local con líneas activas al volver al mapa", () => {
    assert.match(src, /shouldPreserveLocalDraftCacheOnBackToMap/);
    const backToMapBlock = src.slice(
      src.indexOf("const handleBackToMap = useCallback"),
      src.indexOf("const handlePrintPreTicket"),
    );
    assert.ok(backToMapBlock.length > 200);
    assert.match(backToMapBlock, /shouldPreserveLocalDraftCacheOnBackToMap/);
    assert.doesNotMatch(
      backToMapBlock,
      /if \(tid\) \{\s*delete openDraftOrderIdByTableRef\.current\[tid\];/,
    );
  });

  test("reopen consulta active order con pending local/firestore", () => {
    assert.match(src, /reopen\.activeOrderLookup/);
    assert.match(src, /reopen\.hydrateResult/);
  });
});
