import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync("lib/security/app-check-client.ts", "utf8");
const installer = fs.readFileSync(
  "components/security/app-check-fetch-installer.tsx",
  "utf8",
);
const providers = fs.readFileSync("components/providers.tsx", "utf8");

test("App Check transport is restricted to same-origin Hostly APIs", () => {
  assert.match(client, /url\.origin === origin/);
  assert.match(client, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(client, /X-Firebase-AppCheck/);
  assert.match(client, /if \(!token\)/);
});

test("browser installer obtains App Check tokens and is HMR safe", () => {
  assert.match(installer, /getHostlyAppCheckToken/);
  assert.match(installer, /__hostlyAppCheckFetchInstalled/);
  assert.match(installer, /window\.location\.origin/);
});

test("root providers install the App Check transport once", () => {
  assert.match(providers, /AppCheckFetchInstaller/);
  assert.match(providers, /<AppCheckFetchInstaller \/>/);
});
