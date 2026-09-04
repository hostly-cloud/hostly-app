import assert from "node:assert/strict";
import test from "node:test";

import { chooseTpvVoiceTableCandidate } from "../../lib/tpv/voice-table-match";

const entries = [
  { value: { id: "7" }, tableId: "opaque-table-7-a1b2", tableLabel: "Mesa 7" },
  { value: { id: "12" }, tableId: "opaque-table-12-c3d4", tableLabel: "Mesa 12" },
  { value: { id: "17" }, tableId: "opaque-table-17-e5f6", tableLabel: "Mesa 17" },
];

test("prioriza una mesa visible exacta aunque existan mesas parecidas", () => {
  const match = chooseTpvVoiceTableCandidate("7", entries);
  if (!match || match === "ambiguous") assert.fail("Mesa 7 debe resolverse de forma exacta");
  assert.equal(match.value.id, "7");
  assert.equal(match.label, "Mesa 7");
});

test("entiende mesa y mesa numero sin crear candidatos duplicados", () => {
  for (const query of ["mesa 7", "mesa numero 7", "numero siete", "siete"]) {
    const match = chooseTpvVoiceTableCandidate(query, entries);
    if (!match || match === "ambiguous") assert.fail(`${query} debe resolver Mesa 7`);
    assert.equal(match.value.id, "7", query);
  }
});

test("mantiene ambiguedad real si dos mesas comparten la misma etiqueta visible", () => {
  const match = chooseTpvVoiceTableCandidate("terraza 3", [
    { value: { id: "a" }, tableId: "id-a", tableLabel: "Terraza 3" },
    { value: { id: "b" }, tableId: "id-b", tableLabel: "Terraza 3" },
  ]);
  assert.equal(match, "ambiguous");
});

test("no usa ids internos opacos como coincidencia difusa", () => {
  const match = chooseTpvVoiceTableCandidate("a1b2", entries);
  assert.equal(match, null);
});
