import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildDraftPersistRequestKey,
  nextDraftPersistRevision,
} from "@/lib/tpv/draft-persist-request-key";

describe("draft persist request idempotency", () => {
  test("el reintento de la misma revisión conserva la clave", () => {
    const params = {
      tableId: "mesa-11",
      orderId: "order-1",
      sessionId: "session-a",
      revision: 7,
    };

    assert.equal(
      buildDraftPersistRequestKey(params),
      buildDraftPersistRequestKey(params),
    );
  });

  test("volver a una cantidad anterior usa otra clave si es otra revisión", () => {
    const firstQuantityOne = buildDraftPersistRequestKey({
      tableId: "mesa-11",
      orderId: "order-1",
      sessionId: "session-a",
      revision: 1,
    });
    const quantityThree = buildDraftPersistRequestKey({
      tableId: "mesa-11",
      orderId: "order-1",
      sessionId: "session-a",
      revision: 2,
    });
    const secondQuantityOne = buildDraftPersistRequestKey({
      tableId: "mesa-11",
      orderId: "order-1",
      sessionId: "session-a",
      revision: 3,
    });

    assert.notEqual(firstQuantityOne, quantityThree);
    assert.notEqual(firstQuantityOne, secondQuantityOne);
    assert.notEqual(quantityThree, secondQuantityOne);
  });

  test("la revisión es monotónica y se recupera de valores inválidos", () => {
    assert.equal(nextDraftPersistRevision(undefined), 1);
    assert.equal(nextDraftPersistRevision(1), 2);
    assert.equal(nextDraftPersistRevision(Number.NaN), 1);
  });
});
