import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextConfig = require("../../next.config.js");

function toHeaderMap(headers) {
  return new Map(headers.map(({ key, value }) => [key.toLowerCase(), value]));
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
});
