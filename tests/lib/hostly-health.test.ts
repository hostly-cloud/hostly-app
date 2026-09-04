import assert from "node:assert/strict";
import test from "node:test";

import { buildHostlyHealthSnapshot } from "@/lib/observability/hostly-health";

test("health snapshot exposes only minimal public metadata", () => {
  const snapshot = buildHostlyHealthSnapshot({
    env: {
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "abcdef1234567890fedcba",
      VERCEL_DEPLOYMENT_ID: "dpl_should_not_leak",
      VERCEL_REGION: "cdg1",
    },
    now: new Date("2026-09-04T14:00:00.000Z"),
  });

  assert.deepEqual(snapshot, {
    status: "ok",
    service: "hostly-app",
    environment: "production",
    release: {
      commit: "abcdef123456",
    },
    timestamp: "2026-09-04T14:00:00.000Z",
  });
  assert.equal("runtime" in snapshot, false);
  assert.equal("deploymentId" in snapshot.release, false);
  assert.equal("region" in snapshot.release, false);
});

test("health snapshot does not invent unavailable release metadata", () => {
  const snapshot = buildHostlyHealthSnapshot({
    env: { NODE_ENV: "development" },
    now: new Date("2026-09-04T14:00:00.000Z"),
  });

  assert.equal(snapshot.environment, "development");
  assert.equal(snapshot.release.commit, null);
});

test("health snapshot trims blank environment and release metadata", () => {
  const snapshot = buildHostlyHealthSnapshot({
    env: {
      VERCEL_ENV: "   ",
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "   ",
    },
    now: new Date("2026-09-04T14:00:00.000Z"),
  });

  assert.equal(snapshot.environment, "production");
  assert.equal(snapshot.release.commit, null);
});
