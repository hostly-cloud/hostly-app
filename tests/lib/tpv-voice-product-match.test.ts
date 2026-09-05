import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseTpvVoiceProductCandidate,
  type TpvVoiceProductMatch,
} from "../../lib/tpv/voice-product-match";
import type { Product } from "../../types/product";

function product(
  id: string,
  nombre: string,
  categoria: string,
  extra: Partial<Product> = {},
): Product {
  return { id, nombre, categoria, precio: 0, ...extra };
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
      chooseTpvVoiceProductCandidate(query, [expected, product("other", "Tarta de queso", "Postres")]),
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

test("entiende presentación de servicio sin exigir que forme parte del nombre", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("una botella de ruinart", [
      product("ruinart", "Ruinart", "Champagne", { productFamilyName: "Vinos y espumosos", tipoVenta: "bebida" }),
      product("moet", "Moët Impérial", "Champagne", { productFamilyName: "Vinos y espumosos", tipoVenta: "bebida" }),
    ]),
  );
  assert.equal(match.product.id, "ruinart");
});

test("usa categoría y familia reales de la carta para reforzar el producto", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("el verdejo de vinos blancos", [
      product("verdejo", "José Pariente Verdejo", "Vinos blancos", { productFamilyName: "Vinos", tipoVenta: "bebida" }),
      product("rioja", "Ramón Bilbao Crianza", "Vinos tintos", { productFamilyName: "Vinos", tipoVenta: "bebida" }),
    ]),
  );
  assert.equal(match.product.id, "verdejo");
});

test("aprovecha un nombre distintivo único dentro de la carta del restaurante", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("pariente", [
      product("verdejo", "José Pariente Verdejo", "Vinos blancos"),
      product("albariño", "Martín Códax Albariño", "Vinos blancos"),
      product("rioja", "Ramón Bilbao Crianza", "Vinos tintos"),
    ]),
  );
  assert.equal(match.product.id, "verdejo");
  assert.ok(match.score >= 0.61);
});

test("prioriza el nombre exacto Fanta de naranja frente a variantes cercanas", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("fanta de naranja", [
      product("orange", "Fanta de naranja", "Refrescos"),
      product("orange-zero", "Fanta naranja zero", "Refrescos"),
      product("lemon", "Fanta de limón", "Refrescos"),
    ]),
  );
  assert.equal(match.product.id, "orange");
  assert.equal(match.score, 1);
});

test("respeta explícitamente normal frente a zero", () => {
  const catalog = [
    product("regular", "Coca-Cola", "Refrescos"),
    product("zero", "Coca-Cola Zero", "Refrescos"),
  ];
  assert.equal(requireMatch(chooseTpvVoiceProductCandidate("coca cola zero", catalog)).product.id, "zero");
  assert.equal(requireMatch(chooseTpvVoiceProductCandidate("coca cola normal", catalog)).product.id, "regular");
});

test("mantiene ambigüedad si existen dos productos con el mismo nombre exacto", () => {
  const match = chooseTpvVoiceProductCandidate("fanta de naranja", [
    product("orange-a", "Fanta de naranja", "Refrescos"),
    product("orange-b", "Fanta de naranja", "Refrescos"),
  ]);
  assert.equal(match, "ambiguous");
});

test("usa vocabulario de servicio para relacionar caña con cerveza", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("cana", [product("draft", "Mahou de barril", "Cervezas")]),
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

test("no inventa una marca que no existe en la carta activa", () => {
  const match = chooseTpvVoiceProductCandidate("heineken", [
    product("mahou", "Mahou 5 Estrellas", "Cervezas"),
    product("estrella", "Estrella Galicia", "Cervezas"),
  ]);
  assert.equal(match, null);
});

test("no convierte una frase muy lejana en un producto solo por forzar coincidencia", () => {
  const match = chooseTpvVoiceProductCandidate("servilletas limpias", [
    product("coke", "Coca-Cola", "Refrescos"),
    product("steak", "Solomillo", "Carnes"),
  ]);
  assert.equal(match, null);
});

const pizzaCatalog = [
  product("marinara", "Pizza Marinara", "Pizzas"),
  product("calzone", "Pizza Calzone", "Pizzas"),
  product("prosciutto", "Pizza Prosciutto Cotto", "Pizzas"),
  product("tartufo", "Pizza Tartufo", "Pizzas"),
  product("coke", "Coca-Cola", "Refrescos"),
];

test("resuelve nombres italianos de la carta aunque el dictado los deforme", () => {
  const cases: Array<[string, string]> = [
    ["pizza marinara", "marinara"],
    ["piza marinara", "marinara"],
    ["pizza marina", "marinara"],
    ["pizza marinada", "marinara"],
    ["pizza calzon", "calzone"],
    ["pizza prosciuto coto", "prosciutto"],
    ["pizza prosciutto cotto", "prosciutto"],
    ["pizza tartufo", "tartufo"],
  ];
  for (const [spoken, expectedId] of cases) {
    const match = requireMatch(chooseTpvVoiceProductCandidate(spoken, pizzaCatalog), spoken);
    assert.equal(match.product.id, expectedId, spoken);
  }
});

test("no adivina una pizza concreta si solo se oye la palabra compartida", () => {
  assert.equal(chooseTpvVoiceProductCandidate("pizza", pizzaCatalog), "ambiguous");
});

test("los productos internacionales siguen resolviéndose solo dentro de la carta recibida", () => {
  const oneRestaurant = [product("marinara", "Pizza Marinara", "Pizzas")];
  const otherRestaurant = [product("tartufo", "Pizza Tartufo", "Pizzas")];
  assert.equal(requireMatch(chooseTpvVoiceProductCandidate("pizza marinara", oneRestaurant)).product.id, "marinara");
  assert.equal(chooseTpvVoiceProductCandidate("pizza marinara", otherRestaurant), null);
});
