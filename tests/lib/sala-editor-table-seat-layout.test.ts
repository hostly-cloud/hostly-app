import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SalaOperationalElementVisual } from "../../components/sala-editor/panels/sala-operational-element-visual";
import {
  createTableSeatLayout,
  MAX_RENDERED_TABLE_SEATS,
  TABLE_SEAT_GAP_PX,
  type TableSeatLayout,
  type TableSeatPosition,
} from "../../lib/sala-editor/canvas/table-seat-layout";
import { projectV2Geometry } from "../../lib/sala-editor/geometry/v2-geometry-projection";
import type { OperationalVisualVariant } from "../../lib/sala-editor/ose/operational-visual-variant";

const DEFAULT_SIZE = { width: 116, height: 76 };

function assertFiniteLayout(layout: TableSeatLayout) {
  assert.ok(Number.isFinite(layout.tableTop.width));
  assert.ok(Number.isFinite(layout.tableTop.height));
  assert.ok(Number.isFinite(layout.seatSize.width));
  assert.ok(Number.isFinite(layout.seatSize.height));
  for (const seat of layout.seats) {
    assert.ok(Number.isFinite(seat.x));
    assert.ok(Number.isFinite(seat.y));
    assert.ok(Number.isFinite(seat.rotationDegrees));
  }
}

function renderedLinearSeatGap(
  layout: TableSeatLayout,
  seat: TableSeatPosition,
  renderScale: number,
): number {
  const table = layout.tableTop;
  const chair = layout.seatSize;
  const isSideSeat = Math.abs(seat.rotationDegrees % 180) === 90;
  const localGap =
    isSideSeat
      ? seat.x < 0
        ? -seat.x - chair.height / 2
        : seat.x - chair.height / 2 - table.width
      : seat.y < 0
        ? -seat.y - chair.height / 2
        : seat.y - chair.height / 2 - table.height;
  return localGap * renderScale;
}

function assertRenderedSeatGap(layout: TableSeatLayout, renderScale: number) {
  for (const seat of layout.seats) {
    assert.ok(
      Math.abs(
        renderedLinearSeatGap(layout, seat, renderScale) - TABLE_SEAT_GAP_PX,
      ) < 1e-9,
    );
  }
}

test("cubre capacidades requeridas por forma", () => {
  for (const count of [2, 4, 6]) {
    assert.equal(createTableSeatLayout(count, "round", DEFAULT_SIZE).seats.length, count);
  }
  for (const count of [2, 4]) {
    assert.equal(createTableSeatLayout(count, "square", DEFAULT_SIZE).seats.length, count);
  }
  for (const count of [4, 6, 8]) {
    assert.equal(
      createTableSeatLayout(count, "rectangular", DEFAULT_SIZE).seats.length,
      count,
    );
  }
});

test("la mesa redonda distribuye 2, 4 y 6 plazas respecto al tablero real", () => {
  for (const count of [2, 4, 6]) {
    const layout = createTableSeatLayout(count, "round", DEFAULT_SIZE);
    assert.equal(layout.seats[0]!.x, layout.tableTop.width / 2);
    assert.ok(layout.seats[0]!.y < 0);
    assertFiniteLayout(layout);
  }
  const fourSeats = createTableSeatLayout(4, "round", DEFAULT_SIZE);
  assert.ok(fourSeats.seats.some((seat) => seat.x > fourSeats.tableTop.width));
  assert.ok(fourSeats.seats.some((seat) => seat.x < 0));
  assertRenderedSeatGap(fourSeats, 1);
});

test("dos plazas cuadradas quedan opuestas y cuatro equilibran los lados", () => {
  const twoSeats = createTableSeatLayout(2, "square", DEFAULT_SIZE);
  assert.deepEqual(
    twoSeats.seats.map((seat) => seat.rotationDegrees),
    [0, 0],
  );
  assert.ok(twoSeats.seats[0]!.y < 0);
  assert.ok(twoSeats.seats[1]!.y > twoSeats.tableTop.height);

  const fourSeats = createTableSeatLayout(4, "square", DEFAULT_SIZE);
  assert.equal(fourSeats.seats.filter((seat) => seat.rotationDegrees === 0).length, 2);
  assert.equal(fourSeats.seats.filter((seat) => seat.rotationDegrees === 90).length, 2);
  assertRenderedSeatGap(fourSeats, 1);
});

test("rectangular reparte 4 y 6 en filas y 8 añade cabeceras", () => {
  for (const count of [4, 6]) {
    const layout = createTableSeatLayout(count, "rectangular", DEFAULT_SIZE);
    assert.equal(layout.seats.filter((seat) => seat.rotationDegrees === 0).length, count);
    assert.equal(layout.seats.filter((seat) => seat.y < 0).length, count / 2);
    assert.equal(
      layout.seats.filter((seat) => seat.y > layout.tableTop.height).length,
      count / 2,
    );
    assertRenderedSeatGap(layout, 1);
  }

  const eightSeats = createTableSeatLayout(8, "rectangular", DEFAULT_SIZE);
  assert.equal(eightSeats.seats.filter((seat) => seat.rotationDegrees === 90).length, 2);
  assertRenderedSeatGap(eightSeats, 1);
});

test("resize y escala visual mantienen 3 px reales respecto al tablero", () => {
  for (const size of [
    { width: 56, height: 44 },
    { width: 320, height: 220 },
  ]) {
    for (const renderScale of [0.5, 0.75, 1, 1.5]) {
      for (const variant of ["rectangular", "square"] as const) {
        const layout = createTableSeatLayout(8, variant, size, renderScale);
        assertRenderedSeatGap(layout, renderScale);
        assertFiniteLayout(layout);
      }
      const round = createTableSeatLayout(4, "round", size, renderScale);
      assertRenderedSeatGap(round, renderScale);
      assertFiniteLayout(round);
    }
  }
});

test("el renderer consume dimensiones explícitas del mismo helper", () => {
  const layout = createTableSeatLayout(4, "rectangular", DEFAULT_SIZE, 1);
  const markup = renderToStaticMarkup(
    createElement(SalaOperationalElementVisual, {
      elementType: "TABLE",
      label: "Mesa 1",
      color: "#315f7d",
      visualVariant: "rectangular",
      seatCount: 4,
      canvasSize: DEFAULT_SIZE,
    }),
  );

  assert.match(markup, /hostly-sala-op-visual__table-layout/);
  assert.match(markup, new RegExp(`width:${layout.tableTop.width}px`));
  assert.match(markup, new RegExp(`height:${layout.tableTop.height}px`));
  assert.match(markup, new RegExp(`width:${layout.seatSize.width}px`));
  assert.match(markup, new RegExp(`height:${layout.seatSize.height}px`));
  assert.equal(
    (markup.match(/hostly-sala-op-visual__seat"/g) ?? []).length,
    layout.seats.length,
  );
});

test("rotación conserva tamaño y orientación rígida del conjunto", () => {
  const layout = createTableSeatLayout(8, "rectangular", DEFAULT_SIZE);
  const geometry = projectV2Geometry({
    x: 300,
    y: 180,
    width: DEFAULT_SIZE.width,
    height: DEFAULT_SIZE.height,
    rotation: 90,
    origin: "center",
  });

  assert.equal(geometry.rotation, 90);
  assert.equal(geometry.width, DEFAULT_SIZE.width);
  assert.equal(geometry.height, DEFAULT_SIZE.height);
  assert.equal(layout.seats.length, 8);
  assertFiniteLayout(layout);
});

test("entradas inválidas son seguras y capacidades extremas quedan limitadas", () => {
  assert.deepEqual(createTableSeatLayout(0, "round", DEFAULT_SIZE).seats, []);
  assert.deepEqual(createTableSeatLayout(Number.NaN, "round", DEFAULT_SIZE).seats, []);
  assert.equal(
    createTableSeatLayout(
      MAX_RENDERED_TABLE_SEATS + 10,
      "round",
      { width: Number.NaN, height: Number.POSITIVE_INFINITY },
    ).seats.length,
    MAX_RENDERED_TABLE_SEATS,
  );

  for (const variant of ["round", "square", "rectangular"] satisfies OperationalVisualVariant[]) {
    assertFiniteLayout(
      createTableSeatLayout(8, variant, {
        width: Number.NaN,
        height: Number.POSITIVE_INFINITY,
      }),
    );
  }
});
