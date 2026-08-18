import assert from "node:assert/strict";
import test from "node:test";
import { computeCanvasFitScale } from "../../lib/sala-editor/canvas/canvas-viewport";
import { computeEditorVisualLayout } from "../../lib/sala-editor/canvas/editor-visual-scale";

const DEFAULT_PLAN = {
  dimensions: { width: 18, height: 12 },
  scale: { pixelsPerUnit: 100 },
};

const VIEWPORTS = [
  { label: "mobile 390x844", width: 390, height: 844 },
  { label: "tablet 768x1024", width: 768, height: 1024 },
  { label: "desktop 1440x900", width: 1440, height: 900 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`el fit inicial mantiene el plano dentro del viewport ${viewport.label}`, () => {
    const layout = computeEditorVisualLayout(DEFAULT_PLAN, viewport);
    const fitScale = computeCanvasFitScale(
      viewport.width,
      viewport.height,
      layout.frameWidth,
      layout.frameHeight,
    );

    assert.ok(layout.frameWidth * fitScale <= viewport.width - 24 + 0.5);
    assert.ok(layout.frameHeight * fitScale <= viewport.height - 24 + 0.5);
    assert.ok(fitScale > 0 && fitScale <= 1);
  });
}

test("el fit inicial aumenta con el ancho disponible sin ampliar por encima de 1", () => {
  const scales = VIEWPORTS.map((viewport) => {
    const layout = computeEditorVisualLayout(DEFAULT_PLAN, viewport);
    return computeCanvasFitScale(
      viewport.width,
      viewport.height,
      layout.frameWidth,
      layout.frameHeight,
    );
  });

  assert.ok(scales[0]! < scales[1]!);
  assert.ok(scales[1]! <= scales[2]!);
  assert.ok(scales.every((scale) => scale <= 1));
});
