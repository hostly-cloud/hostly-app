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
    const marker = `match /${collection}/{`;
    const start = rules.indexOf(marker);
    assert.notEqual(start, -1, `${collection} rules must exist`);
    const block = rules.slice(start, rules.indexOf("}", start) + 1);
    assert.match(
      block,
      /allow read, create, update, delete:\s*if false;/,
      `${collection} must remain inaccessible from the client SDK`,
    );
  }
});
