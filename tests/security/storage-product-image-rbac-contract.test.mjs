import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rules = readFileSync(new URL("../../storage.rules", import.meta.url), "utf8");

function blockBetween(start, end) {
  const startIndex = rules.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing rules block: ${start}`);
  const endIndex = rules.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing rules boundary after: ${start}`);
  return rules.slice(startIndex, endIndex);
}

test("central product image assets allow manager+ while preserving tenant checks", () => {
  const catalogAssetFn = blockBetween(
    "function canManageCatalogAssets()",
    "function isAllowedRasterImageContentType()",
  );
  assert.match(catalogAssetFn, /normalizedRole\(\) == 'owner'/);
  assert.match(catalogAssetFn, /normalizedRole\(\) == 'admin'/);
  assert.match(catalogAssetFn, /normalizedRole\(\) == 'manager'/);

  const productImages = blockBetween(
    "match /restaurants/{restaurantId}/products/{productId}/{fileName}",
    "// Logo del restaurante",
  );
  assert.match(productImages, /sameRestaurant\(restaurantId\)/);
  assert.match(productImages, /canManageCatalogAssets\(\)/);
  assert.match(productImages, /isValidImageUpload\(\)/);
});

test("manager catalog permission does not broaden menu imports, logos or legacy uid assets", () => {
  const menuImports = blockBetween(
    "match /restaurants/{restaurantId}/menu-imports/{draftId}/{fileName}",
    "// Imágenes de producto — catálogo central.",
  );
  const logos = rules.slice(rules.indexOf("match /restaurant-logos/{restaurantId}/{fileName}"));
  const legacy = blockBetween(
    "match /productos/{userId}/{allPaths=**}",
    "// Importación de carta",
  );

  for (const protectedBlock of [menuImports, logos, legacy]) {
    assert.match(protectedBlock, /canManageStoredAssets\(\)/);
    assert.doesNotMatch(protectedBlock, /canManageCatalogAssets\(\)/);
  }
});
