import assert from "node:assert/strict";
import test from "node:test";
import { isSafePublishedDecorativeDeactivation } from "@/lib/server/sala-editor/save-published-snapshot";

const RESTAURANT_ID = "restaurant-a";

test("solo acepta tipos decorativos del mismo restaurante", () => {
  for (const type of ["wall", "bar", "column", "pool", "door", "planter"]) {
    assert.equal(
      isSafePublishedDecorativeDeactivation({
        data: { restaurantId: RESTAURANT_ID, type },
        restaurantId: RESTAURANT_ID,
      }),
      true,
      type,
    );
  }

  assert.equal(
    isSafePublishedDecorativeDeactivation({
      data: { restaurantId: RESTAURANT_ID, type: "table" },
      restaurantId: RESTAURANT_ID,
    }),
    false,
  );
  assert.equal(
    isSafePublishedDecorativeDeactivation({
      data: { restaurantId: "restaurant-b", type: "wall" },
      restaurantId: RESTAURANT_ID,
    }),
    false,
  );
  assert.equal(
    isSafePublishedDecorativeDeactivation({
      data: null,
      restaurantId: RESTAURANT_ID,
    }),
    false,
  );
});
