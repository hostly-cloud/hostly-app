import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseTpvVoiceProductCandidate,
  type TpvVoiceProductMatch,
} from "../../lib/tpv/voice-product-match";
import type { Product } from "../../types/product";

function product(id: string, nombre: string, categoria: string): Product {
  return { id, nombre, categoria, precio: 0 };
}

function requireMatch(
  match: TpvVoiceProductMatch | null | "ambiguous",
  context?: string,
): TpvVoiceProductMatch {
  if (!match || match === "ambiguous") {
    assert.fail(context ? `Expected product match for ${context}` : "Expected product match");
  }
  return match;
}

test("encuentra una caña aunque la transcripción pierda la ñ", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("cana", [
      product("draft", "Caña", "Cervezas"),
      product("water", "Agua mineral", "Aguas"),
    ]),
  );

  assert.equal(match.product.id, "draft");
});

test("generaliza deformaciones fonéticas sin depender de una tabla por producto", () => {
  const cases: Array<[string, Product]> = [
    ["canos", product("draft", "Caña", "Cervezas")],
    ["cocacora", product("coke", "Coca-Cola", "Refrescos")],
    ["carpasio", product("carpaccio", "Carpaccio de ternera", "Entrantes")],
    ["ruinar", product("ruinart", "Ruinart", "Champagne")],
    ["agua minera", product("water", "Agua mineral", "Aguas")],
  ];

  for (const [query, expected] of cases) {
    const match = requireMatch(
      chooseTpvVoiceProductCandidate(query, [
        expected,
        product("other", "Tarta de queso", "Postres"),
      ]),
      query,
    );
    assert.equal(match.product.id, expected.id, query);
  }
});

test("tolera una palabra sobrante si el resto apunta claramente al producto", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("quiero cocacora", [
      product("coke", "Coca-Cola", "Refrescos"),
      product("sprite", "Sprite", "Refrescos"),
    ]),
  );

  assert.equal(match.product.id, "coke");
});

test("usa vocabulario de servicio para relacionar caña con cerveza", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("cana", [
      product("draft", "Mahou de barril", "Cervezas"),
    ]),
  );

  assert.equal(match.product.id, "draft");
});

test("no elige a ciegas si el contexto puede corresponder a varios productos", () => {
  const match = chooseTpvVoiceProductCandidate("cana", [
    product("lager", "Lager de barril", "Cervezas"),
    product("ipa", "IPA de barril", "Cervezas"),
  ]);

  assert.equal(match, "ambiguous");
});

test("no convierte una frase muy lejana en un producto solo por forzar coincidencia", () => {
  const match = chooseTpvVoiceProductCandidate("servilletas limpias", [
    product("coke", "Coca-Cola", "Refrescos"),
    product("steak", "Solomillo", "Carnes"),
  ]);

  assert.equal(match, null);
});
