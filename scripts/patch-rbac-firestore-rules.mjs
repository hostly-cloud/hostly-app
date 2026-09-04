import fs from "node:fs";

const catalogApiFiles = [
  "app/api/carta-categorias/route.ts",
  "app/api/carta-categorias/[id]/route.ts",
  "app/api/carta-categorias/reorder/route.ts",
  "app/api/carta-familias/route.ts",
  "app/api/carta-familias/[id]/route.ts",
  "app/api/carta-familias/reorder/route.ts",
];

for (const path of catalogApiFiles) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes('"settings.manage"')) {
    throw new Error(`RBAC_CATALOG_API_EXPECTED_SETTINGS_CAPABILITY:${path}`);
  }
  fs.writeFileSync(path, source.replaceAll('"settings.manage"', '"catalog.manage"'));
}

const rulesPath = "firestore.rules";
let rules = fs.readFileSync(rulesPath, "utf8");
const startMarker = "    // TABLES — lifecycle server-owned (status/groupId/mainTableId vía API TPV).\n";
const endMarker = "    // FLOOR PLAN ZONES — el editor de sala es configuración owner/admin.\n";
const start = rules.indexOf(startMarker);
const end = rules.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error("RBAC_TABLE_RULE_BLOCK_NOT_FOUND");
}

const tableBlock = `    // TABLES — lifecycle server-owned (status/groupId/mainTableId vía API TPV).
    match /tables/{tableId} {
      function isAllowedTableClientUpdate() {
        let affected = request.resource.data.diff(resource.data).affectedKeys();
        let after = request.resource.data;
        let before = resource.data;
        return resource != null
          && before.keys().hasAny(['restaurantId'])
          && after.keys().hasAny(['restaurantId'])
          && after.restaurantId == before.restaurantId
          && sameRestaurant(before.restaurantId)
          && !affected.hasAny([
            'status',
            'occupied',
            'available',
            'free',
            'closed',
            'groupId',
            'mainTableId',
          ])
          && (
            (canSellTpv() && affected.hasOnly([
              'guestCount',
              'dinersCount',
              'assignedOperatorId',
              'assignedOperatorName',
              'assignedAt',
              'updatedAt',
              'notes',
              'metadata',
            ]))
            ||
            (canManageSettings() && affected.hasOnly([
              'name',
              'label',
              'zoneId',
              'zoneName',
              'guestCount',
              'dinersCount',
              'assignedOperatorId',
              'assignedOperatorName',
              'assignedAt',
              'updatedAt',
              'x',
              'y',
              'width',
              'height',
              'rotation',
              'shape',
              'capacity',
              'notes',
              'metadata',
            ]))
          );
      }

      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId)
        && canManageSettings();
      allow update: if isAllowedTableClientUpdate();
      allow delete: if false;
    }

`;

rules = rules.slice(0, start) + tableBlock + rules.slice(end);
fs.writeFileSync(rulesPath, rules);
console.log("RBAC catalog API and table rule alignment applied");
