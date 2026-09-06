import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  mergeReservationDraft,
  reservationDraftComplete,
} from "../../lib/phone-ai/intent";
import {
  normalizePhoneNumber,
  validateTwilioSignature,
} from "../../lib/phone-ai/twilio";
import { phoneAiNumberMappingId } from "../../lib/server/phone-ai/phone-ai-center";

test("normalizes phone numbers conservatively", () => {
  assert.equal(normalizePhoneNumber("+34 600 123 456"), "+34600123456");
  assert.equal(normalizePhoneNumber("123"), "");
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

test("reservation confirmation requires a complete prior draft", () => {
  const first = mergeReservationDraft(undefined, {
    customerName: "Ana",
    date: "2026-09-10",
    time: "21:00",
    partySize: 4,
    confirmed: true,
  });
  assert.equal(reservationDraftComplete(first), true);

  const prior = { customerName: "Ana", date: "2026-09-10", time: "21:00", partySize: 4 };
  const confirmation = mergeReservationDraft(prior, { confirmed: true });
  assert.equal(reservationDraftComplete(prior), true);
  assert.equal(confirmation.confirmed, true);
});

test("verified phone mapping ids are deterministic and do not expose the number", () => {
  const id = phoneAiNumberMappingId("+34900111222");
  assert.equal(id.length, 64);
  assert.equal(id, phoneAiNumberMappingId("+34900111222"));
  assert.equal(id.includes("900111222"), false);
});
