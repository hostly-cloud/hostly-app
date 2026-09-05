import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const rules = fs.readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");

function rootRestaurantBlock() {
  const marker = "match /restaurants/{restaurantId} {";
  const start = rules.indexOf(marker);
  assert.notEqual(start, -1, "root restaurants rule block must exist");

  const firstNestedMatch = rules.indexOf("match /config/{groupDocId}", start);
  assert.notEqual(firstNestedMatch, -1, "restaurants config subcollection block must exist");

  return rules.slice(start, firstNestedMatch);
}

test("client SDK can never delete the root restaurant document", () => {
  const block = rootRestaurantBlock();
  assert.match(block, /allow delete:\s*if false;/);
  assert.doesNotMatch(block, /allow delete:\s*if\s+sameRestaurant/);
  assert.doesNotMatch(block, /allow delete:\s*if\s+canManageSettings/);
});

test("sensitive fiscal ledgers remain server-only", () => {
  const serverOnlyCollections = [
    "fiscalRecords",
    "fiscalOutbox",
    "fiscalDeliveryStates",
    "fiscalAeatFlowControls",
    "fiscalSubmissions",
    "fiscalChains",
    "fiscalCounters",
    "fiscalRectificationLedgers",
    "fiscalRelations",
    "fiscalCancellations",
  ];

  for (const collection of serverOnlyCollections) {
    const rule = new RegExp(
      `match\\s+\\/${collection}\\/\\{[^}]+\\}\\s*\\{\\s*allow\\s+read,\\s*create,\\s*update,\\s*delete:\\s*if\\s+false;`,
    );
    assert.match(
      rules,
      rule,
      `${collection} must remain inaccessible from the client SDK`,
    );
  }
});
