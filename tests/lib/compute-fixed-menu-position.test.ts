import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { computeFixedMenuPosition } from "@/lib/map/compute-fixed-menu-position";

const VIEW = { width: 400, height: 700 };
const MENU = { width: 220, height: 148 };
const MARGIN = 8;
const GAP = 8;

describe("computeFixedMenuPosition", () => {
  test("centro: abre debajo", () => {
    const pos = computeFixedMenuPosition({
      anchor: { left: 150, top: 300, width: 80, height: 80 },
      menuSize: MENU,
      viewport: VIEW,
      margin: MARGIN,
      gap: GAP,
    });
    assert.equal(pos.placement, "below");
    assert.equal(pos.top, 300 + 80 + GAP);
    assert.equal(pos.left, 150 + 40 - MENU.width / 2);
  });

  test("flip vertical cuando no cabe abajo", () => {
    const pos = computeFixedMenuPosition({
      anchor: { left: 150, top: 620, width: 80, height: 70 },
      menuSize: MENU,
      viewport: VIEW,
      margin: MARGIN,
      gap: GAP,
    });
    assert.equal(pos.placement, "above");
    assert.ok(pos.top + MENU.height <= VIEW.height - MARGIN + 0.5);
    assert.ok(pos.top >= MARGIN - 0.5);
  });

  test("clamp horizontal esquina inferior derecha", () => {
    const pos = computeFixedMenuPosition({
      anchor: { left: 360, top: 640, width: 40, height: 40 },
      menuSize: MENU,
      viewport: VIEW,
      margin: MARGIN,
      gap: GAP,
    });
    assert.equal(pos.placement, "above");
    assert.ok(pos.left + MENU.width <= VIEW.width - MARGIN + 0.5);
    assert.equal(pos.left, VIEW.width - MARGIN - MENU.width);
  });

  test("clamp horizontal esquina inferior izquierda", () => {
    const pos = computeFixedMenuPosition({
      anchor: { left: 4, top: 640, width: 40, height: 40 },
      menuSize: MENU,
      viewport: VIEW,
      margin: MARGIN,
      gap: GAP,
    });
    assert.equal(pos.placement, "above");
    assert.equal(pos.left, MARGIN);
    assert.ok(pos.top >= MARGIN - 0.5);
  });

  test("menú mayor que el espacio disponible: clamp al viewport", () => {
    const huge = { width: 500, height: 800 };
    const pos = computeFixedMenuPosition({
      anchor: { left: 100, top: 100, width: 50, height: 50 },
      menuSize: huge,
      viewport: VIEW,
      margin: MARGIN,
      gap: GAP,
    });
    assert.equal(pos.left, MARGIN);
    assert.equal(pos.top, MARGIN);
    // Aunque el menú sea más grande, top/left no salen del margen.
    assert.ok(pos.left >= MARGIN);
    assert.ok(pos.top >= MARGIN);
  });

  test("pegado arriba: abre debajo si hay espacio", () => {
    const pos = computeFixedMenuPosition({
      anchor: { left: 160, top: 10, width: 60, height: 50 },
      menuSize: MENU,
      viewport: VIEW,
      margin: MARGIN,
      gap: GAP,
    });
    assert.equal(pos.placement, "below");
    assert.equal(pos.top, 10 + 50 + GAP);
  });
});
