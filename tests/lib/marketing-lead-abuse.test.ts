import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETING_LEAD_MAX_BODY_BYTES,
  MarketingLeadBodyTooLargeError,
  evaluateMarketingLeadRateLimit,
  extractMarketingLeadClientIp,
  fingerprintMarketingLeadSubmission,
  hashMarketingLeadClientKey,
  readMarketingLeadBodyWithLimit,
  resolveMarketingLeadAbuseSecret,
} from "../../lib/security/marketing-lead-abuse";

test("rate limiter allows the first three requests and blocks the fourth burst", () => {
  const now = 1_000_000;
  let state = undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const decision = evaluateMarketingLeadRateLimit(state, now + attempt * 100);
    assert.equal(decision.allowed, true);
    state = decision.nextState;
  }

  const blocked = evaluateMarketingLeadRateLimit(state, now + 500);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("burst window resets without losing the sustained counter", () => {
  const first = evaluateMarketingLeadRateLimit(undefined, 10_000);
  const second = evaluateMarketingLeadRateLimit(first.nextState, 10_100);
  const third = evaluateMarketingLeadRateLimit(second.nextState, 10_200);

  const afterBurstWindow = evaluateMarketingLeadRateLimit(
    third.nextState,
    10_000 + 60_001,
  );

  assert.equal(afterBurstWindow.allowed, true);
  assert.equal(afterBurstWindow.nextState.burstCount, 1);
  assert.equal(afterBurstWindow.nextState.sustainedCount, 4);
});

test("sustained limiter eventually blocks repeated bursts", () => {
  let state = undefined;
  const base = 100_000;

  for (let index = 0; index < 10; index += 1) {
    const minute = Math.floor(index / 2);
    const decision = evaluateMarketingLeadRateLimit(
      state,
      base + minute * 61_000 + (index % 2) * 100,
    );
    assert.equal(decision.allowed, true);
    state = decision.nextState;
  }

  const blocked = evaluateMarketingLeadRateLimit(state, base + 6 * 61_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("client IP uses the first trusted forwarded address", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    "x-real-ip": "198.51.100.2",
  });
  assert.equal(extractMarketingLeadClientIp(headers), "203.0.113.10");
});

test("client key is deterministic and does not expose the raw IP", () => {
  const secret = "test-secret";
  const first = hashMarketingLeadClientKey("203.0.113.10", secret);
  const second = hashMarketingLeadClientKey("203.0.113.10", secret);

  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.doesNotMatch(first, /203\.0\.113\.10/);
});

test("abuse secret prefers explicit configuration and has a stable admin fallback", () => {
  assert.equal(
    resolveMarketingLeadAbuseSecret({
      HOSTLY_MARKETING_RATE_LIMIT_SECRET: " explicit-secret ",
    }),
    "explicit-secret",
  );

  const fallbackA = resolveMarketingLeadAbuseSecret({
    FIREBASE_PROJECT_ID: "hostly-test",
    FIREBASE_PRIVATE_KEY: "private-key",
  });
  const fallbackB = resolveMarketingLeadAbuseSecret({
    FIREBASE_PROJECT_ID: "hostly-test",
    FIREBASE_PRIVATE_KEY: "private-key",
  });

  assert.equal(fallbackA, fallbackB);
  assert.equal(fallbackA?.length, 64);
  assert.equal(resolveMarketingLeadAbuseSecret({}), null);
});

test("submission fingerprint changes when meaningful lead data changes", () => {
  const base = {
    name: "Ana",
    email: "ana@example.com",
    business: "Bistro",
    city: "Madrid",
    businessType: "restaurant",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "launch",
    utmContent: "a",
    utmTerm: "tpv",
  };

  const fingerprint = fingerprintMarketingLeadSubmission(base);
  assert.equal(fingerprintMarketingLeadSubmission(base), fingerprint);
  assert.notEqual(
    fingerprintMarketingLeadSubmission({ ...base, business: "Bistro 2" }),
    fingerprint,
  );
});

test("request body reader accepts normal JSON and rejects oversized payloads", async () => {
  const normal = new Request("https://hostlyapp.app/api/marketing/leads", {
    method: "POST",
    body: JSON.stringify({ name: "Ana" }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(await readMarketingLeadBodyWithLimit(normal), '{"name":"Ana"}');

  const oversized = new Request("https://hostlyapp.app/api/marketing/leads", {
    method: "POST",
    body: "x".repeat(MARKETING_LEAD_MAX_BODY_BYTES + 1),
  });

  await assert.rejects(
    () => readMarketingLeadBodyWithLimit(oversized),
    MarketingLeadBodyTooLargeError,
  );
});
