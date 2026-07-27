import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  formatEnviarComandaActionLabel,
  selectLinesToReleaseOnComanda,
} from "@/lib/carta/comanda-line-release";
import type { Product } from "@/types/product";

function product(partial: Partial<Product> & Pick<Product, "id" | "nombre">): Product {
  return {
    precio: 10,
    categoria: "Entrantes",
    ...partial,
  } as Product;
}

describe("formatEnviarComandaActionLabel", () => {
  test("muestra N como líneas releasables cuando hay pendientes", () => {
    assert.equal(
      formatEnviarComandaActionLabel({
        isSending: false,
        sentFlash: false,
        releasableLineCount: 3,
      }),
      "Enviar comanda · 3",
    );
  });

  test("loading tiene prioridad sobre el contador", () => {
    assert.equal(
      formatEnviarComandaActionLabel({
        isSending: true,
        sentFlash: false,
        releasableLineCount: 2,
      }),
      "Enviando…",
    );
  });

  test("flash de éxito tiene prioridad sobre loading y contador", () => {
    assert.equal(
      formatEnviarComandaActionLabel({
        isSending: true,
        sentFlash: true,
        releasableLineCount: 2,
      }),
      "Comanda enviada",
    );
  });

  test("sin releasables no inventa contador", () => {
    assert.equal(
      formatEnviarComandaActionLabel({
        isSending: false,
        sentFlash: false,
        releasableLineCount: 0,
      }),
      "Enviar comanda",
    );
  });
});

describe("selectLinesToReleaseOnComanda count for Enviar CTA", () => {
  test("N coincide con líneas que se liberan (no con unidades)", () => {
    const lines = [
      {
        id: "a",
        status: "pending",
        course: 1,
        station: "kitchen" as const,
        preparationArea: "cocina" as const,
        quantity: 3,
        product: product({ id: "p1", nombre: "Bruschetta" }),
      },
      {
        id: "b",
        status: "pending",
        course: 1,
        station: "bar" as const,
        preparationArea: "barra" as const,
        quantity: 2,
        product: product({ id: "p2", nombre: "Cola" }),
      },
      {
        id: "c",
        status: "sent",
        course: 1,
        station: "kitchen" as const,
        preparationArea: "cocina" as const,
        quantity: 1,
        product: product({ id: "p3", nombre: "Ya enviada" }),
      },
    ];
    const releasable = selectLinesToReleaseOnComanda(lines);
    assert.equal(releasable.length, 2);
    assert.equal(
      formatEnviarComandaActionLabel({
        isSending: false,
        sentFlash: false,
        releasableLineCount: releasable.length,
      }),
      "Enviar comanda · 2",
    );
  });
});
