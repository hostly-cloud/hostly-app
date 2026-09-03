import test from "node:test";
import assert from "node:assert/strict";

import {
  filterModifierGroupsForProductKind,
  modifierGroupAppliesToProductKind,
  sanitizeModifierGroupIdsForProductKind,
} from "../../lib/modifiers/effective-product-modifiers";
import {
  DEFAULT_DRINK_FORMAT_GROUP_ID,
  DEFAULT_DRINK_MIXER_GROUP_ID,
  type ModifierGroupDocument,
} from "../../lib/modifiers/modifier-types";

function group(
  id: string,
  type: ModifierGroupDocument["type"],
  appliesToProductKind?: string,
): ModifierGroupDocument {
  return {
    id,
    restaurantId: "restaurant-test",
    name: id,
    normalizedName: id,
    type,
    active: true,
    required: false,
    minSelected: 0,
    maxSelected: 1,
    sortOrder: 0,
    ...(appliesToProductKind ? { appliesToProductKind } : {}),
    options: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

test("default drink format and mixer never apply to food dishes", () => {
  const format = group(DEFAULT_DRINK_FORMAT_GROUP_ID, "format");
  const mixer = group(DEFAULT_DRINK_MIXER_GROUP_ID, "mixer");

  assert.equal(modifierGroupAppliesToProductKind(format, "plato"), false);
  assert.equal(modifierGroupAppliesToProductKind(mixer, "plato"), false);
  assert.equal(modifierGroupAppliesToProductKind(format, "bebida"), true);
  assert.equal(modifierGroupAppliesToProductKind(mixer, "bebida"), true);
});

test("unscoped extras remain universal while explicit scopes are respected", () => {
  const universal = group("extra-queso", "addon");
  const foodOnly = group("punto-carne", "custom", "food");
  const drinkOnly = group("tipo-hielo", "custom", "drink");

  assert.equal(modifierGroupAppliesToProductKind(universal, "plato"), true);
  assert.equal(modifierGroupAppliesToProductKind(universal, "bebida"), true);
  assert.equal(modifierGroupAppliesToProductKind(foodOnly, "plato"), true);
  assert.equal(modifierGroupAppliesToProductKind(foodOnly, "bebida"), false);
  assert.equal(modifierGroupAppliesToProductKind(drinkOnly, "bebida"), true);
  assert.equal(modifierGroupAppliesToProductKind(drinkOnly, "plato"), false);
});

test("food filtering and save sanitization remove drink-only groups", () => {
  const groups = [
    group(DEFAULT_DRINK_FORMAT_GROUP_ID, "format"),
    group(DEFAULT_DRINK_MIXER_GROUP_ID, "mixer"),
    group("extra-queso", "addon"),
    group("punto-carne", "custom", "plato"),
  ];

  assert.deepEqual(
    filterModifierGroupsForProductKind(groups, "plato").map((item) => item.id),
    ["extra-queso", "punto-carne"],
  );
  assert.deepEqual(
    sanitizeModifierGroupIdsForProductKind(
      [DEFAULT_DRINK_FORMAT_GROUP_ID, DEFAULT_DRINK_MIXER_GROUP_ID, "extra-queso"],
      groups,
      "plato",
    ),
    ["extra-queso"],
  );
});
