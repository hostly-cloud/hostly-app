import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import {
  mapPreparationAreaToStation,
  mapStationToPreparationArea,
} from "@/lib/carta/map-station-to-preparation-area";
import type {
  CatalogMigrationConfig,
  CatalogMigrationCreatedItem,
  CatalogMigrationErrorItem,
  CatalogMigrationExecuteResult,
  CatalogMigrationSkippedItem,
  CatalogMigrationToCreateItem,
} from "@/lib/carta/catalog-migration-preview-types";
import {
  inferTipoVentaFromCartaText,
  parseTipoVentaLoose,
} from "@/lib/carta/product-sale-contract";
import { categoryMatchKey } from "@/lib/server/menu-imports/normalize-category-name";
import type { Firestore } from "firebase-admin/firestore";
import {
  buildCatalogMigrationPreview,
  BuildCatalogMigrationPreviewError,
} from "./build-catalog-migration-preview";
import {
  getCatalogMigrationConfig,
  saveCatalogMigrationConfig,
} from "./catalog-migration-config";

const BATCH_CHUNK_SIZE = 100;

export class MigrateLegacyCatalogError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "MigrateLegacyCatalogError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type CentralMigrationIndex = {
  ids: Set<string>;
  legacyPlatoIds: Set<string>;
  dupKeys: Set<string>;
};

function duplicateKey(name: string, categoryName: string): string {
  const n = normalizeProductName(name);
  const c = categoryMatchKey(categoryName || "General");
  return `${n}|${c}`;
}

async function loadCentralMigrationIndex(
  db: Firestore,
  restaurantId: string,
): Promise<CentralMigrationIndex> {
  const snap = await db
    .collection("restaurants")
    .doc(restaurantId.trim())
    .collection("products")
    .limit(500)
    .get();

  const ids = new Set<string>();
  const legacyPlatoIds = new Set<string>();
  const dupKeys = new Set<string>();

  for (const doc of snap.docs) {
    ids.add(doc.id);
    const data = doc.data() as Record<string, unknown>;
    const name =
      typeof data.name === "string" && data.name.trim()
        ? data.name.trim()
        : typeof data.nombre === "string" && data.nombre.trim()
          ? data.nombre.trim()
          : "";
    const categoryName =
      typeof data.categoryName === "string" && data.categoryName.trim()
        ? data.categoryName.trim()
        : "General";
    if (name) dupKeys.add(duplicateKey(name, categoryName));
    const legacyId =
      typeof data.legacyPlatoId === "string" && data.legacyPlatoId.trim()
        ? data.legacyPlatoId.trim()
        : "";
    if (legacyId) legacyPlatoIds.add(legacyId);
  }

  return { ids, legacyPlatoIds, dupKeys };
}

function buildMigratedProductDocument(args: {
  restaurantId: string;
  item: CatalogMigrationToCreateItem;
  userId: string;
  now: number;
}): Record<string, unknown> {
  const { item, restaurantId, userId, now } = args;
  const areaRaw = item.preparationArea?.trim().toLowerCase() || null;
  const preparationArea =
    mapStationToPreparationArea(areaRaw) ??
    (areaRaw === "cocina" || areaRaw === "barra" || areaRaw === "cocteleria"
      ? areaRaw
      : undefined);
  const station = mapPreparationAreaToStation(preparationArea ?? areaRaw);
  const tipoVenta =
    parseTipoVentaLoose(item.tipoVenta) ??
    inferTipoVentaFromCartaText(item.categoryName, item.name);

  return {
    restaurantId: restaurantId.trim(),
    name: item.name,
    normalizedName: normalizeProductName(item.name),
    ...(item.categoryId ? { categoryId: item.categoryId } : {}),
    categoryName: item.categoryName,
    price: item.price,
    ...(station ? { station } : {}),
    ...(preparationArea ? { preparationArea } : {}),
    tipoVenta,
    visibleOnMenu: item.legacyActivo,
    active: item.legacyActivo,
    migratedFromLocalStorage: true,
    legacyPlatoId: item.legacyPlatoId,
    migratedAt: now,
    migratedBy: userId,
    inventory: {
      enabled: false,
      unit: "ud",
      currentStock: 0,
      minStock: 0,
      costPerUnit: 0,
    },
    recipe: {
      enabled: false,
      ingredients: [],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function skipItem(
  skipped: CatalogMigrationSkippedItem[],
  item: CatalogMigrationToCreateItem,
  reason: CatalogMigrationSkippedItem["reason"],
): void {
  skipped.push({
    legacyPlatoId: item.legacyPlatoId,
    name: item.name,
    reason,
  });
}

export async function migrateLegacyCatalog(args: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  legacyPlatosRaw: unknown;
}): Promise<CatalogMigrationExecuteResult> {
  const restaurantId = args.restaurantId.trim();
  const userId = args.userId.trim();
  if (!restaurantId || !userId) {
    throw new MigrateLegacyCatalogError("INVALID_CONTEXT", "Contexto inválido", 400);
  }

  const existingConfig = await getCatalogMigrationConfig(args.db, restaurantId);
  if (existingConfig?.status === "completed") {
    throw new MigrateLegacyCatalogError(
      "ALREADY_MIGRATED",
      "Este restaurante ya completó la migración de catálogo legacy",
      409,
    );
  }

  const preview = await buildCatalogMigrationPreview({
    db: args.db,
    restaurantId,
    legacyPlatosRaw: args.legacyPlatosRaw,
  });

  const now = Date.now();
  const created: CatalogMigrationCreatedItem[] = [];
  const skipped: CatalogMigrationSkippedItem[] = [];
  const errors: CatalogMigrationErrorItem[] = [];

  let index = await loadCentralMigrationIndex(args.db, restaurantId);
  const productsCol = args.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("products");

  const toCreate = preview.toCreate;
  for (let i = 0; i < toCreate.length; i += 1) {
    const item = toCreate[i]!;
    const productId = item.legacyPlatoId.trim();
    if (!productId) {
      errors.push({
        legacyPlatoId: item.legacyPlatoId,
        name: item.name,
        error: "INVALID_LEGACY_ID",
      });
      continue;
    }

    if (index.ids.has(productId)) {
      skipItem(skipped, item, "duplicate_id");
      continue;
    }
    if (index.legacyPlatoIds.has(productId)) {
      skipItem(skipped, item, "duplicate_legacy_plato_id");
      continue;
    }
    const dupKey = duplicateKey(item.name, item.categoryName);
    if (index.dupKeys.has(dupKey)) {
      skipItem(skipped, item, "duplicate_name_category");
      continue;
    }

    const ref = productsCol.doc(productId);
    try {
      const existingSnap = await ref.get();
      if (existingSnap.exists) {
        skipItem(skipped, item, "duplicate_id");
        index.ids.add(productId);
        continue;
      }

      const docData = buildMigratedProductDocument({
        restaurantId,
        item,
        userId,
        now,
      });
      await ref.create(docData);

      created.push({
        legacyPlatoId: item.legacyPlatoId,
        productId,
        name: item.name,
      });
      index.ids.add(productId);
      index.legacyPlatoIds.add(productId);
      index.dupKeys.add(dupKey);
    } catch (e) {
      const message = e instanceof Error ? e.message : "CREATE_FAILED";
      if (/already exists/i.test(message)) {
        skipItem(skipped, item, "already_migrated");
        index.ids.add(productId);
        continue;
      }
      errors.push({
        legacyPlatoId: item.legacyPlatoId,
        name: item.name,
        error: message,
      });
    }

    if ((i + 1) % BATCH_CHUNK_SIZE === 0) {
      index = await loadCentralMigrationIndex(args.db, restaurantId);
    }
  }

  const migrationConfig: CatalogMigrationConfig = {
    status: "completed",
    completedAt: now,
    completedBy: userId,
    createdCount: created.length,
    skippedCount:
      skipped.length + preview.duplicates.length + preview.blocked.length,
    blockedCount: preview.blocked.length,
    legacyCount: preview.totals.legacyProcessed,
    duplicateCount: preview.duplicates.length,
    errorCount: errors.length,
  };

  await saveCatalogMigrationConfig(args.db, restaurantId, migrationConfig);

  return {
    preview,
    created,
    skipped,
    errors,
    migrationConfig,
  };
}
