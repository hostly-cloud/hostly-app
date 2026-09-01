import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shiftReservationDay } from "../../lib/reservas/reservation-day";

test("moves between adjacent reservation days", () => {
  assert.equal(shiftReservationDay("2026-09-01", -1), "2026-08-31");
  assert.equal(shiftReservationDay("2026-09-01", 1), "2026-09-02");
});

test("preserves calendar correctness across leap days", () => {
  assert.equal(shiftReservationDay("2024-02-28", 1), "2024-02-29");
  assert.equal(shiftReservationDay("2024-02-29", 1), "2024-03-01");
});

test("does not change invalid reservation dates", () => {
  assert.equal(shiftReservationDay("2026-02-31", 1), "2026-02-31");
  assert.equal(shiftReservationDay("not-a-date", 1), "not-a-date");
});

test("keeps the daily navigation and primary action in one reservation toolbar", () => {
  const viewSource = readFileSync("components/reservas/reservas-view.tsx", "utf8");
  const toolbarSource = readFileSync(
    "components/reservas/reservation-day-toolbar.tsx",
    "utf8",
  );
  const styles = readFileSync("app/dashboard/dashboard-viewport-fit.css", "utf8");

  assert.match(viewSource, /<ReservationDayToolbar/);
  assert.doesNotMatch(viewSource, /!hidden md:!flex md:justify-end/);
  assert.match(toolbarSource, /Anterior/);
  assert.match(toolbarSource, /Hoy/);
  assert.match(toolbarSource, /Siguiente/);
  assert.match(toolbarSource, /Nueva reserva/);
  assert.match(styles, /\.hostly-reservations-day-toolbar/);
});
