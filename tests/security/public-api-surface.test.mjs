import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "app", "api");

const EXPLICIT_ROUTE_CLASSIFICATION = new Map([
  ["app/api/health/route.ts", "public-health"],
  ["app/api/marketing/leads/route.ts", "public-rate-limited"],
  ["app/api/employees/clocking/qr/route.ts", "public-tokenized"],
  ["app/api/operations/notifications/service-worker/route.ts", "public-static-firebase-config"],
  ["app/api/tpv/orders/sync-items/route.ts", "retired-410"],
  ["app/api/debug/firebase/route.ts", "production-disabled"],
  ["app/api/queues/catalog-image-bulk/route.ts", "signed-callback"],
  ["app/api/ai/manager-analytics/route.ts", "authenticated-ai-tenant"],
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
    if (entry.isDirectory()) routes.push(...walkRoutes(path));
    else if (/^route\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) routes.push(path);
  }
  return routes.sort();
}

function repoPath(path) {
  return relative(ROOT, path).split(sep).join("/");
}

function resolveSource(base) {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveAuditableImport(specifier, currentFile) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolveSource(resolve(dirname(currentFile), specifier));
  }
  if (specifier.startsWith("@/lib/server/")) {
    return resolveSource(join(ROOT, specifier.slice(2)));
  }
  return null;
}

function importedAuditableFiles(source, currentFile) {
  const files = [];
  const pattern = /from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const resolved = resolveAuditableImport(match[1], currentFile);
    if (resolved) files.push(resolved);
  }
  return files;
}

function hasSecuritySignal(file, visited = new Set()) {
  if (visited.has(file)) return false;
  visited.add(file);
  const source = readFileSync(file, "utf8");
  if (SECURITY_SIGNALS.some((pattern) => pattern.test(source))) return true;
  return importedAuditableFiles(source, file).some((dependency) =>
    hasSecuritySignal(dependency, visited),
  );
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
    if (hasSecuritySignal(file)) continue;
    unclassified.push(path);
  }

  assert.deepEqual(
    unclassified,
    [],
    `API routes missing an auth/signature signal or explicit classification:\n${unclassified.join("\n")}`,
  );
});

test("the deliberately anonymous surface stays small and explicit", () => {
  const anonymousRoutes = [...EXPLICIT_ROUTE_CLASSIFICATION.entries()]
    .filter(([, classification]) =>
      classification.startsWith("public-") || classification === "retired-410",
    )
    .map(([path]) => path)
    .sort();

  assert.deepEqual(anonymousRoutes, [
    "app/api/employees/clocking/qr/route.ts",
    "app/api/health/route.ts",
    "app/api/marketing/leads/route.ts",
    "app/api/operations/notifications/service-worker/route.ts",
    "app/api/tpv/orders/sync-items/route.ts",
  ]);
});
