import assert from "node:assert/strict";
import test from "node:test";
import {
  FiscalQueueMessageError,
  FiscalQueueRetryError,
  fiscalChainDeliveryDecision,
  fiscalQueueRetryDecision,
  processFiscalOutboxMessage,
} from "../../lib/server/fiscal/fiscal-outbox-queue";

test("la cola reconoce errores permanentes y reintentos con demora", () => {
  assert.deepEqual(fiscalQueueRetryDecision(new FiscalQueueMessageError("bad")), { acknowledge: true });
  assert.deepEqual(fiscalQueueRetryDecision(new FiscalQueueRetryError(75, "later")), { afterSeconds: 75 });
  assert.deepEqual(fiscalQueueRetryDecision(new Error("network")), { afterSeconds: 60 });
});

test("rechaza mensajes manipulados antes de consultar Firestore", async () => {
  await assert.rejects(processFiscalOutboxMessage({ recordId: "../foreign" }), /FISCAL_RECORD_ID_INVALID/);
  await assert.rejects(processFiscalOutboxMessage(null), /FISCAL_QUEUE_MESSAGE_INVALID/);
});

test("solo permite entregar el siguiente registro de la cadena", () => {
  assert.equal(fiscalChainDeliveryDecision(0, 1), "next");
  assert.equal(fiscalChainDeliveryDecision(7, 8), "next");
  assert.equal(fiscalChainDeliveryDecision(7, 9), "wait_for_predecessor");
  assert.equal(fiscalChainDeliveryDecision(7, 7), "already_passed");
  assert.equal(fiscalChainDeliveryDecision(7, 6), "already_passed");
});

test("rechaza cursores o secuencias corruptos", () => {
  assert.throws(() => fiscalChainDeliveryDecision(-1, 1), /FISCAL_FLOW_SEQUENCE_CORRUPT/);
  assert.throws(() => fiscalChainDeliveryDecision(0, 0), /FISCAL_OUTBOX_CHAIN_SEQUENCE_CORRUPT/);
  assert.throws(() => fiscalChainDeliveryDecision(0, 1.5), /FISCAL_OUTBOX_CHAIN_SEQUENCE_CORRUPT/);
});
