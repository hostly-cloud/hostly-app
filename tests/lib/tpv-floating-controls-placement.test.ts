import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

describe("TPV floating controls placement", () => {
  const voiceSource = readFileSync(
    "app/dashboard/operacion/tpv/_components/tpv-voice-command-button.tsx",
    "utf8",
  );
  const customerSource = readFileSync(
    "app/dashboard/operacion/tpv/_components/tpv-customer-control.tsx",
    "utf8",
  );

  test("keeps the voice trigger away from the payment total", () => {
    const triggerDock = voiceSource.match(
      /<div className="([^"]+)">\s*\{listening \?/,
    )?.[1];

    assert.ok(triggerDock);
    assert.match(triggerDock, /right-4/);
    assert.doesNotMatch(triggerDock, /left-/);
    assert.match(voiceSource, /size-16 min-h-16 min-w-16/);
  });

  test("stacks the customer control above the voice trigger on desktop", () => {
    assert.match(customerSource, /right-4 bottom-\[96px\]/);
  });
});
