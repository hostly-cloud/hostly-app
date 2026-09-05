import assert from "node:assert/strict";
import test from "node:test";
import {
  FiscalQueueMessageError,
  FiscalQueueRetryError,
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
