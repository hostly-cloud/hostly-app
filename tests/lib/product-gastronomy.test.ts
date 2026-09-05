import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeProductAllergens,
  normalizeProductWineProfile,
  productGastronomyToFirestore,
  readProductGastronomy,
} from "@/lib/carta/product-gastronomy";

test("canonical gastronomy normalizes ingredients, allergens, calories and wine data", () => {
  const result = readProductGastronomy({
    id: "p1",
    nombre: "Lubina",
    categoria: "Pescados",
    precio: 24,
    gastronomy: {
      description: "  Lubina salvaje a la brasa  ",
      ingredients: ["Lubina", " aceite de oliva ", "Lubina"],
      allergens: ["fish", "milk", "fish"],
      caloriesKcal: 420,
      wine: {
        style: "white",
        body: "light",
        sweetness: "dry",
        grapes: ["Albariño", " Albariño "],
        region: "Rías Baixas",
        vintage: 2025,
        abv: 12.5,
      },
    },
  });

  assert.equal(result.source, "canonical");
  assert.equal(result.hasAllergenInformation, true);
  assert.deepEqual(result.gastronomy.ingredients, ["Lubina", "aceite de oliva"]);
  assert.deepEqual(result.gastronomy.allergens, ["fish", "milk"]);
  assert.equal(result.gastronomy.caloriesKcal, 420);
  assert.deepEqual(result.gastronomy.wine?.grapes, ["Albariño"]);
});

test("legacy product fields remain readable without a destructive migration", () => {
  const result = readProductGastronomy({
    id: "legacy",
    nombre: "Tarta",
    categoria: "Postres",
    precio: 7,
    ingredientes: "huevo; leche; chocolate",
    alergenos: ["huevos", "leche"],
    calorias: 510,
  });

  assert.equal(result.source, "legacy");
  assert.equal(result.hasAllergenInformation, true);
  assert.deepEqual(result.gastronomy.ingredients, ["huevo", "leche", "chocolate"]);
  assert.deepEqual(result.gastronomy.allergens, ["eggs", "milk"]);
  assert.equal(result.gastronomy.caloriesKcal, 510);
});

test("missing allergen data is unknown and never treated as allergen-free", () => {
  const missing = readProductGastronomy({
    id: "unknown",
    nombre: "Plato",
    categoria: "Carta",
    precio: 10,
  });
  const explicitEmpty = readProductGastronomy({
    id: "confirmed-empty",
    nombre: "Plato",
    categoria: "Carta",
    precio: 10,
    gastronomy: { allergens: [] },
  });

  assert.equal(missing.hasAllergenInformation, false);
  assert.equal(missing.gastronomy.allergens, undefined);
  assert.equal(explicitEmpty.hasAllergenInformation, true);
  assert.deepEqual(explicitEmpty.gastronomy.allergens, []);
});

test("allergen normalization accepts common Spanish aliases but discards unknown claims", () => {
  assert.deepEqual(
    normalizeProductAllergens(["Gluten", "crustáceos", "SOJA", "no contiene frutos secos"]),
    ["gluten", "crustaceans", "soybeans"],
  );
});

test("wine profile rejects invalid numeric and enum values", () => {
  assert.deepEqual(
    normalizeProductWineProfile({
      style: "white",
      body: "huge",
      sweetness: "dry",
      grapes: "Verdejo, Sauvignon Blanc",
      vintage: 1200,
      abv: 140,
      notes: "cítrico; mineral",
    }),
    {
      style: "white",
      sweetness: "dry",
      grapes: ["Verdejo", "Sauvignon Blanc"],
      tastingNotes: ["cítrico", "mineral"],
    },
  );
});

test("firestore serializer only emits normalized canonical metadata", () => {
  assert.deepEqual(
    productGastronomyToFirestore({
      ingredients: [" tomate ", "tomate", "albahaca"],
      allergens: ["gluten"],
      caloriesKcal: 250,
    }),
    {
      ingredients: ["tomate", "albahaca"],
      allergens: ["gluten"],
      caloriesKcal: 250,
    },
  );
});
