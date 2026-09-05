import assert from "node:assert/strict";
import test from "node:test";
import {
  assertValidSpanishTaxId,
  isValidSpanishTaxId,
  normalizeSpanishTaxId,
} from "../../lib/fiscal/nif";

test("normaliza y valida NIF, NIE y CIF españoles", () => {
  assert.equal(normalizeSpanishTaxId(" B-12345674 "), "B12345674");
  assert.equal(isValidSpanishTaxId("12345678Z"), true);
  assert.equal(isValidSpanishTaxId("X2482300W"), true);
  assert.equal(isValidSpanishTaxId("B12345674"), true);
  assert.equal(assertValidSpanishTaxId("b-12345674"), "B12345674");
});

test("rechaza controles fiscales incorrectos", () => {
  assert.equal(isValidSpanishTaxId("12345678A"), false);
  assert.equal(isValidSpanishTaxId("B12345678"), false);
  assert.throws(() => assertValidSpanishTaxId("NO-ES-NIF"), /SPANISH_TAX_ID_INVALID/);
});
