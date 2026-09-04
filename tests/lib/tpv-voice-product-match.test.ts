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

test("normaliza errores fonéticos comunes de caña", () => {
  for (const query of ["kana", "canna", "cania", "cagna", "cano", "caños"]) {
    const match = requireMatch(
      chooseTpvVoiceProductCandidate(query, [
        product("draft", "Caña", "Cervezas"),
      ]),
      query,
    );
    assert.equal(match.product.id, "draft", query);
  }
});

test("usa vocabulario de servicio para relacionar caña con cerveza", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("cana", [
      product("draft", "Mahou de barril", "Cervezas"),
    ]),
  );

  assert.equal(match.product.id, "draft");
});

test("no elige a ciegas si caña puede significar varias cervezas", () => {
  const match = chooseTpvVoiceProductCandidate("cana", [
    product("lager", "Lager de barril", "Cervezas"),
    product("ipa", "IPA de barril", "Cervezas"),
  ]);

  assert.equal(match, "ambiguous");
});

test("tolera pequeñas desviaciones de pronunciación con confirmación posterior", () => {
  const match = requireMatch(
    chooseTpvVoiceProductCandidate("cocacola", [
      product("coke", "Coca-Cola", "Refrescos"),
    ]),
  );

  assert.equal(match.product.id, "coke");
});
