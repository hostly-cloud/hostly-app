import type { Firestore } from "firebase-admin/firestore";
import type { PosMigrationRollbackResult } from "@/lib/pos-migration/types";

export class RollbackPosMigrationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "RollbackPosMigrationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

export async function rollbackPosMigration(params: {
  db: Firestore;
  restaurantId: string;
  migrationId: string;
  userId: string;
}): Promise<PosMigrationRollbackResult> {
  const restaurantId = params.restaurantId.trim();
  const migrationId = params.migrationId.trim();
  if (!migrationId) throw new RollbackPosMigrationError("INVALID_MIGRATION_ID", "migrationId requerido", 400);

  const migrationRef = params.db.collection("restaurants").doc(restaurantId).collection("posMigrations").doc(migrationId);
  const migrationSnap = await migrationRef.get();
  if (!migrationSnap.exists) throw new RollbackPosMigrationError("MIGRATION_NOT_FOUND", "Migración no encontrada", 404);
  const migration = migrationSnap.data() as Record<string, unknown>;
  if (migration.restaurantId !== restaurantId) {
    throw new RollbackPosMigrationError("TENANT_MISMATCH", "Migración fuera del tenant", 403);
  }
  if (migration.status === "rolled_back") {
    return {
      migrationId,
      status: "rolled_back",
      alreadyRolledBack: true,
      deletedProductIds: readStringArray(migration.rolledBackProductIds),
      deletedCategoryIds: readStringArray(migration.rolledBackCategoryIds),
    };
  }
  if (migration.status !== "published" && migration.status !== "failed") {
    throw new RollbackPosMigrationError("MIGRATION_NOT_ROLLBACKABLE", "La migración no tiene cambios publicados que deshacer", 409);
  }

  const createdProductIds = readStringArray(migration.createdProductIds);
  const createdCategoryIds = readStringArray(migration.createdCategoryIds);
  const deletedProductIds: string[] = [];
  const deletedCategoryIds: string[] = [];

  for (const productId of createdProductIds) {
    const ref = params.db.collection("restaurants").doc(restaurantId).collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown>;
    if (data.importedFromPosMigrationId !== migrationId) continue;
    await ref.delete();
    deletedProductIds.push(productId);
  }

  for (const categoryId of createdCategoryIds) {
    const ref = params.db.collection("restaurantes").doc(restaurantId).collection("cartaCategorias").doc(categoryId);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const data = snap.data() as Record<string, unknown>;
    if (data.importedFromPosMigrationId !== migrationId) continue;
    const references = await params.db
      .collection("restaurants")
      .doc(restaurantId)
      .collection("products")
      .where("categoryId", "==", categoryId)
      .limit(1)
      .get();
    if (!references.empty) continue;
    await ref.delete();
    deletedCategoryIds.push(categoryId);
  }

  await migrationRef.update({
    status: "rolled_back",
    rolledBackAt: Date.now(),
    rolledBackBy: params.userId,
    rolledBackProductIds: deletedProductIds,
    rolledBackCategoryIds: deletedCategoryIds,
    updatedAt: Date.now(),
    updatedBy: params.userId,
  });

  return {
    migrationId,
    status: "rolled_back",
    alreadyRolledBack: false,
    deletedProductIds,
    deletedCategoryIds,
  };
}
