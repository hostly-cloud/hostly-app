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

  it("mantiene el nodo del viewport en una referencia local", () => {
    assert.match(source, /ref=\{rootRef\}/);
    assert.doesNotMatch(source, /mapRef\.current/);
  });

  it("programa el autoencuadre sin actualizar estado de forma síncrona en el efecto", () => {
    assert.match(
      source,
      /window\.requestAnimationFrame\(applyFitToViewport\)/,
    );
    assert.match(source, /window\.cancelAnimationFrame\(frameId\)/);
  });
});
