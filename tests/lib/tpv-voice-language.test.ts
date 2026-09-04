import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeTpvVoiceTranscript,
  normalizeTpvVoiceLanguage,
  speechLocaleForHostlyLocale,
  speechLocaleForTpvVoiceLanguage,
  type TpvVoiceLanguage,
} from "../../lib/tpv/voice-language";
import { parseTpvVoiceCommand } from "../../lib/tpv/voice-command";

function expectOrder(
  language: TpvVoiceLanguage,
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
  assert.equal(speechLocaleForTpvVoiceLanguage("pt"), "pt-PT");
  assert.equal(speechLocaleForTpvVoiceLanguage("nl"), "nl-NL");
});

test("las variantes suizas reutilizan la gramática base y conservan su locale regional", () => {
  assert.equal(normalizeTpvVoiceLanguage("de-CH"), "de");
  assert.equal(normalizeTpvVoiceLanguage("fr-CH"), "fr");
  assert.equal(normalizeTpvVoiceLanguage("it-CH"), "it");
  assert.equal(speechLocaleForHostlyLocale("de-CH"), "de-CH");
  assert.equal(speechLocaleForHostlyLocale("fr-CH"), "fr-CH");
  assert.equal(speechLocaleForHostlyLocale("it-CH"), "it-CH");
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

test("portugués interpreta cantidades, productos y mesa", () => {
  expectOrder("pt", "duas Coca-Cola e uma Fanta laranja para a mesa nove", "9", [
    { productQuery: "coca cola", quantity: 2 },
    { productQuery: "fanta laranja", quantity: 1 },
  ]);
  expectOrder("pt", "mesa cinco traz me uma Ruinart", "5", [
    { productQuery: "ruinart", quantity: 1 },
  ]);
});

test("neerlandés interpreta cantidades, productos y mesa", () => {
  expectOrder("nl", "twee Coca-Cola en een Fanta Orange voor de tafel negen", "9", [
    { productQuery: "coca cola", quantity: 2 },
    { productQuery: "fanta orange", quantity: 1 },
  ]);
  expectOrder("nl", "tafel vijf breng me een Ruinart", "5", [
    { productQuery: "ruinart", quantity: 1 },
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
  assert.deepEqual(
    parseTpvVoiceCommand(canonicalizeTpvVoiceTranscript("envia a comanda", "pt")),
    { type: "send_order" },
  );
  assert.deepEqual(
    parseTpvVoiceCommand(canonicalizeTpvVoiceTranscript("bestelling versturen", "nl")),
    { type: "send_order" },
  );
});

test("abrir mesa funciona en todos los idiomas de voz", () => {
  const cases = [
    ["es", "abre mesa nueve"],
    ["en", "open table nine"],
    ["fr", "ouvre la table neuf"],
    ["de", "öffne Tisch neun"],
    ["it", "apri tavolo nove"],
    ["pt", "abre a mesa nove"],
    ["nl", "open tafel negen"],
  ] as const;

  for (const [language, spoken] of cases) {
    const canonical = canonicalizeTpvVoiceTranscript(spoken, language);
    assert.deepEqual(parseTpvVoiceCommand(canonical), {
      type: "open_table",
      tableQuery: "9",
    });
  }
});
