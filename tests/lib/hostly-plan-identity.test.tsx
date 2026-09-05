import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { HostlyPlanIdentity } from "@/components/ui/hostly/HostlyPlanIdentity";

test("renders a distinct accessible identity for every Hostly plan", () => {
  const plans = [
    ["basic", "Básico"],
    ["pro", "Pro"],
    ["ultra", "Ultra"],
  ] as const;

  for (const [plan, label] of plans) {
    const markup = renderToStaticMarkup(
      <HostlyPlanIdentity plan={plan} label={label} />,
    );

    assert.match(markup, new RegExp(`data-plan="${plan}"`));
    assert.match(markup, new RegExp(`aria-label="Hostly ${label}"`));
    assert.match(markup, new RegExp(`>${label}<`));
  }
});

test("supports the compact global-header treatment", () => {
  const markup = renderToStaticMarkup(
    <HostlyPlanIdentity plan="ultra" label="Ultra" compact />,
  );

  assert.match(markup, /hostly-plan-identity--compact/);
  assert.match(markup, /title="Hostly Ultra"/);
});
