import assert from "node:assert/strict";
import test from "node:test";
import {
  createSurfaceObject,
  getSurfaceShapeStyle,
  normalizeSurfaceObjects,
} from "@/lib/sala-editor/surface/surface-object";

test("legacy surfaces normalize to rectangle", () => {
  const [surface] = normalizeSurfaceObjects([
    {
      id: "s1",
      espacioId: "space-1",
      material: "water",
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      visible: true,
      locked: false,
    },
  ], new Set(["space-1"]));
  assert.equal(surface.shape, "rectangle");
});

test("new surfaces persist ellipse and organic shapes", () => {
  const ellipse = createSurfaceObject({
    espacioId: "space-1",
    material: "water",
    shape: "ellipse",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    visible: true,
    locked: false,
  });
  assert.equal(ellipse.shape, "ellipse");
  assert.equal(getSurfaceShapeStyle(ellipse.shape).borderRadius, "50%");
  assert.match(getSurfaceShapeStyle("organic").clipPath ?? "", /^polygon\(/);
});
