import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeTpvVoiceTranscript,
  speechLocaleForTpvVoiceLanguage,
} from "../../lib/tpv/voice-language";
import { parseTpvVoiceCommand } from "../../lib/tpv/voice-command";

function expectOrder(
  language: "es" | "en" | "fr" | "de" | "it",
  spoken: string,
  tableQuery: string,
  items: Array<{ productQuery: string; quantity: number }>,
) {
  const canonical = canonicalizeTpvVoiceTranscript(spoken, language);
  assert.deepEqual(parseTpvVoiceCommand(canonical), {
    type: "add_products_to_table",
    tableQuery,
    items,
    sendOrder: true,
  });
}

test("usa el locale de reconocimiento correspondiente a cada idioma del TPV", () => {
  assert.equal(speechLocaleForTpvVoiceLanguage("es"), "es-ES");
  assert.equal(speechLocaleForTpvVoiceLanguage("en"), "en-GB");
  assert.equal(speechLocaleForTpvVoiceLanguage("fr"), "fr-FR");
  assert.equal(speechLocaleForTpvVoiceLanguage("de"), "de-DE");
  assert.equal(speechLocaleForTpvVoiceLanguage("it"), "it-IT");
});

test("inglés conserva nombres de carta y traduce solo la gramática operativa", () => {
  expectOrder("en", "two Coca-Cola and one Fanta Orange for table nine", "9", [
    { productQuery: "coca cola", quantity: 2 },
    { productQuery: "fanta orange", quantity: 1 },
  ]);
  expectOrder("en", "table five bring me one Ruinart", "5", [
    { productQuery: "ruinart", quantity: 1 },
  ]);
});

test("francés interpreta cantidades, productos y mesa", () => {
  expectOrder("fr", "deux Coca-Cola et une Fanta orange pour la table neuf", "9", [
    { productQuery: "coca cola", quantity: 2 },
    { productQuery: "fanta orange", quantity: 1 },
  ]);
});

test("alemán interpreta cantidades, productos y mesa", () => {
  expectOrder("de", "zwei Coca-Cola und eine Fanta Orange für den Tisch neun", "9", [
    { productQuery: "coca cola", quantity: 2 },
    { productQuery: "fanta orange", quantity: 1 },
  ]);
});

test("italiano interpreta cantidades, productos y mesa", () => {
  expectOrder("it", "due Coca-Cola e una Fanta arancia per il tavolo nove", "9", [
    { productQuery: "coca cola", quantity: 2 },
    { productQuery: "fanta arancia", quantity: 1 },
  ]);
});

test("acciones operativas se convierten al contrato canónico existente", () => {
  assert.deepEqual(
    parseTpvVoiceCommand(canonicalizeTpvVoiceTranscript("send order", "en")),
    { type: "send_order" },
  );
  assert.deepEqual(
    parseTpvVoiceCommand(canonicalizeTpvVoiceTranscript("envoyer la commande", "fr")),
    { type: "send_order" },
  );
  assert.deepEqual(
    parseTpvVoiceCommand(canonicalizeTpvVoiceTranscript("Bestellung senden", "de")),
    { type: "send_order" },
  );
  assert.deepEqual(
    parseTpvVoiceCommand(canonicalizeTpvVoiceTranscript("invia la comanda", "it")),
    { type: "send_order" },
  );
});

test("abrir mesa funciona en los cinco idiomas", () => {
  const cases = [
    ["es", "abre mesa nueve"],
    ["en", "open table nine"],
    ["fr", "ouvre la table neuf"],
    ["de", "öffne Tisch neun"],
    ["it", "apri tavolo nove"],
  ] as const;

  for (const [language, spoken] of cases) {
    const canonical = canonicalizeTpvVoiceTranscript(spoken, language);
    assert.deepEqual(parseTpvVoiceCommand(canonical), {
      type: "open_table",
      tableQuery: "9",
    });
  }
});
