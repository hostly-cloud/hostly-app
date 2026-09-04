import assert from "node:assert/strict";
import test from "node:test";
import type { Reservation } from "../../lib/firestore/reservations";
import {
  buildReservationCustomerHistory,
  reservationCustomerKey,
} from "../../lib/reservas/reservation-customer-history";

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    restaurantId: "rest-1",
    customerName: "Ana Pérez",
    customerPhone: "+34 600 123 123",
    date: "2026-09-01",
    time: "20:00",
    partySize: 4,
    status: "completed",
    ...overrides,
  };
}

test("prioriza teléfono y normaliza identidad del cliente", () => {
  assert.equal(
    reservationCustomerKey(reservation()),
    "phone:+34600123123",
  );
  assert.equal(
    reservationCustomerKey(
      reservation({ customerPhone: "", customerEmail: "ANA@EXAMPLE.COM" }),
    ),
    "email:ana@example.com",
  );
});

test("agrupa historial, no-shows y próxima reserva", () => {
  const history = buildReservationCustomerHistory(
    [
      reservation({ id: "done", date: "2026-08-20", status: "completed" }),
      reservation({ id: "noshow", date: "2026-09-01", status: "no_show" }),
      reservation({ id: "future", date: "2026-09-10", status: "booked", allergies: "Gluten" }),
    ],
    "2026-09-04",
  );

  assert.equal(history.length, 1);
  assert.equal(history[0]?.reservations, 3);
  assert.equal(history[0]?.completed, 1);
  assert.equal(history[0]?.noShows, 1);
  assert.equal(history[0]?.future, 1);
  assert.equal(history[0]?.nextReservation?.id, "future");
  assert.equal(history[0]?.lastReservation?.id, "noshow");
  assert.equal(history[0]?.allergies, "Gluten");
});

test("ordena primero clientes con no-shows", () => {
  const rows = buildReservationCustomerHistory(
    [
      reservation({ id: "clean", customerPhone: "600000001", customerName: "Berta", status: "completed" }),
      reservation({ id: "risk", customerPhone: "600000002", customerName: "Carlos", status: "no_show" }),
    ],
    "2026-09-04",
  );
  assert.equal(rows[0]?.displayName, "Carlos");
});
