import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js");

function toHeaderMap(headers) {
  return new Map(headers.map(({ key, value }) => [key.toLowerCase(), value]));
}

function source(path) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("Next.js framework fingerprint header is disabled", () => {
  assert.equal(nextConfig.poweredByHeader, false);
});

test("all Hostly routes receive conservative production security headers", async () => {
  const rules = await nextConfig.headers();
  const globalRule = rules.find((rule) => rule.source === "/:path*");

  assert.ok(globalRule, "Expected a global /:path* header rule");
  const headers = toHeaderMap(globalRule.headers);

  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(
    headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.equal(
    headers.get("cross-origin-opener-policy"),
    "same-origin-allow-popups",
  );
  assert.equal(headers.get("x-dns-prefetch-control"), "off");

  const permissions = headers.get("permissions-policy") ?? "";
  assert.match(permissions, /geolocation=\(self\)/);
  assert.match(permissions, /microphone=\(self\)/);
  assert.doesNotMatch(permissions, /microphone=\(\)/);
  assert.match(permissions, /usb=\(\)/);
  assert.match(permissions, /browsing-topics=\(\)/);

  // Hostly can legitimately use camera and same-origin microphone input for
  // operational workflows, while cross-origin microphone access stays blocked.
  assert.doesNotMatch(permissions, /camera=\(\)/);

  const csp = headers.get("content-security-policy-report-only") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-src 'self'/);
  assert.doesNotMatch(csp, /default-src \*/);
});

test("Hostly does not opt every route into cross-origin API access", async () => {
  const rules = await nextConfig.headers();

  for (const rule of rules) {
    const headers = toHeaderMap(rule.headers);
    const allowOrigin = headers.get("access-control-allow-origin");

    assert.notEqual(
      allowOrigin,
      "*",
      `Unexpected global CORS wildcard on ${rule.source}`,
    );
  }
});

test("Firebase App Check rollout remains explicit and fail-safe", () => {
  const client = source("lib/firebase/client.ts");
  const verifier = source("lib/server/security/app-check.ts");
  const authGate = source("lib/server/auth/require-authenticated-restaurant.ts");
  const envExample = source(".env.example");

  assert.match(client, /ReCaptchaEnterpriseProvider/);
  assert.match(client, /NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY/);
  assert.match(client, /isTokenAutoRefreshEnabled:\s*true/);
  assert.match(verifier, /"off"\s*\|\s*"monitor"\s*\|\s*"enforce"/);
  assert.match(verifier, /x-firebase-appcheck/i);
  assert.match(verifier, /getAppCheck\(\)\.verifyToken\(token\)/);
  assert.match(authGate, /verifyHostlyAppCheck\(req\)/);
  assert.match(envExample, /HOSTLY_APP_CHECK_MODE=off/);
  assert.match(envExample, /NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY/);
});
