import assert from "node:assert/strict";
import test from "node:test";
import type { ActivityLogDocument } from "../../lib/firestore/activity-log";
import {
  activityActorLabel,
  activitySummary,
} from "../../lib/operacion/activity-presentation";

function log(
  patch: Partial<ActivityLogDocument> = {},
): ActivityLogDocument {
  return {
    id: "log-secret-id",
    restaurantId: "restaurant-secret-id",
    type: "order_created",
    entityType: "order",
    entityId: "order-secret-id",
    createdAt: 1,
    ...patch,
  };
}

test("la presentación no usa UID como nombre de actor", () => {
  assert.equal(
    activityActorLabel(log({ actorUserId: "o3SFlHZQjHbwEHaQO04wFmP4OT63" })),
    "Usuario",
  );
  assert.equal(activityActorLabel(log()), "Sistema");
  assert.equal(
    activityActorLabel(log({ actorUserName: "  Ana  ", actorUserId: "uid" })),
    "Ana",
  );
});

test("el resumen nunca cae a identificadores técnicos", () => {
  assert.equal(activitySummary(log()), "Comanda");
  assert.equal(
    activitySummary(
      log({
        metadata: {
          tableId: "table-secret-id",
          secondaryTableId: "secondary-secret-id",
        },
      }),
    ),
    "Comanda",
  );
});

test("el resumen conserva datos útiles y traduce el cobro", () => {
  assert.equal(
    activitySummary(
      log({
        metadata: {
          tableName: "Mesa 4",
          lineCount: 3,
          amount: 12.5,
          paymentMethod: "card",
        },
      }),
    ),
    "Mesa 4 · 3 líneas · 12,50 € · Tarjeta",
  );
});
