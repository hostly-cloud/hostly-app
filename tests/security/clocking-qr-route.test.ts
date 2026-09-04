import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../../app/api/employees/clocking/qr/route";

const ENDPOINT = "https://hostlyapp.app/api/employees/clocking/qr";

test("clocking QR rejects missing tokens", async () => {
  const response = await GET(new Request(ENDPOINT));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "INVALID_CLOCKING_QR_TOKEN",
  });
});

test("clocking QR rejects unsafe token characters", async () => {
  const response = await GET(new Request(`${ENDPOINT}?token=${encodeURIComponent("bad token!")}`));
  assert.equal(response.status, 400);
});

test("clocking QR is rendered locally as a no-store SVG", async () => {
  const token = "hostly-security-smoke";
  const response = await GET(new Request(`${ENDPOINT}?token=${token}`));

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^image\/svg\+xml/i);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const body = await response.text();
  assert.match(body, /<svg\b/i);
  assert.doesNotMatch(body, /api\.qrserver\.com/i);
});
