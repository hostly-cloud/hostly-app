import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API_ROOT = join(process.cwd(), "app", "api");

const EXPLICIT_ROUTE_CLASSIFICATION = new Map([
  ["app/api/health/route.ts", "public-health"],
  ["app/api/marketing/leads/route.ts", "public-rate-limited"],
  ["app/api/debug/firebase/route.ts", "production-disabled"],
  ["app/api/queues/catalog-image-bulk/route.ts", "signed-callback"],
]);

const SECURITY_SIGNALS = [
  /requireAuthenticated/i,
  /requireLegacyRestaurantApi/i,
  /verifyIdToken/i,
  /authorization/i,
  /bearer\s/i,
  /verify.*signature/i,
  /signature.*verify/i,
  /verify.*callback/i,
  /callback.*verify/i,
  /queue/i,
  /cron.*secret/i,
  /secret.*cron/i,
  /NODE_ENV\s*===?\s*["']production["']/,
];

function walkRoutes(dir) {
  const routes = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      routes.push(...walkRoutes(path));
      continue;
    }
    if (/^route\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      routes.push(path);
    }
  }
  return routes.sort();
}

function repoPath(path) {
  return relative(process.cwd(), path).split(sep).join("/");
}

test("API routes never enable wildcard cross-origin access", () => {
  for (const file of walkRoutes(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /Access-Control-Allow-Origin["'\s,:=]+["']?\*/i,
      `Wildcard CORS is not allowed in ${repoPath(file)}`,
    );
  }
});

test("every API route is authenticated/signed or explicitly classified", () => {
  const unclassified = [];

  for (const file of walkRoutes(API_ROOT)) {
    const path = repoPath(file);
    if (EXPLICIT_ROUTE_CLASSIFICATION.has(path)) continue;

    const source = readFileSync(file, "utf8");
    if (SECURITY_SIGNALS.some((pattern) => pattern.test(source))) continue;

    // Thin route adapters are acceptable only when they delegate to a handler;
    // the handler remains part of the route's security contract and is audited
    // separately by focused tests/review.
    if (/from\s+["'][^"']*handler["']/.test(source)) continue;

    unclassified.push(path);
  }

  assert.deepEqual(
    unclassified,
    [],
    `API routes missing an auth/signature signal or explicit public classification:\n${unclassified.join("\n")}`,
  );
});

test("the deliberately public surface stays small and explicit", () => {
  const publicRoutes = [...EXPLICIT_ROUTE_CLASSIFICATION.entries()]
    .filter(([, classification]) => classification.startsWith("public-"))
    .map(([path]) => path)
    .sort();

  assert.deepEqual(publicRoutes, [
    "app/api/health/route.ts",
    "app/api/marketing/leads/route.ts",
  ]);
});
