import assert from "node:assert/strict";
import test from "node:test";

import { buildHostlyHealthSnapshot } from "@/lib/observability/hostly-health";

test("health snapshot exposes safe release metadata", () => {
  const snapshot = buildHostlyHealthSnapshot({
    env: {
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "abc123",
      VERCEL_DEPLOYMENT_ID: "dpl_test",
      VERCEL_REGION: "cdg1",
    },
    now: new Date("2026-09-04T14:00:00.000Z"),
    uptimeSeconds: 42,
    nodeVersion: "v24.0.0",
  });

  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.service, "hostly-app");
  assert.equal(snapshot.environment, "production");
  assert.deepEqual(snapshot.release, {
    commit: "abc123",
    deploymentId: "dpl_test",
    region: "cdg1",
  });
  assert.deepEqual(snapshot.runtime, {
    node: "v24.0.0",
    uptimeSeconds: 42,
  });
  assert.equal(snapshot.timestamp, "2026-09-04T14:00:00.000Z");
});

test("health snapshot does not invent unavailable deployment metadata", () => {
  const snapshot = buildHostlyHealthSnapshot({
    env: { NODE_ENV: "development" },
    now: new Date("2026-09-04T14:00:00.000Z"),
    uptimeSeconds: 0,
    nodeVersion: "v24.0.0",
  });

  assert.equal(snapshot.environment, "development");
  assert.equal(snapshot.release.commit, null);
  assert.equal(snapshot.release.deploymentId, null);
  assert.equal(snapshot.release.region, null);
});

test("health snapshot trims blank environment metadata", () => {
  const snapshot = buildHostlyHealthSnapshot({
    env: {
      VERCEL_ENV: "   ",
      NODE_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "   ",
    },
    now: new Date("2026-09-04T14:00:00.000Z"),
    uptimeSeconds: 1,
    nodeVersion: "v24.0.0",
  });

  assert.equal(snapshot.environment, "production");
  assert.equal(snapshot.release.commit, null);
});
