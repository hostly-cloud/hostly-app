import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isPendingMarchPostresLine,
  isPendingMarchPrimeroLine,
  isPendingMarchSegundosLine,
  selectLinesToReleaseOnComanda,
} from "@/lib/carta/comanda-line-release";
import type { Product } from "@/types/product";

function product(id: string, nombre: string): Product {
  return {
    id,
    nombre,
    precio: 10,
    categoria: "Cocina",
  } as Product;
}

function kitchenLine(id: string, course: number, status = "pending") {
  return {
    id,
    status,
    course,
    station: "kitchen" as const,
    preparationArea: "cocina" as const,
    product: product(`p-${id}`, id),
  };
}

function drinkLine(id: string, status = "pending") {
  return {
    id,
    status,
    station: "bar" as const,
    preparationArea: "barra" as const,
    product: {
      ...product(`p-${id}`, id),
      categoria: "Bebidas",
    } as Product,
  };
}

describe("secuencia estricta de pases TPV", () => {
  test("Enviar comanda libera bebidas y pase 1, pero retiene primeros, segundos y postres", () => {
    const lines = [
      drinkLine("agua"),
      kitchenLine("entrante", 1),
      kitchenLine("primero", 2),
      kitchenLine("segundo", 3),
      kitchenLine("postre", 4),
    ];

    assert.deepEqual(
      selectLinesToReleaseOnComanda(lines).map((line) => line.id),
      ["agua", "entrante"],
    );
  });

  test("Enviar comanda nunca adelanta segundos o postres aunque no exista pase 1", () => {
    const lines = [kitchenLine("segundo", 3), kitchenLine("postre", 4)];
    assert.deepEqual(selectLinesToReleaseOnComanda(lines), []);
  });

  test("un segundo ya marchado no provoca que Enviar comanda adelante el postre", () => {
    const lines = [
      kitchenLine("segundo", 3, "sent"),
      kitchenLine("postre", 4),
    ];
    assert.deepEqual(selectLinesToReleaseOnComanda(lines), []);
  });

  test("cada Marchar selecciona exclusivamente su pase", () => {
    const primero = kitchenLine("primero", 2);
    const segundo = kitchenLine("segundo", 3);
    const postre = kitchenLine("postre", 4);

    assert.equal(isPendingMarchPrimeroLine(primero), true);
    assert.equal(isPendingMarchPrimeroLine(segundo), false);
    assert.equal(isPendingMarchSegundosLine(segundo), true);
    assert.equal(isPendingMarchSegundosLine(postre), false);
    assert.equal(isPendingMarchPostresLine(postre), true);
    assert.equal(isPendingMarchPostresLine(segundo), false);
  });
});
