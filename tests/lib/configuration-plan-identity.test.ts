import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

describe("configuration plan identity", () => {
  const source = readFileSync(
    "app/dashboard/configuracion/_components/configuracion-context-selector.tsx",
    "utf8",
  );
  const workbenchSource = readFileSync(
    "app/dashboard/configuracion/_components/config-carta-workbench.tsx",
    "utf8",
  );
  const moduleShellSource = readFileSync("components/module-page-shell.tsx", "utf8");

  test("keeps the active Hostly plan visible throughout configuration", () => {
    assert.match(
      source,
      /import \{ CurrentHostlyPlanIdentity \} from "@\/components\/subscription\/current-hostly-plan-identity"/,
    );
    assert.match(source, /<CurrentHostlyPlanIdentity compact \/>/);
  });

  test("groups the plan identity with the existing language utility", () => {
    assert.match(
      source,
      /<div className="flex shrink-0 items-center gap-\[var\(--hostly-op-gap-sm\)\]">\s*<CurrentHostlyPlanIdentity compact \/>\s*<LanguageSwitcher/,
    );
  });

  test("suppresses the nested module badge when the configuration chrome owns it", () => {
    assert.match(workbenchSource, /hideLanguageSwitcher\s+hidePlanIdentity/);
    assert.match(moduleShellSource, /hidePlanIdentity\?: boolean/);
    assert.match(
      moduleShellSource,
      /!hidePlanIdentity \? \(\s*<CurrentHostlyPlanIdentity/,
    );
  });
});
