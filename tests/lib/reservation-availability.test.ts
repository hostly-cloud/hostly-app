import assert from "node:assert/strict";
import test from "node:test";
import type { Reservation } from "@/lib/firestore/reservations";
import {
  findReservationTableConflict,
  reservationAssignmentLabel,
  reservationTimeToMinutes,
  tableCanSeatParty,
} from "@/lib/reservas/reservation-availability";

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "r1",
    restaurantId: "rest-1",
    customerName: "Ana",
    customerPhone: "",
    date: "2026-09-04",
    time: "20:00",
    partySize: 4,
    durationMinutes: 120,
    status: "booked",
    tableId: "t1",
    ...overrides,
  };
}

test("parses reservation times", () => {
  assert.equal(reservationTimeToMinutes("20:30"), 1230);
  assert.equal(reservationTimeToMinutes("24:00"), null);
});

test("detects overlapping active reservations on the same table", () => {
  const conflict = findReservationTableConflict({
    reservations: [reservation()],
    tableId: "t1",
    date: "2026-09-04",
    time: "21:30",
    durationMinutes: 90,
    turnoverMinutes: 15,
  });
  assert.ok(conflict);
  assert.equal(conflict?.reservation.id, "r1");
});

test("allows a non-overlapping reservation", () => {
  const conflict = findReservationTableConflict({
    reservations: [reservation()],
    tableId: "t1",
    date: "2026-09-04",
    time: "22:15",
    durationMinutes: 60,
    turnoverMinutes: 15,
  });
  assert.equal(conflict, null);
});

test("ignores cancelled rows and the row being edited", () => {
  assert.equal(findReservationTableConflict({
    reservations: [reservation({ status: "cancelled" })],
    tableId: "t1",
    date: "2026-09-04",
    time: "20:15",
    durationMinutes: 120,
  }), null);
  assert.equal(findReservationTableConflict({
    reservations: [reservation()],
    tableId: "t1",
    date: "2026-09-04",
    time: "20:15",
    durationMinutes: 120,
    excludeReservationId: "r1",
  }), null);
});

test("checks table capacity", () => {
  assert.equal(tableCanSeatParty({ seats: 4 }, 5), false);
  assert.equal(tableCanSeatParty({ seats: 4 }, 4), true);
  assert.equal(tableCanSeatParty({ seats: 0 }, 12), true);
});

test("marks booked reservations without table as pending assignment", () => {
  assert.equal(reservationAssignmentLabel(reservation({ tableId: undefined })), "Pendiente de mesa");
  assert.equal(reservationAssignmentLabel(reservation()), null);
});
