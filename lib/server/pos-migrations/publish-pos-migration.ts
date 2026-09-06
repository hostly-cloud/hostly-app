import type { Firestore } from "firebase-admin/firestore";
import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import type {
  PosMigrationCandidate,
  PosMigrationPublishResult,
} from "@/lib/pos-migration/types";
import { loadCentralProductsAdmin } from "@/lib/server/menu-imports/load-central-products-admin";
import { loadHostlyCartaCategories } from "@/lib/server/menu-imports/load-hostly-carta-categories";

const WRITE_CHUNK_SIZE = 350;
const PUBLISH_LOCK_MS = 2 * 60 * 1000;

export class PublishPosMigrationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "PublishPosMigrationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalizeCategory(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return normalizeCategory(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "categoria";
}

function normalizeStation(value: string | null): string | null {
  if (!value) return null;
  const normalized = normalizeCategory(value);
  if (normalized.includes("coctel")) return "cocktail";
  if (normalized.includes("barra") || normalized.includes("bar")) return "bar";
  if (normalized.includes("cocina") || normalized.includes("kitchen")) return "kitchen";
  if (normalized.includes("sala") || normalized.includes("room")) return "none";
  return null;
}

function readCandidate(data: Record<string, unknown>, id: string): PosMigrationCandidate {
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((value): value is string => typeof value === "string")
    : [];
  const unit = data.unit === "kg" || data.unit === "g" || data.unit === "l" || data.unit === "ml" ? data.unit : "ud";
  const decision = data.decision === "blocked" || data.decision === "review" ? data.decision : "create";
  return {
    id,
    rowNumber: typeof data.rowNumber === "number" ? data.rowNumber : 0,
    name: typeof data.name === "string" ? data.name.trim() : "",
    category: typeof data.category === "string" && data.category.trim() ? data.category.trim() : null,
    price: typeof data.price === "number" && Number.isFinite(data.price) ? data.price : null,
    taxRate: typeof data.taxRate === "number" && Number.isFinite(data.taxRate) ? data.taxRate : null,
    cost: typeof data.cost === "number" && Number.isFinite(data.cost) ? data.cost : null,
    stock: typeof data.stock === "number" && Number.isFinite(data.stock) ? data.stock : null,
    unit,
    station: typeof data.station === "string" && data.station.trim() ? data.station.trim() : null,
    sku: typeof data.sku === "string" && data.sku.trim() ? data.sku.trim() : null,
    barcode: typeof data.barcode === "string" && data.barcode.trim() ? data.barcode.trim() : null,
    active: data.active !== false,
    decision,
    warnings,
    existingProductId:
      typeof data.existingProductId === "string" && data.existingProductId.trim()
        ? data.existingProductId.trim()
        : null,
  };
}

export async function publishPosMigration(params: {
  db: Firestore;
  restaurantId: string;
  migrationId: string;
  userId: string;
  confirmReviewItemIds?: string[];
}): Promise<PosMigrationPublishResult> {
  const restaurantId = params.restaurantId.trim();
  const migrationId = params.migrationId.trim();
  if (!migrationId) throw new PublishPosMigrationError("INVALID_MIGRATION_ID", "migrationId requerido", 400);

  const migrationRef = params.db.collection("restaurants").doc(restaurantId).collection("posMigrations").doc(migrationId);
  const migrationSnap = await migrationRef.get();
  if (!migrationSnap.exists) throw new PublishPosMigrationError("MIGRATION_NOT_FOUND", "Migración no encontrada", 404);
  const migration = migrationSnap.data() as Record<string, unknown>;
  if (migration.restaurantId !== restaurantId) {
    throw new PublishPosMigrationError("TENANT_MISMATCH", "Migración fuera del tenant", 403);
  }
  if (migration.status === "published") {
    return {
      migrationId,
      status: "published",
      alreadyPublished: true,
      createdProductIds: Array.isArray(migration.createdProductIds)
        ? migration.createdProductIds.filter((value): value is string => typeof value === "string")
        : [],
      createdCategoryIds: Array.isArray(migration.createdCategoryIds)
        ? migration.createdCategoryIds.filter((value): value is string => typeof value === "string")
        : [],
      skippedItemIds: Array.isArray(migration.skippedItemIds)
        ? migration.skippedItemIds.filter((value): value is string => typeof value === "string")
        : [],
    };
  }
  if (migration.status !== "preview") {
    throw new PublishPosMigrationError("MIGRATION_NOT_PUBLISHABLE", "La migración no está en estado de previsualización", 409);
  }
  if (migration.publishInProgress === true) {
    const updatedAt = typeof migration.updatedAt === "number" ? migration.updatedAt : 0;
    if (Date.now() - updatedAt < PUBLISH_LOCK_MS) {
      throw new PublishPosMigrationError("PUBLISH_IN_PROGRESS", "Ya hay una importación en curso", 409);
    }
  }

  await migrationRef.update({ publishInProgress: true, updatedAt: Date.now(), updatedBy: params.userId });

  const confirmedReviews = new Set((params.confirmReviewItemIds ?? []).map((id) => id.trim()).filter(Boolean));
  const itemsSnap = await migrationRef.collection("items").orderBy("rowNumber", "asc").limit(1000).get();
  const allItems = itemsSnap.docs.map((doc) => readCandidate(doc.data() as Record<string, unknown>, doc.id));
  const selectedItems = allItems.filter((item) => {
    if (item.decision === "blocked") return false;
    if (item.decision === "review" && !confirmedReviews.has(item.id)) return false;
    return Boolean(item.name);
  });
  const selectedItemIds = new Set(selectedItems.map((item) => item.id));
  const skippedItemIds = allItems.filter((item) => !selectedItemIds.has(item.id)).map((item) => item.id);

  const createdCategoryIds: string[] = [];
  const createdProductIds: string[] = [];

  try {
    const [existingProducts, existingCategories] = await Promise.all([
      loadCentralProductsAdmin(params.db, restaurantId),
      loadHostlyCartaCategories(params.db, restaurantId),
    ]);
    const existingProductNames = new Set(existingProducts.map((product) => normalizeProductName(product.name)).filter(Boolean));
    const categoryByName = new Map(existingCategories.map((category) => [normalizeCategory(category.name), category]));
    const createdCategoryRefs = new Map<string, { id: string; name: string }>();
    let nextSortOrder = existingCategories.reduce((max, category) => Math.max(max, category.sortOrder), -1) + 1;

    const requestedCategories = [...new Set(selectedItems.map((item) => item.category).filter((value): value is string => Boolean(value)))];
    for (const categoryName of requestedCategories) {
      const key = normalizeCategory(categoryName);
      const existing = categoryByName.get(key);
      if (existing) {
        createdCategoryRefs.set(key, { id: existing.id, name: existing.name });
        continue;
      }
      const ref = params.db.collection("restaurantes").doc(restaurantId).collection("cartaCategorias").doc();
      const nowIso = new Date().toISOString();
      await ref.set({
        restaurantId,
        name: categoryName,
        normalizedName: key,
        slug: `${slugify(categoryName)}-${ref.id.slice(0, 8)}`,
        type: "general",
        sortOrder: nextSortOrder,
        isActive: true,
        source: "pos_migration",
        importedFromPosMigrationId: migrationId,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdBy: params.userId,
      });
      createdCategoryIds.push(ref.id);
      await migrationRef.update({
        createdCategoryIds: [...createdCategoryIds],
        updatedAt: Date.now(),
        updatedBy: params.userId,
      });
      createdCategoryRefs.set(key, { id: ref.id, name: categoryName });
      nextSortOrder += 1;
    }

    const productWrites: { id: string; data: Record<string, unknown>; itemId: string }[] = [];
    const newlySeenNames = new Set<string>();
    for (const item of selectedItems) {
      const normalizedName = normalizeProductName(item.name);
      if (!normalizedName || (existingProductNames.has(normalizedName) && !confirmedReviews.has(item.id)) || newlySeenNames.has(normalizedName)) {
        if (!skippedItemIds.includes(item.id)) skippedItemIds.push(item.id);
        continue;
      }
      newlySeenNames.add(normalizedName);
      const productRef = params.db.collection("restaurants").doc(restaurantId).collection("products").doc();
      const category = item.category ? createdCategoryRefs.get(normalizeCategory(item.category)) : undefined;
      const station = normalizeStation(item.station);
      const inventoryEnabled = item.stock != null || item.cost != null;
      const now = Date.now();
      productWrites.push({
        id: productRef.id,
        itemId: item.id,
        data: {
          restaurantId,
          name: item.name,
          normalizedName,
          categoryId: category?.id ?? null,
          categoryName: category?.name ?? item.category ?? null,
          price: item.price,
          active: item.active,
          visibleOnMenu: true,
          ...(station ? { station } : {}),
          inventory: {
            enabled: inventoryEnabled,
            unit: item.unit,
            currentStock: item.stock ?? 0,
            minStock: 0,
            costPerUnit: item.cost ?? 0,
          },
          recipe: { enabled: false, ingredients: [] },
          importedFromPosMigrationId: migrationId,
          importedPosMigrationItemId: item.id,
          importedAt: now,
          importedBy: params.userId,
          source: "pos_migration",
          createdAt: now,
          updatedAt: now,
        },
      });
    }

    for (let offset = 0; offset < productWrites.length; offset += WRITE_CHUNK_SIZE) {
      const chunk = productWrites.slice(offset, offset + WRITE_CHUNK_SIZE);
      const batch = params.db.batch();
      const publishedAt = Date.now();
      for (const write of chunk) {
        const ref = params.db.collection("restaurants").doc(restaurantId).collection("products").doc(write.id);
        batch.set(ref, write.data);
        batch.update(migrationRef.collection("items").doc(write.itemId), {
          publishStatus: "published",
          publishedProductId: write.id,
          publishedAt,
        });
      }
      await batch.commit();
      createdProductIds.push(...chunk.map((write) => write.id));
      await migrationRef.update({
        createdProductIds: [...createdProductIds],
        createdCategoryIds: [...createdCategoryIds],
        skippedItemIds,
        updatedAt: Date.now(),
        updatedBy: params.userId,
      });
    }

    await migrationRef.update({
      status: "published",
      publishInProgress: false,
      createdProductIds,
      createdCategoryIds,
      skippedItemIds,
      publishedAt: Date.now(),
      publishedBy: params.userId,
      updatedAt: Date.now(),
      updatedBy: params.userId,
    });

    return {
      migrationId,
      status: "published",
      alreadyPublished: false,
      createdProductIds,
      createdCategoryIds,
      skippedItemIds,
    };
  } catch (error) {
    await migrationRef.update({
      status: "failed",
      publishInProgress: false,
      createdProductIds,
      createdCategoryIds,
      skippedItemIds,
      failedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: params.userId,
    }).catch(() => undefined);
    throw error;
  }
}
