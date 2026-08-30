import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type VercelConfig = {
  regions?: string[];
  functionFailoverRegions?: string[];
};

test("keeps Vercel Functions close to Firebase eur3", () => {
  const config = JSON.parse(
    readFileSync("vercel.json", "utf8"),
  ) as VercelConfig;

  assert.deepEqual(config.regions, ["cdg1"]);
  assert.deepEqual(config.functionFailoverRegions, ["fra1"]);
});
