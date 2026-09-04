import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionReservationStatus,
  findReservationTableConflict,
  getReservationTableEligibility,
  reservationAttention,
  suggestReservationTables,
  type OperationalReservation,
} from "../../lib/reservas/reservation-operations";

const baseReservation: OperationalReservation = {
  id: "r1",
  restaurantId: "rest-1",
  customerName: "Ana",
  customerPhone: "",
  date: "2026-09-04",
  time: "20:00",
  partySize: 4,
  status: "booked",
  durationMinutes: 120,
  tableId: "t1",
};

test("detecta solapamientos reales y permite reservas consecutivas", () => {
  assert.equal(
    findReservationTableConflict({
      reservations: [baseReservation],
      tableId: "t1",
      date: "2026-09-04",
      time: "21:00",
      durationMinutes: 90,
    })?.id,
    "r1",
  );
  assert.equal(
    findReservationTableConflict({
      reservations: [baseReservation],
      tableId: "t1",
      date: "2026-09-04",
      time: "22:00",
      durationMinutes: 90,
    }),
    null,
  );
});

test("ignora reservas finalizadas, canceladas y la reserva que se está editando", () => {
  for (const status of ["completed", "cancelled", "no_show"] as const) {
    assert.equal(
      findReservationTableConflict({
        reservations: [{ ...baseReservation, status }],
        tableId: "t1",
        date: "2026-09-04",
        time: "20:30",
      }),
      null,
    );
  }
  assert.equal(
    findReservationTableConflict({
      reservations: [baseReservation],
      tableId: "t1",
      date: "2026-09-04",
      time: "20:30",
      excludeReservationId: "r1",
    }),
    null,
  );
});

test("filtra por capacidad y ordena sugerencias por ajuste de plazas", () => {
  const suggestions = suggestReservationTables({
    tables: [
      { id: "t1", name: "Mesa 1", seats: 4, type: "table", isActive: true },
      { id: "t2", name: "Mesa 2", seats: 6, type: "table", isActive: true },
      { id: "t3", name: "Mesa 3", seats: 2, type: "table", isActive: true },
      { id: "t4", name: "Mesa 4", seats: 4, type: "table", isActive: false },
    ],
    reservations: [baseReservation],
    partySize: 4,
    date: "2026-09-04",
    time: "20:30",
  });
  assert.deepEqual(suggestions.map((item) => item.tableId), ["t2"]);
});

test("explica por qué una mesa no es elegible", () => {
  assert.equal(
    getReservationTableEligibility({
      table: { id: "t1", name: "Mesa 1", seats: 3, type: "table", isActive: true },
      reservations: [],
      partySize: 4,
      date: "2026-09-04",
      time: "20:00",
    }).reason,
    "capacity",
  );
  assert.equal(
    getReservationTableEligibility({
      table: { id: "t1", name: "Mesa 1", seats: 4, type: "table", isActive: true },
      reservations: [baseReservation],
      partySize: 4,
      date: "2026-09-04",
      time: "20:30",
    }).reason,
    "conflict",
  );
});

test("mantiene transiciones operativas coherentes", () => {
  assert.equal(canTransitionReservationStatus("pending", "booked"), true);
  assert.equal(canTransitionReservationStatus("pending", "seated"), false);
  assert.equal(canTransitionReservationStatus("booked", "seated"), true);
  assert.equal(canTransitionReservationStatus("booked", "completed"), false);
  assert.equal(canTransitionReservationStatus("seated", "completed"), true);
  assert.equal(canTransitionReservationStatus("completed", "booked"), false);
});

test("clasifica próximas, retrasadas y mesas próximas a liberarse", () => {
  assert.equal(
    reservationAttention({
      reservation: { ...baseReservation, time: "20:30" },
      todayYmd: "2026-09-04",
      nowMinutes: 20 * 60,
    }),
    "upcoming",
  );
  assert.equal(
    reservationAttention({
      reservation: { ...baseReservation, time: "19:30" },
      todayYmd: "2026-09-04",
      nowMinutes: 20 * 60,
    }),
    "delayed",
  );
  assert.equal(
    reservationAttention({
      reservation: { ...baseReservation, status: "seated", time: "18:30", durationMinutes: 120 },
      todayYmd: "2026-09-04",
      nowMinutes: 20 * 60,
    }),
    "release_soon",
  );
});
