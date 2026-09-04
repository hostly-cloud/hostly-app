import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTpvVoiceCommand,
  scoreTpvVoiceCandidate,
} from "../../lib/tpv/voice-command";

test("abre una mesa por número", () => {
  assert.deepEqual(parseTpvVoiceCommand("mesa 4"), {
    type: "open_table",
    tableQuery: "4",
  });
});

test("abre una mesa por nombre", () => {
  assert.deepEqual(parseTpvVoiceCommand("abre mesa Terraza 3"), {
    type: "open_table",
    tableQuery: "terraza 3",
  });
});

test("interpreta cantidad y producto", () => {
  assert.deepEqual(parseTpvVoiceCommand("dos Coca-Colas"), {
    type: "add_product",
    productQuery: "coca colas",
    quantity: 2,
  });
});

test("interpreta verbo de alta con cantidad", () => {
  assert.deepEqual(parseTpvVoiceCommand("añade una ensalada"), {
    type: "add_product",
    productQuery: "ensalada",
    quantity: 1,
  });
});

test("interpreta acciones operativas", () => {
  assert.deepEqual(parseTpvVoiceCommand("enviar comanda"), { type: "send_order" });
  assert.deepEqual(parseTpvVoiceCommand("marchar segundos"), {
    type: "march_course",
    course: "segundos",
  });
  assert.deepEqual(parseTpvVoiceCommand("confirmar marcha"), { type: "confirm_march" });
  assert.deepEqual(parseTpvVoiceCommand("volver al mapa"), { type: "back_to_map" });
  assert.deepEqual(parseTpvVoiceCommand("pre ticket"), { type: "preticket" });
  assert.deepEqual(parseTpvVoiceCommand("cobrar mesa"), { type: "charge" });
});

test("tolera pluralización y signos en nombres de producto", () => {
  assert.ok(scoreTpvVoiceCandidate("coca colas", "Coca-Cola") >= 0.72);
});
