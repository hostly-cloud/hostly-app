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

test("abre mesa cuando el usuario dice número", () => {
  assert.deepEqual(parseTpvVoiceCommand("mesa número cuatro"), {
    type: "open_table",
    tableQuery: "cuatro",
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

test("interpreta un producto directo a una mesa", () => {
  assert.deepEqual(parseTpvVoiceCommand("un carpaccio de ternera a mesa 3"), {
    type: "add_products_to_table",
    tableQuery: "3",
    items: [{ productQuery: "carpaccio de ternera", quantity: 1 }],
    sendOrder: true,
  });
});

test("interpreta varios productos y cantidades directos a una mesa", () => {
  assert.deepEqual(
    parseTpvVoiceCommand("pon tres cañas y una ensalada en mesa 12"),
    {
      type: "add_products_to_table",
      tableQuery: "12",
      items: [
        { productQuery: "canas", quantity: 3 },
        { productQuery: "ensalada", quantity: 1 },
      ],
      sendOrder: true,
    },
  );
});

test("no parte nombres con y si no empieza otra cantidad", () => {
  assert.deepEqual(parseTpvVoiceCommand("un sandwich jamon y queso a mesa 2"), {
    type: "add_products_to_table",
    tableQuery: "2",
    items: [{ productQuery: "sandwich jamon y queso", quantity: 1 }],
    sendOrder: true,
  });
});

test("tolera muletillas antes de un pedido", () => {
  assert.deepEqual(
    parseTpvVoiceCommand("eh, bueno, una botella de Ruinart a la mesa número 4"),
    {
      type: "add_products_to_table",
      tableQuery: "4",
      items: [{ productQuery: "botella de ruinart", quantity: 1 }],
      sendOrder: true,
    },
  );
});

test("tolera corrección espontánea era antes del pedido", () => {
  assert.deepEqual(parseTpvVoiceCommand("era una botella de Ruinart a mesa 4"), {
    type: "add_products_to_table",
    tableQuery: "4",
    items: [{ productQuery: "botella de ruinart", quantity: 1 }],
    sendOrder: true,
  });
});

test("elimina formato repetido al final sin tocar el producto", () => {
  assert.deepEqual(
    parseTpvVoiceCommand(
      "era una botella de Ruinart a la botella a la mesa número 4",
    ),
    {
      type: "add_products_to_table",
      tableQuery: "4",
      items: [{ productQuery: "botella de ruinart", quantity: 1 }],
      sendOrder: true,
    },
  );
});

test("no elimina expresiones culinarias reales con a la", () => {
  assert.deepEqual(parseTpvVoiceCommand("un pollo a la brasa a mesa 7"), {
    type: "add_products_to_table",
    tableQuery: "7",
    items: [{ productQuery: "pollo a la brasa", quantity: 1 }],
    sendOrder: true,
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
