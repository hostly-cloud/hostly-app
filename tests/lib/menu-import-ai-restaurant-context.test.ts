import assert from "node:assert/strict";
import test from "node:test";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";
import { resolveRestaurantOperationalContext } from "@/lib/server/menu-imports/ai-import-v2/resolve-restaurant-operational-context";
import type { AiImportV2ValidatedItem } from "@/lib/server/menu-imports/ai-import-v2/types";

const now = 1;

function item(overrides: Partial<AiImportV2ValidatedItem> = {}): AiImportV2ValidatedItem {
  return {
    name: "Paella",
    description: "",
    translations: [],
    price: 18,
    confidence: 0.95,
    sourceEvidence: ["Paella 18"],
    operationalSuggestion: {
      categoryType: "food",
      productFamilyType: "food",
      suggestedStation: "kitchen",
      confidence: 0.9,
    },
    sectionName: "Arroces",
    validationStatus: "accepted",
    rejectionReasons: [],
    operationalWarnings: [],
    ...overrides,
  };
}

function station(
  id: string,
  name: string,
  type: ProductionStationDocument["type"],
  active = true,
): ProductionStationDocument {
  return {
    id,
    restaurantId: "r1",
    name,
    normalizedName: name.toLowerCase(),
    type,
    color: "#7eb8d4",
    active,
    createdAt: now,
    updatedAt: now,
  };
}

function family(
  id: string,
  name: string,
  type: ProductFamilyDocument["type"],
  active = true,
): ProductFamilyDocument {
  return {
    id,
    restaurantId: "r1",
    name,
    normalizedName: name.toLowerCase(),
    type,
    active,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };
}

test("resolves unique active station and family for the same tenant", () => {
  const result = resolveRestaurantOperationalContext({
    restaurantId: "r1",
    items: [item()],
    productionStations: [station("k1", "Cocina principal", "cocina")],
    productFamilies: [family("default-food", "Comida", "food")],
  });

  assert.equal(result.fullyResolvedCount, 1);
  assert.equal(result.reviewCount, 0);
  assert.equal(result.targets[0]?.status, "matched");
  assert.equal(result.targets[0]?.station?.id, "k1");
  assert.equal(result.targets[0]?.productFamily?.id, "default-food");
});

test("does not guess when multiple active stations have the same type", () => {
  const result = resolveRestaurantOperationalContext({
    restaurantId: "r1",
    items: [item()],
    productionStations: [
      station("k1", "Cocina caliente", "cocina"),
      station("k2", "Cocina fría", "cocina"),
    ],
    productFamilies: [family("default-food", "Comida", "food")],
  });

  assert.equal(result.reviewCount, 1);
  assert.equal(result.targets[0]?.station, undefined);
  assert.ok(result.targets[0]?.reasons.some((reason) => reason.startsWith("ambiguous_station:cocina:")));
});

test("prefers the active canonical family id when several families share a type", () => {
  const result = resolveRestaurantOperationalContext({
    restaurantId: "r1",
    items: [item({ operationalSuggestion: {
      categoryType: "food",
      productFamilyType: "food",
      suggestedStation: "none",
      confidence: 0.8,
    } })],
    productionStations: [],
    productFamilies: [
      family("custom-food", "Especiales", "food"),
      family("default-food", "Comida", "food"),
    ],
  });

  assert.equal(result.targets[0]?.productFamily?.id, "default-food");
  assert.equal(result.targets[0]?.status, "matched");
});

test("marks review when the restaurant has no compatible active family", () => {
  const result = resolveRestaurantOperationalContext({
    restaurantId: "r1",
    items: [item()],
    productionStations: [station("k1", "Cocina", "cocina")],
    productFamilies: [family("drink", "Bebidas", "drink")],
  });

  assert.equal(result.reviewCount, 1);
  assert.equal(result.targets[0]?.productFamily, undefined);
  assert.ok(result.targets[0]?.reasons.includes("no_active_family:food"));
});
