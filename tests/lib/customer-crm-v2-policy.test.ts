import assert from "node:assert/strict";
import test from "node:test";
import { availableLoyaltyRewards, customerSegments, daysUntilBirthday, netPaymentAmount } from "../../lib/customers/crm-v2-policy";

test("segmenta clientes operativos sin convertir sugerencias en acciones", () => {
  const segments = customerSegments({ vip: false, completedVisits: 6, noShows: 1, totalSpend: 720, birthday: "1990-09-20", lastVisitDate: "2026-08-30", marketingConsent: "granted" }, new Date("2026-09-04T12:00:00"));
  assert.deepEqual(segments, ["frequent", "no_show", "high_spend", "marketing_opt_in", "birthday_30d"]);
});

test("calcula cumpleaños próximos cruzando cambio de año", () => {
  assert.equal(daysUntilBirthday("1980-01-05", new Date("2026-12-20T12:00:00")), 16);
});

test("premios disponibles descuentan canjes y respetan desactivación", () => {
  assert.equal(availableLoyaltyRewards({ completedVisits: 21, visitGoal: 10, redemptions: 1, enabled: true }), 1);
  assert.equal(availableLoyaltyRewards({ completedVisits: 21, visitGoal: 10, redemptions: 0, enabled: false }), 0);
});

test("devoluciones completas nunca producen gasto negativo", () => {
  assert.equal(netPaymentAmount({ amount: 45, refundAmount: 45, status: "refunded" }), 0);
  assert.equal(netPaymentAmount({ amount: 45, refundAmount: 10, status: "refunded" }), 35);
  assert.equal(netPaymentAmount({ amount: 45, status: "paid" }), 45);
});
