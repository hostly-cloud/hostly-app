import assert from "node:assert/strict";
import test from "node:test";
import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import type { AiImportV2ValidatedItem } from "@/lib/server/menu-imports/ai-import-v2/types";
import { mergePhotoVisionItems } from "@/lib/server/menu-imports/ai-import-v2/merge-photo-vision-items";

function existing(name: string, price: number): ImportedMenuItem {
  return {
    id: `existing-${name}`,
    sourceType: "image",
    name,
    price,
    sectionName: "Entrantes",
    suggestedCategory: "Entrantes",
    suggestedStation: "kitchen",
    confidence: 90,
    needsReview: false,
    selectedForPublish: true,
  };
}

function vision(
  name: string,
  price: number,
  confidence = 0.9,
): AiImportV2ValidatedItem {
  return {
    name,
    description: "",
    translations: [],
    price,
    confidence,
    sourceEvidence: [`${name} ${price.toFixed(2)}`],
    operationalSuggestion: {
      categoryType: "food",
      productFamilyType: "food",
      suggestedStation: "kitchen",
      confidence: 0.9,
    },
    sectionName: "Entrantes",
    validationStatus: "accepted",
    rejectionReasons: [],
    operationalWarnings: [],
  };
}

test("recovers a validated photo item missing from the parser result", () => {
  const base = [existing("Ensaladilla rusa", 8.5)];
  const result = mergePhotoVisionItems({
    existingItems: base,
    acceptedVisionItems: [vision("Croquetas de jamón", 9.5)],
  });

  assert.equal(result.recoveredCount, 1);
  assert.equal(result.items.length, 2);
  const recovered = result.items[1];
  assert.equal(recovered?.name, "Croquetas de jamón");
  assert.equal(recovered?.price, 9.5);
  assert.equal(recovered?.needsReview, false);
  assert.equal(recovered?.aiWarnings?.includes("photo_vision_recovered"), true);
});

test("does not duplicate an existing product by normalized name", () => {
  const result = mergePhotoVisionItems({
    existingItems: [existing("Croquetas de jamón", 9.5)],
    acceptedVisionItems: [vision("Croquetas de Jamon", 10)],
  });

  assert.equal(result.recoveredCount, 0);
  assert.equal(result.items.length, 1);
});

test("does not recover low-confidence photo candidates", () => {
  const result = mergePhotoVisionItems({
    existingItems: [],
    acceptedVisionItems: [vision("Tartar de atún", 14.5, 0.5)],
  });

  assert.equal(result.recoveredCount, 0);
  assert.deepEqual(result.items, []);
});

test("marks recovered items for review when confidence is not high enough", () => {
  const result = mergePhotoVisionItems({
    existingItems: [],
    acceptedVisionItems: [vision("Burrata", 12, 0.7)],
  });

  assert.equal(result.recoveredCount, 1);
  assert.equal(result.items[0]?.needsReview, true);
});
