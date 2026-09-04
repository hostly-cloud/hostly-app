import assert from "node:assert/strict";
import test from "node:test";

import {
  parseTpvVoiceCommand,
  scoreTpvVoiceCandidate,
} from "../../lib/tpv/voice-command";

type TableOrder = Extract<
  ReturnType<typeof parseTpvVoiceCommand>,
  { type: "add_products_to_table" }
>;

function expectTableOrder(
  spoken: string,
  tableQuery: string,
  items: Array<{ productQuery: string; quantity: number }>,
) {
  assert.deepEqual(parseTpvVoiceCommand(spoken), {
    type: "add_products_to_table",
    tableQuery,
    items,
    sendOrder: true,
  } satisfies TableOrder);
}

test("abre una mesa por número, nombre y número hablado", () => {
  assert.deepEqual(parseTpvVoiceCommand("mesa 4"), {
    type: "open_table",
    tableQuery: "4",
  });
  assert.deepEqual(parseTpvVoiceCommand("abre mesa Terraza 3"), {
    type: "open_table",
    tableQuery: "terraza 3",
  });
  assert.deepEqual(parseTpvVoiceCommand("mesa número cuatro"), {
    type: "open_table",
    tableQuery: "4",
  });
});

test("interpreta cantidades y verbos naturales en mesa abierta", () => {
  assert.deepEqual(parseTpvVoiceCommand("dos Coca-Colas"), {
    type: "add_product",
    productQuery: "coca colas",
    quantity: 2,
  });
  assert.deepEqual(parseTpvVoiceCommand("añade una ensalada"), {
    type: "add_product",
    productQuery: "ensalada",
    quantity: 1,
  });
  assert.deepEqual(parseTpvVoiceCommand("ponme una coca cola"), {
    type: "add_product",
    productQuery: "coca cola",
    quantity: 1,
  });
  assert.deepEqual(parseTpvVoiceCommand("me traes tres aguas"), {
    type: "add_product",
    productQuery: "aguas",
    quantity: 3,
  });
  assert.deepEqual(parseTpvVoiceCommand("necesito una fanta naranja"), {
    type: "add_product",
    productQuery: "fanta naranja",
    quantity: 1,
  });
});

test("acepta las formas normales de indicar la mesa al final", () => {
  const cases = [
    "dos cañas a mesa 5",
    "dos cañas a la mesa cinco",
    "dos cañas para mesa número cinco",
    "dos cañas en la mesa 5",
    "dos cañas mesa 5",
    "dos cañas para la 5",
    "dos cañas a la cinco",
    "dos cañas al 5",
    "dos cañas a 5",
    "dos cañas pa la 5",
    "dos cañas pa l 5",
    "dos cañas pal 5",
    "dos cañas pa 5",
    "dos cañas en 5",
  ];

  for (const spoken of cases) {
    expectTableOrder(spoken, "5", [{ productQuery: "canas", quantity: 2 }]);
  }
});

test("acepta la mesa antes del pedido", () => {
  const cases = [
    "mesa 9 ponme una coca cola",
    "mesa nueve una coca cola",
    "para la 9 ponme una coca cola",
    "a la nueve una coca cola",
    "en la 9 quiero una coca cola",
    "la 9 una coca cola",
    "pal 9 una coca cola",
  ];

  for (const spoken of cases) {
    expectTableOrder(spoken, "9", [{ productQuery: "coca cola", quantity: 1 }]);
  }
});

test("acepta petición verbal antes de indicar mesa y pedido", () => {
  expectTableOrder("llévame a la 7 dos aguas", "7", [
    { productQuery: "aguas", quantity: 2 },
  ]);
  expectTableOrder("ponme en la 7 una coca cola", "7", [
    { productQuery: "coca cola", quantity: 1 },
  ]);
  expectTableOrder("me pones para la 7 tres cañas", "7", [
    { productQuery: "canas", quantity: 3 },
  ]);
});

test("entiende varios productos y cantidades", () => {
  expectTableOrder("pon tres cañas y una ensalada en mesa 12", "12", [
    { productQuery: "canas", quantity: 3 },
    { productQuery: "ensalada", quantity: 1 },
  ]);

  expectTableOrder(
    "un neste una coca-cola y una fanta de naranja a la mesa nueve",
    "9",
    [
      { productQuery: "neste", quantity: 1 },
      { productQuery: "coca cola", quantity: 1 },
      { productQuery: "fanta de naranja", quantity: 1 },
    ],
  );
});

test("entiende expresiones habituales de cantidad", () => {
  expectTableOrder("un par de cañas para la mesa 4", "4", [
    { productQuery: "canas", quantity: 2 },
  ]);
  expectTableOrder("media docena de ostras a la mesa 4", "4", [
    { productQuery: "ostras", quantity: 6 },
  ]);
  expectTableOrder("una docena de croquetas a la mesa 4", "4", [
    { productQuery: "croquetas", quantity: 12 },
  ]);
  expectTableOrder("x3 coca cola para la mesa 4", "4", [
    { productQuery: "coca cola", quantity: 3 },
  ]);
  expectTableOrder("coca cola x3 para la mesa 4", "4", [
    { productQuery: "coca cola", quantity: 3 },
  ]);
  expectTableOrder("dos de agua para la mesa 4", "4", [
    { productQuery: "agua", quantity: 2 },
  ]);
});

test("entiende números compuestos para mesas", () => {
  expectTableOrder("dos aguas a la mesa veintidós", "22", [
    { productQuery: "aguas", quantity: 2 },
  ]);
  expectTableOrder("una coca cola para la mesa treinta y cuatro", "34", [
    { productQuery: "coca cola", quantity: 1 },
  ]);
});

test("recupera cantidad cuando el dictado mete ruido delante", () => {
  expectTableOrder("rosca dos caños a la mesa cinco", "5", [
    { productQuery: "canos", quantity: 2 },
  ]);
});

test("no parte nombres culinarios con y", () => {
  expectTableOrder("un sandwich jamon y queso a mesa 2", "2", [
    { productQuery: "sandwich jamon y queso", quantity: 1 },
  ]);
});

test("tolera muletillas, cortesía y correcciones", () => {
  expectTableOrder("eh, bueno, una botella de Ruinart a la mesa número 4", "4", [
    { productQuery: "botella de ruinart", quantity: 1 },
  ]);
  expectTableOrder("oye ponme dos aguas por favor para la mesa 4", "4", [
    { productQuery: "aguas", quantity: 2 },
  ]);
  expectTableOrder("era una botella de Ruinart a mesa 4", "4", [
    { productQuery: "botella de ruinart", quantity: 1 },
  ]);
  expectTableOrder("dos aguas perdón tres aguas para la mesa 4", "4", [
    { productQuery: "aguas", quantity: 3 },
  ]);
  expectTableOrder("dos aguas rectifico cuatro aguas para la mesa 4", "4", [
    { productQuery: "aguas", quantity: 4 },
  ]);
});

test("elimina formato repetido al final sin tocar el producto", () => {
  expectTableOrder(
    "era una botella de Ruinart a la botella a la mesa número 4",
    "4",
    [{ productQuery: "botella de ruinart", quantity: 1 }],
  );
});

test("no elimina expresiones culinarias reales con a la", () => {
  expectTableOrder("un pollo a la brasa a mesa 7", "7", [
    { productQuery: "pollo a la brasa", quantity: 1 },
  ]);
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
