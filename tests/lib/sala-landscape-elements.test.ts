import assert from "node:assert/strict";
import test from "node:test";
import {
  LANDSCAPE_ELEMENT_DEFAULT_SIZE,
  createLandscapeElement,
  normalizeLandscapeElements,
} from "@/lib/sala-editor/landscape/landscape-element";
import { LANDSCAPE_TOOLBOX_ITEMS } from "@/lib/sala-editor/catalog/landscape-toolbox";

const REQUIRED_KINDS = ["tree", "shrub", "hedge", "flowers", "rock", "fountain"] as const;

test("expanded landscape tools are real toolbox items with defaults", () => {
  const toolboxKinds = new Set(LANDSCAPE_TOOLBOX_ITEMS.map((item) => item.kind));
  for (const kind of REQUIRED_KINDS) {
    assert.equal(toolboxKinds.has(kind), true, `${kind} should be selectable`);
    assert.ok(LANDSCAPE_ELEMENT_DEFAULT_SIZE[kind].width > 0);
    assert.ok(LANDSCAPE_ELEMENT_DEFAULT_SIZE[kind].height > 0);
  }
});

test("expanded landscape elements persist through normalization", () => {
  const source = REQUIRED_KINDS.map((kind, index) => createLandscapeElement({
    espacioId: "space-1",
    kind,
    x: index * 20,
    y: index * 10,
    ...LANDSCAPE_ELEMENT_DEFAULT_SIZE[kind],
    locked: false,
    visible: true,
    metadata: {},
  }));
  const normalized = normalizeLandscapeElements(source, new Set(["space-1"]));
  assert.deepEqual(normalized.map((item) => item.kind), [...REQUIRED_KINDS]);
});
