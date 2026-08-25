import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMenuImportLearningSignal,
  inferMenuImportLearnedPreference,
  type MenuImportLearningSignal,
} from "@/lib/server/menu-imports/menu-import-local-learning";

function signal(args: {
  draftId: string;
  itemId: string;
  stationBefore?: "kitchen" | "bar" | "cocktail" | "none";
  stationAfter?: "kitchen" | "bar" | "cocktail" | "none";
  categoryAfter?: string;
}): MenuImportLearningSignal {
  const built = buildMenuImportLearningSignal({
    restaurantId: "restaurant-a",
    draftId: args.draftId,
    itemId: args.itemId,
    itemName: "Coca-Cola",
    userId: "user-a",
    stationBefore: args.stationBefore ?? "kitchen",
    stationAfter: args.stationAfter,
    categoryBefore: "Otros",
    categoryAfter: args.categoryAfter,
    createdAt: 1,
  });
  assert.ok(built);
  return built;
}

test("learning signal id is idempotent for the same draft item", () => {
  const first = signal({ draftId: "draft-1", itemId: "item-1", stationAfter: "bar" });
  const second = signal({ draftId: "draft-1", itemId: "item-1", stationAfter: "bar" });
  assert.equal(first.id, second.id);
});

test("one correction is not enough to form a learned preference", () => {
  const preference = inferMenuImportLearnedPreference(
    [signal({ draftId: "d1", itemId: "i1", stationAfter: "bar" })],
    "Coca Cola",
  );
  assert.equal(preference, null);
});

test("two consistent corrections create a stable station preference", () => {
  const preference = inferMenuImportLearnedPreference(
    [
      signal({ draftId: "d1", itemId: "i1", stationAfter: "bar" }),
      signal({ draftId: "d2", itemId: "i2", stationAfter: "bar" }),
    ],
    "Coca-Cola",
  );
  assert.ok(preference);
  assert.equal(preference.station, "bar");
  assert.equal(preference.stationSupport, 2);
  assert.equal(preference.stationConfidence, 1);
});

test("80 percent dominance is accepted but weaker evidence is not", () => {
  const accepted = inferMenuImportLearnedPreference(
    [
      signal({ draftId: "d1", itemId: "i1", stationAfter: "bar" }),
      signal({ draftId: "d2", itemId: "i2", stationAfter: "bar" }),
      signal({ draftId: "d3", itemId: "i3", stationAfter: "bar" }),
      signal({ draftId: "d4", itemId: "i4", stationAfter: "bar" }),
      signal({
        draftId: "d5",
        itemId: "i5",
        stationBefore: "bar",
        stationAfter: "kitchen",
      }),
    ],
    "Coca-Cola",
  );
  assert.ok(accepted);
  assert.equal(accepted.station, "bar");
  assert.equal(accepted.stationConfidence, 0.8);

  const rejected = inferMenuImportLearnedPreference(
    [
      signal({ draftId: "x1", itemId: "i1", stationAfter: "bar" }),
      signal({ draftId: "x2", itemId: "i2", stationAfter: "bar" }),
      signal({
        draftId: "x3",
        itemId: "i3",
        stationBefore: "bar",
        stationAfter: "kitchen",
      }),
    ],
    "Coca-Cola",
  );
  assert.equal(rejected, null);
});

test("category learning uses the same conservative threshold", () => {
  const preference = inferMenuImportLearnedPreference(
    [
      signal({ draftId: "d1", itemId: "i1", categoryAfter: "Refrescos" }),
      signal({ draftId: "d2", itemId: "i2", categoryAfter: "Refrescos" }),
    ],
    "Coca-Cola",
  );
  assert.ok(preference);
  assert.equal(preference.category, "Refrescos");
  assert.equal(preference.categorySupport, 2);
  assert.equal(preference.categoryConfidence, 1);
});
