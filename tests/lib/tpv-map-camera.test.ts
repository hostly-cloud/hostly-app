import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Table } from "@/lib/firestore/tables";
import {
  buildTpvMapCameraFitKey,
  computeTpvMapCameraFit,
  hasValidTpvPlanSize,
  resolveTpvMapCameraBounds,
} from "@/lib/map/tpv-map-camera";

function table(
  id: string,
  x: number,
  y: number,
  w = 80,
  h = 80,
): Table {
  return {
    id,
    name: id,
    type: "table",
    x,
    y,
    width: w,
    height: h,
    capacity: 4,
    isActive: true,
    restaurantId: "r1",
    status: "free",
    tableShape: "square",
    seats: 4,
  } as unknown as Table;
}

describe("tpv-map-camera", () => {
  test("A. plano completo 1000×700 en viewport 1200×800 con padding", () => {
    const paddingPx = 40;
    const result = computeTpvMapCameraFit({
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx,
      fitZoomMax: 4,
    });
    assert.equal(result.source, "plan");
    const usableW = 1200 - paddingPx;
    const usableH = 800 - paddingPx;
    const expected = Math.min(usableW / 1000, usableH / 700);
    assert.ok(Math.abs(result.camera.scale - expected) < 1e-9);
    assert.equal(result.camera.initializedForPlanId, "sala");
    // Centrado: panX ≈ vw/2 - centerX * scale
    const expectedPanX = 1200 / 2 - 500 * result.camera.scale;
    const expectedPanY = 800 / 2 - 350 * result.camera.scale;
    assert.ok(Math.abs(result.camera.translateX - expectedPanX) < 1e-6);
    assert.ok(Math.abs(result.camera.translateY - expectedPanY) < 1e-6);
  });

  test("B. mesas no influyen (5 / 2 / 1 / agrupadas)", () => {
    const base = {
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
    } as const;
    const five = computeTpvMapCameraFit({
      ...base,
      visibleTablesIgnored: [
        table("A", 10, 10),
        table("B", 200, 10),
        table("C", 400, 10),
        table("D", 600, 10),
        table("E", 800, 10),
      ],
    });
    const two = computeTpvMapCameraFit({
      ...base,
      visibleTablesIgnored: [table("A", 10, 10), table("B", 900, 600)],
    });
    const one = computeTpvMapCameraFit({
      ...base,
      visibleTablesIgnored: [table("A", 500, 350)],
    });
    const grouped = computeTpvMapCameraFit({
      ...base,
      visibleTablesIgnored: [table("A-group", 10, 10)],
    });
    assert.equal(five.camera.scale, two.camera.scale);
    assert.equal(five.camera.scale, one.camera.scale);
    assert.equal(five.camera.scale, grouped.camera.scale);
    assert.equal(five.camera.translateX, two.camera.translateX);
    assert.equal(five.camera.translateY, grouped.camera.translateY);
  });

  test("C. join/split (cambio de lista renderizada) no cambia cámara", () => {
    const before = computeTpvMapCameraFit({
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
      visibleTablesIgnored: [
        table("A", 10, 10),
        table("B", 100, 10),
        table("C", 200, 10),
        table("D", 300, 10),
        table("E", 400, 10),
      ],
    });
    const afterJoin = computeTpvMapCameraFit({
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
      visibleTablesIgnored: [
        table("A-group", 10, 10),
        table("C", 200, 10),
        table("D", 300, 10),
        table("E", 400, 10),
      ],
    });
    assert.equal(before.camera.scale, afterJoin.camera.scale);
    assert.equal(before.camera.translateX, afterJoin.camera.translateX);
    assert.equal(before.camera.translateY, afterJoin.camera.translateY);
  });

  test("D. filtros: ocultar mesas no cambia key ni cámara", () => {
    const keyAll = buildTpvMapCameraFitKey({
      planId: "sala",
      planWidth: 1000,
      planHeight: 700,
      visualScale: 1.4,
      paddingPx: 40,
    });
    const keyFiltered = buildTpvMapCameraFitKey({
      planId: "sala",
      planWidth: 1000,
      planHeight: 700,
      visualScale: 1.4,
      paddingPx: 40,
    });
    assert.equal(keyAll, keyFiltered);
    assert.equal(keyAll.includes("table"), false);
  });

  test("E. cambio de plano genera cámara nueva", () => {
    const sala = computeTpvMapCameraFit({
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
    });
    const terraza = computeTpvMapCameraFit({
      planId: "terraza",
      planSize: { width: 600, height: 900 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
    });
    assert.notEqual(sala.camera.scale, terraza.camera.scale);
    assert.notEqual(
      buildTpvMapCameraFitKey({
        planId: "sala",
        planWidth: 1000,
        planHeight: 700,
      }),
      buildTpvMapCameraFitKey({
        planId: "terraza",
        planWidth: 600,
        planHeight: 900,
      }),
    );
  });

  test("F. fallback legacy sin dimensiones válidas", () => {
    assert.equal(hasValidTpvPlanSize({ width: 0, height: 700 }), false);
    const result = computeTpvMapCameraFit({
      planId: "legacy",
      planSize: { width: 0, height: 0 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
      persistedElements: [
        table("wall", 0, 0, 500, 20),
        table("A", 40, 40),
        table("B", 400, 300),
      ],
      visibleTablesIgnored: [table("A", 40, 40)],
    });
    assert.equal(result.source, "legacy-fallback");
    assert.ok(Number.isFinite(result.camera.scale));
    assert.ok(result.camera.scale > 0.05);
    assert.ok(result.camera.scale < 10);
    // Bounds deben incluir pared (no solo mesa visible)
    const onlyVisible = resolveTpvMapCameraBounds({
      planSize: { width: 0, height: 0 },
      persistedElements: [table("A", 40, 40)],
    });
    assert.ok(result.bounds.width >= onlyVisible.bounds.width);
  });

  test("G. resize: nuevo viewport cambia escala; mismos datos operativos no", () => {
    const a = computeTpvMapCameraFit({
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
    });
    const resized = computeTpvMapCameraFit({
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 900,
      viewportHeight: 600,
      paddingPx: 40,
      fitZoomMax: 4,
    });
    const sameOps = computeTpvMapCameraFit({
      planId: "sala",
      planSize: { width: 1000, height: 700 },
      viewportWidth: 1200,
      viewportHeight: 800,
      paddingPx: 40,
      fitZoomMax: 4,
      visibleTablesIgnored: [table("Z", 1, 1)],
    });
    assert.notEqual(a.camera.scale, resized.camera.scale);
    assert.equal(a.camera.scale, sameOps.camera.scale);
    assert.equal(a.camera.translateX, sameOps.camera.translateX);
  });
});
