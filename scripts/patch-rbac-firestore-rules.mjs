import fs from "node:fs";

const path = "firestore.rules";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`RBAC_RULE_PATCH_MISSING:${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`RBAC_RULE_PATCH_AMBIGUOUS:${label}`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
`    function canManageSupplierInvoices() {
      return isManagerOrAbove();
    }
`,
`    function canManageSupplierInvoices() {
      return isManagerOrAbove();
    }

    function canManageReservations() {
      return canonicalNormalizedRole().matches('^(owner|admin|manager|waiter)$');
    }

    function canAuditOperations() {
      return canonicalNormalizedRole().matches('^(owner|admin|manager)$');
    }

    function canManageCatalog() {
      return isManagerOrAbove();
    }
`,
"capability-helpers",
);

replaceOnce(
`    // PRODUCTS
    match /products/{productId} {
      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId);
      allow update: if sameRestaurant(resource.data.restaurantId)
        && request.resource.data.restaurantId == resource.data.restaurantId;
      allow delete: if sameRestaurant(resource.data.restaurantId);
    }
`,
`    // PRODUCTS (legacy root collection): lectura operativa, escritura manager+.
    match /products/{productId} {
      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId)
        && canManageCatalog();
      allow update: if sameRestaurant(resource.data.restaurantId)
        && request.resource.data.restaurantId == resource.data.restaurantId
        && canManageCatalog();
      allow delete: if sameRestaurant(resource.data.restaurantId)
        && canManageCatalog();
    }
`,
"legacy-products",
);

replaceOnce(
`      // Registro operacional append-only (trazabilidad multi-tablet).
      match /activityLogs/{logId} {
        allow read: if sameRestaurant(restaurantId);
        allow create: if sameRestaurant(restaurantId)
          && request.resource.data.restaurantId == restaurantId;
        allow update, delete: if false;
      }
`,
`      // Registro operacional append-only: solo supervisión puede leerlo.
      match /activityLogs/{logId} {
        allow read: if sameRestaurant(restaurantId) && canAuditOperations();
        allow create: if sameRestaurant(restaurantId)
          && request.resource.data.restaurantId == restaurantId;
        allow update, delete: if false;
      }
`,
"activity-logs",
);

replaceOnce(
`      // Sesiones activas por dispositivo/pestaña (trazabilidad operacional).
      match /activeSessions/{sessionId} {
        allow read: if sameRestaurant(restaurantId);
        allow create: if sameRestaurant(restaurantId)
          && request.resource.data.restaurantId == restaurantId;
        allow update: if sameRestaurant(restaurantId)
          && resource.data.restaurantId == restaurantId
          && request.resource.data.restaurantId == resource.data.restaurantId;
        allow delete: if sameRestaurant(restaurantId)
          && resource.data.restaurantId == restaurantId;
      }
`,
`      // Sesiones: cada dispositivo mantiene su presencia; solo supervisión las lista.
      match /activeSessions/{sessionId} {
        allow read: if sameRestaurant(restaurantId) && canAuditOperations();
        allow create: if sameRestaurant(restaurantId)
          && request.resource.data.restaurantId == restaurantId;
        allow update: if sameRestaurant(restaurantId)
          && resource.data.restaurantId == restaurantId
          && request.resource.data.restaurantId == resource.data.restaurantId;
        allow delete: if sameRestaurant(restaurantId)
          && resource.data.restaurantId == restaurantId;
      }
`,
"active-sessions",
);

replaceOnce(
`    // RESERVATIONS
    match /reservations/{reservationId} {
      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId);
      allow update: if sameRestaurant(resource.data.restaurantId)
        && request.resource.data.restaurantId == resource.data.restaurantId;
      allow delete: if false;
    }
`,
`    // RESERVATIONS — mutaciones exclusivamente vía API Admin server-authoritative.
    match /reservations/{reservationId} {
      allow read: if sameRestaurant(resource.data.restaurantId)
        && canManageReservations();
      allow create, update, delete: if false;
    }
`,
"reservations",
);

replaceOnce(
`      match /floorPlanSnapshots/{snapshotId} {
        allow read: if sameRestaurant(restaurantId);
        allow create: if sameRestaurant(restaurantId)
          && request.resource.data.restaurantId == restaurantId;
        allow update: if sameRestaurant(restaurantId)
          && resource.data.restaurantId == restaurantId
          && request.resource.data.restaurantId == restaurantId;
        allow delete: if false;
      }
`,
`      match /floorPlanSnapshots/{snapshotId} {
        allow read: if sameRestaurant(restaurantId);
        allow create: if sameRestaurant(restaurantId)
          && canManageSettings()
          && request.resource.data.restaurantId == restaurantId;
        allow update: if sameRestaurant(restaurantId)
          && canManageSettings()
          && resource.data.restaurantId == restaurantId
          && request.resource.data.restaurantId == restaurantId;
        allow delete: if false;
      }
`,
"floor-plan-snapshots",
);

replaceOnce(
`    // FLOOR PLAN ZONES
    match /zones/{zoneId} {
      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId);
      allow update: if sameRestaurant(resource.data.restaurantId)
        && request.resource.data.restaurantId == resource.data.restaurantId;
      allow delete: if false;
    }

    // FLOOR PLANS
    match /floorPlans/{floorPlanId} {
      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId);
      allow update: if sameRestaurant(resource.data.restaurantId)
        && request.resource.data.restaurantId == resource.data.restaurantId;
      allow delete: if false;
    }
`,
`    // FLOOR PLAN ZONES — el editor de sala es configuración owner/admin.
    match /zones/{zoneId} {
      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId)
        && canManageSettings();
      allow update: if sameRestaurant(resource.data.restaurantId)
        && request.resource.data.restaurantId == resource.data.restaurantId
        && canManageSettings();
      allow delete: if false;
    }

    // FLOOR PLANS — el editor de sala es configuración owner/admin.
    match /floorPlans/{floorPlanId} {
      allow read: if sameRestaurant(resource.data.restaurantId);
      allow create: if sameRestaurant(request.resource.data.restaurantId)
        && canManageSettings();
      allow update: if sameRestaurant(resource.data.restaurantId)
        && request.resource.data.restaurantId == resource.data.restaurantId
        && canManageSettings();
      allow delete: if false;
    }
`,
"floor-plan-root",
);

fs.writeFileSync(path, source);
console.log("RBAC Firestore rules patched successfully");
