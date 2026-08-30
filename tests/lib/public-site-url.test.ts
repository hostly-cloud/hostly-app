import assert from "node:assert/strict";
import test from "node:test";
import {
  getHostlyPublicSiteUrl,
  HOSTLY_PUBLIC_SITE_URL,
} from "../../lib/hostly/public-site-url";

test("uses the canonical Hostly production origin by default", () => {
  assert.equal(getHostlyPublicSiteUrl(undefined).origin, HOSTLY_PUBLIC_SITE_URL);
});

test("honours a valid environment-specific origin", () => {
  assert.equal(
    getHostlyPublicSiteUrl("https://preview.example.test/path").href,
    "https://preview.example.test/path",
  );
});

test("falls back safely when the configured URL is invalid", () => {
  assert.equal(getHostlyPublicSiteUrl("not a url").origin, HOSTLY_PUBLIC_SITE_URL);
});
