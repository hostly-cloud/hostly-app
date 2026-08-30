import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { operationZoneFilterId } from "../../lib/operacion/operation-zone-filter";

describe("operation zone filter", () => {
  test("agrupa ids distintos que comparten el mismo nombre visible", () => {
    assert.equal(operationZoneFilterId(" Interior "), operationZoneFilterId("interior"));
  });

  test("mantiene separadas las zonas con nombres distintos", () => {
    assert.notEqual(operationZoneFilterId("Interior"), operationZoneFilterId("Terraza"));
  });
});
