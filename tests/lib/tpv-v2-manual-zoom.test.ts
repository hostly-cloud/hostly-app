import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("TPV V2 manual zoom lifecycle", () => {
  const source = readFileSync(
    "components/map/tpv-v2-readonly-viewport.tsx",
    "utf8",
  );
  const callbackStart = source.indexOf("const applyFitToViewport = useCallback");
  const callbackEnd = source.indexOf("const applyNaturalZoomCentered", callbackStart);
  const applyFitCallback = source.slice(callbackStart, callbackEnd);

  it("no recrea el autoajuste por identidades nuevas de elementos o zonas", () => {
    assert.ok(callbackStart >= 0 && callbackEnd > callbackStart);
    assert.doesNotMatch(applyFitCallback, /props\.elements/);
    assert.doesNotMatch(applyFitCallback, /props\.zones/);
    assert.doesNotMatch(applyFitCallback, /viewportFitElements/);
    assert.doesNotMatch(applyFitCallback, /viewportFitZones/);
    assert.match(applyFitCallback, /fallbackFitMinX/);
    assert.match(applyFitCallback, /fallbackFitCenterY/);
  });
});
