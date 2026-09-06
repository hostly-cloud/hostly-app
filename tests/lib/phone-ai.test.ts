import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  confirmedReservationSnapshot,
  mergeReservationDraft,
  reservationDraftComplete,
  type PhoneAiTurn,
} from "../../lib/phone-ai/intent";
import {
  normalizePhoneNumber,
  validateTwilioSignature,
} from "../../lib/phone-ai/twilio";
import {
  phoneAiNumberMappingId,
  phoneAiReservationId,
} from "../../lib/server/phone-ai/phone-ai-center";

const priorDraft = {
  customerName: "Ana",
  date: "2026-09-10",
  time: "21:00",
  partySize: 4,
  notes: "Terraza si es posible",
};

function reservationTurn(reservation: NonNullable<PhoneAiTurn["reservation"]>): PhoneAiTurn {
  return {
    intent: "reservation",
    reply: "Confirmado",
    reservation,
  };
}

test("normalizes phone numbers conservatively", () => {
  assert.equal(normalizePhoneNumber("+34 600 123 456"), "+34600123456");
  assert.equal(normalizePhoneNumber("123"), "");
  assert.equal(normalizePhoneNumber("+34 (600) 123-456"), "+34600123456");
});

test("validates Twilio form signatures and rejects tampering", () => {
  const authToken = "test_auth_token";
  const url = "https://hostlyapp.app/api/webhooks/twilio/phone-ai";
  const params = new URLSearchParams({ CallSid: "CA123", From: "+34600123456", To: "+34900111222" });
  const payload = `${url}CallSidCA123From+34600123456To+34900111222`;
  const signature = createHmac("sha1", authToken).update(payload).digest("base64");

  assert.equal(validateTwilioSignature({ authToken, url, params, signature }), true);
  params.set("To", "+34900999999");
  assert.equal(validateTwilioSignature({ authToken, url, params, signature }), false);
});

test("complete data plus confirmed=true in the first turn does not authorize creation", () => {
  const firstTurn = reservationTurn({ ...priorDraft, confirmed: true });
  assert.equal(reservationDraftComplete(firstTurn.reservation), true);
  assert.equal(confirmedReservationSnapshot(undefined, firstTurn), null);
});

test("a previously complete draft plus explicit confirmation authorizes creation", () => {
  const confirmationTurn = reservationTurn({ confirmed: true });
  assert.equal(reservationDraftComplete(priorDraft), true);
  assert.deepEqual(confirmedReservationSnapshot(priorDraft, confirmationTurn), priorDraft);
});

test("the confirmation turn cannot silently modify the previously stable reservation", () => {
  const changedConfirmation = reservationTurn({
    customerName: "Otra persona",
    date: "2026-09-11",
    time: "22:30",
    partySize: 8,
    notes: "Cambio silencioso",
    confirmed: true,
  });
  const stable = confirmedReservationSnapshot(priorDraft, changedConfirmation);
  assert.deepEqual(stable, priorDraft);
  assert.notEqual(stable?.date, changedConfirmation.reservation?.date);
  assert.notEqual(stable?.partySize, changedConfirmation.reservation?.partySize);
});

test("merge still accumulates non-confirmation reservation details", () => {
  const merged = mergeReservationDraft({ customerName: "Ana" }, { date: "2026-09-10", time: "21:00", partySize: 4 });
  assert.equal(reservationDraftComplete(merged), true);
});

test("verified phone mapping ids are deterministic and do not expose the number", () => {
  const id = phoneAiNumberMappingId("+34900111222");
  assert.equal(id.length, 64);
  assert.equal(id, phoneAiNumberMappingId("+34900111222"));
  assert.equal(id.includes("900111222"), false);
});

test("phone AI reservation ids are deterministic per tenant and call", () => {
  const id = phoneAiReservationId("restaurant-a", "CA123");
  assert.equal(id, phoneAiReservationId("restaurant-a", "CA123"));
  assert.notEqual(id, phoneAiReservationId("restaurant-b", "CA123"));
  assert.notEqual(id, phoneAiReservationId("restaurant-a", "CA999"));
  assert.equal(id.startsWith("phone_"), true);
  assert.equal(id.includes("restaurant-a"), false);
  assert.equal(id.includes("CA123"), false);
});
