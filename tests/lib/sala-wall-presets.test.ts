import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWallPresetSegments,
  constrainWallPresetEnd,
} from "@/lib/sala-editor/walls/wall-presets";

test("horizontal and vertical wall presets constrain the second point", () => {
  assert.deepEqual(constrainWallPresetEnd({ x: 10, y: 20 }, { x: 110, y: 90 }, "horizontal"), { x: 110, y: 20 });
  assert.deepEqual(constrainWallPresetEnd({ x: 10, y: 20 }, { x: 110, y: 90 }, "vertical"), { x: 10, y: 90 });
});

test("corner and U wall presets generate connected segments", () => {
  const corner = buildWallPresetSegments({
    espacioId: "space-1",
    start: { x: 0, y: 0 },
    end: { x: 120, y: 80 },
    preset: "corner",
    groupId: "corner",
  });
  assert.equal(corner.length, 2);
  assert.deepEqual({ x: corner[0].x2, y: corner[0].y2 }, { x: corner[1].x1, y: corner[1].y1 });
  assert.equal(corner[0].metadata?.presetGroupId, "corner");

  const u = buildWallPresetSegments({
    espacioId: "space-1",
    start: { x: 0, y: 0 },
    end: { x: 240, y: 0 },
    preset: "u-shape",
    groupId: "u",
  });
  assert.equal(u.length, 3);
  assert.deepEqual({ x: u[0].x2, y: u[0].y2 }, { x: u[1].x1, y: u[1].y1 });
  assert.deepEqual({ x: u[1].x2, y: u[1].y2 }, { x: u[2].x1, y: u[2].y1 });
});

test("arc wall preset is approximated with a connected polyline and preserves endpoints", () => {
  const arc = buildWallPresetSegments({
    espacioId: "space-1",
    start: { x: 20, y: 40 },
    end: { x: 420, y: 40 },
    preset: "arc",
    groupId: "arc",
  });
  assert.ok(arc.length >= 6);
  assert.deepEqual({ x: arc[0].x1, y: arc[0].y1 }, { x: 20, y: 40 });
  assert.deepEqual({ x: arc.at(-1)?.x2, y: arc.at(-1)?.y2 }, { x: 420, y: 40 });
  for (let index = 1; index < arc.length; index += 1) {
    assert.equal(arc[index - 1].x2, arc[index].x1);
    assert.equal(arc[index - 1].y2, arc[index].y1);
  }
});
