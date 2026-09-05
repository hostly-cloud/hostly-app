import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  createBackToMapFlushGuard,
  isValidPersistDraftAck,
  shouldAbortBackToMapDueToTableChange,
  shouldClearLocalDraftCacheAfterBackToMapAck,
  shouldFlushDraftBeforeBackToMap,
  shouldNavigateToMapAfterBackToMap,
  shouldPreserveLocalDraftCacheOnBackToMap,
} from "@/lib/tpv/back-to-map-pending-draft";

const emptyFlushFlags = {
  hasDraftOrderId: false,
  hasLocalDraftKey: false,
  hasPersistChain: false,
} as const;

describe("back-to-map pending draft policy", () => {
  test("1. sin pending → no flushea", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 0,
        hasDebounceTimer: false,
        ...emptyFlushFlags,
      }),
      false,
    );
    assert.equal(
      shouldNavigateToMapAfterBackToMap({
        flushRequired: false,
        flushSucceeded: false,
      }),
      true,
    );
  });

  test("2. con pending → debe flushear antes de navegar", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 2,
        hasDebounceTimer: false,
        ...emptyFlushFlags,
      }),
      true,
    );
    assert.equal(
      shouldNavigateToMapAfterBackToMap({
        flushRequired: true,
        flushSucceeded: false,
      }),
      false,
    );
  });

  test("3. ACK válido → limpia solo si no hay líneas activas y permite navegar", () => {
    assert.equal(
      isValidPersistDraftAck({ ok: true, orderId: "ord-1" }),
      true,
    );
    assert.equal(
      shouldClearLocalDraftCacheAfterBackToMapAck({
        ackValid: true,
        activeLineCountAfterFlush: 0,
      }),
      true,
    );
    assert.equal(
      shouldNavigateToMapAfterBackToMap({
        flushRequired: true,
        flushSucceeded: true,
      }),
      true,
    );
  });

  test("4. error API / ACK inválido → no limpia ni navega", () => {
    assert.equal(
      isValidPersistDraftAck({ ok: false, error: "NETWORK" }),
      false,
    );
    assert.equal(
      isValidPersistDraftAck({ ok: true, orderId: "  " }),
      false,
    );
    assert.equal(
      shouldClearLocalDraftCacheAfterBackToMapAck({
        ackValid: false,
        activeLineCountAfterFlush: 0,
      }),
      false,
    );
    assert.equal(
      shouldNavigateToMapAfterBackToMap({
        flushRequired: true,
        flushSucceeded: false,
      }),
      false,
    );
  });

  test("5. timeout equivalente a flush fallido → conserva estado", () => {
    assert.equal(
      shouldNavigateToMapAfterBackToMap({
        flushRequired: true,
        flushSucceeded: false,
      }),
      false,
    );
    assert.equal(shouldPreserveLocalDraftCacheOnBackToMap(1), true);
  });

  test("6+7. doble tap / guard → un único begin", () => {
    const guard = createBackToMapFlushGuard();
    assert.equal(guard.tryBegin(), true);
    assert.equal(guard.tryBegin(), false);
    assert.equal(guard.isInFlight(), true);
    guard.end();
    assert.equal(guard.tryBegin(), true);
    guard.end();
  });

  test("8. ACK tardío no abre segundo vuelo mientras inFlight", () => {
    const guard = createBackToMapFlushGuard();
    assert.equal(guard.tryBegin(), true);
    // Segundo tap (ACK aún no llegó) no arranca otro flush.
    assert.equal(guard.tryBegin(), false);
    guard.end();
  });

  test("9. cambio de orderId/mesa durante flush → aborta", () => {
    assert.equal(
      shouldAbortBackToMapDueToTableChange({
        startedTableId: "mesa-1",
        currentTableId: "mesa-2",
      }),
      true,
    );
    assert.equal(
      shouldAbortBackToMapDueToTableChange({
        startedTableId: "mesa-1",
        currentTableId: "mesa-1",
      }),
      false,
    );
  });

  test("10+11. lock conflict / sin ACK → no limpia caché", () => {
    assert.equal(
      shouldClearLocalDraftCacheAfterBackToMapAck({
        ackValid: false,
        activeLineCountAfterFlush: 0,
      }),
      false,
    );
  });

  test("10b. 409 ORDER_NOT_ACTIVE / TABLE_ORDER_LOCK_CONFLICT → conserva draft", () => {
    for (const error of ["ORDER_NOT_ACTIVE", "TABLE_ORDER_LOCK_CONFLICT", "LOCK_TENANT_MISMATCH"]) {
      assert.equal(isValidPersistDraftAck({ ok: false, error }), false);
      assert.equal(
        shouldNavigateToMapAfterBackToMap({
          flushRequired: true,
          flushSucceeded: false,
        }),
        false,
      );
      assert.equal(
        shouldClearLocalDraftCacheAfterBackToMapAck({
          ackValid: false,
          activeLineCountAfterFlush: 2,
        }),
        false,
      );
      assert.equal(shouldPreserveLocalDraftCacheOnBackToMap(2), true);
    }
  });

  test("12. flushea debounce o cadena en vuelo", () => {
    assert.equal(
      shouldFlushDraftBeforeBackToMap({
        activeLineCount: 0,
        hasDebounceTimer: true,
        ...emptyFlushFlags,
      }),
      true,
    );
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

  test("13. pending parcialmente vaciado (1→0) con orderId → flushea []", () => {
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

  test("14. caché local solo se limpia tras ACK y sin líneas activas", () => {
    assert.equal(
      shouldClearLocalDraftCacheAfterBackToMapAck({
        ackValid: true,
        activeLineCountAfterFlush: 2,
      }),
      false,
    );
    assert.equal(
      shouldClearLocalDraftCacheAfterBackToMapAck({
        ackValid: true,
        activeLineCountAfterFlush: 0,
      }),
      true,
    );
  });

  test("15. conserva cache con pending/sent activos", () => {
    assert.equal(shouldPreserveLocalDraftCacheOnBackToMap(1), true);
    assert.equal(shouldPreserveLocalDraftCacheOnBackToMap(0), false);
  });
});

describe("handleBackToMap structural — no perder pending", () => {
  const src = readFileSync(
    "app/dashboard/carta/carta-page-content.tsx",
    "utf8",
  );

  test("16. espera flush antes de navegar al mapa", () => {
    assert.match(src, /shouldFlushDraftBeforeBackToMap/);
    assert.match(src, /await \(draftPersistChainByTableRef\.current\[tid\]/);
    assert.match(src, /isValidPersistDraftAck/);
    assert.match(src, /draftPersistRevisionByTableRef\.current\[tid\] \?\? 0/);
  });

  test("17. no navega si el flush falla (ACK real)", () => {
    const backToMapBlock = src.slice(
      src.indexOf("const handleBackToMap = useCallback"),
      src.indexOf("const handlePrintPreTicket"),
    );
    assert.match(
      backToMapBlock,
      /No se pudo guardar la comanda\. Revisa la conexión e inténtalo otra vez\./,
    );
    assert.match(backToMapBlock, /return;/);
    assert.doesNotMatch(
      backToMapBlock,
      /if \(tid\) \{\s*delete openDraftOrderIdByTableRef\.current\[tid\];/,
    );
  });

  test("18. no cambia send/pagos/release-effects en este bloque", () => {
    assert.match(src, /runReleaseSideEffectsExactlyOnce/);
    assert.match(src, /handlePayTableOrder|isPaymentOpen/);
    assert.match(src, /const sendLinesToComanda = releaseLinesToProduction/);
  });
});
