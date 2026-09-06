import type { Firestore } from "firebase-admin/firestore";
import type { PosLayoutRollbackResult } from "@/lib/pos-migration/layout-types";

export class RollbackPosLayoutMigrationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "RollbackPosLayoutMigrationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function readIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

export async function rollbackPosLayoutMigration(params: {
  db: Firestore;
  restaurantId: string;
  migrationId: string;
  userId: string;
}): Promise<PosLayoutRollbackResult> {
  const restaurantId = params.restaurantId.trim();
  const migrationId = params.migrationId.trim();
  if (!migrationId) throw new RollbackPosLayoutMigrationError("INVALID_MIGRATION_ID", "migrationId requerido", 400);

  const migrationRef = params.db.collection("restaurants").doc(restaurantId).collection("posMigrations").doc(migrationId);
  const snap = await migrationRef.get();
  if (!snap.exists) throw new RollbackPosLayoutMigrationError("MIGRATION_NOT_FOUND", "Migración no encontrada", 404);
  const migration = snap.data() as Record<string, unknown>;
  if (migration.restaurantId !== restaurantId || migration.migrationKind !== "layout") {
    throw new RollbackPosLayoutMigrationError("TENANT_OR_KIND_MISMATCH", "Migración no válida para este restaurante", 403);
  }
  if (migration.status === "rolled_back") {
    return {
      migrationId,
      status: "rolled_back",
      alreadyRolledBack: true,
      deletedFloorPlanIds: readIds(migration.rolledBackFloorPlanIds),
      deletedZoneIds: readIds(migration.rolledBackZoneIds),
      deletedTableIds: readIds(migration.rolledBackTableIds),
    };
  }
  if (migration.status !== "published" && migration.status !== "failed") {
    throw new RollbackPosLayoutMigrationError("MIGRATION_NOT_ROLLBACKABLE", "La migración no tiene cambios publicados que deshacer", 409);
  }

  const deletedTableIds: string[] = [];
  const deletedZoneIds: string[] = [];
  const deletedFloorPlanIds: string[] = [];

  for (const tableId of readIds(migration.createdTableIds)) {
    const ref = params.db.collection("tables").doc(tableId);
    const table = await ref.get();
    if (!table.exists) continue;
    const data = table.data() as Record<string, unknown>;
    if (data.restaurantId !== restaurantId || data.importedFromPosMigrationId !== migrationId) continue;
    await ref.delete();
    deletedTableIds.push(tableId);
  }

  for (const zoneId of readIds(migration.createdZoneIds)) {
    const ref = params.db.collection("zones").doc(zoneId);
    const zone = await ref.get();
    if (!zone.exists) continue;
    const data = zone.data() as Record<string, unknown>;
    if (data.restaurantId !== restaurantId || data.importedFromPosMigrationId !== migrationId) continue;
    const references = await params.db.collection("tables").where("restaurantId", "==", restaurantId).where("zoneId", "==", zoneId).limit(1).get();
    if (!references.empty) continue;
    await ref.delete();
    deletedZoneIds.push(zoneId);
  }

  for (const floorPlanId of readIds(migration.createdFloorPlanIds)) {
    const ref = params.db.collection("floorPlans").doc(floorPlanId);
    const plan = await ref.get();
    if (!plan.exists) continue;
    const data = plan.data() as Record<string, unknown>;
    if (data.restaurantId !== restaurantId || data.importedFromPosMigrationId !== migrationId) continue;
    const [tables, zones] = await Promise.all([
      params.db.collection("tables").where("restaurantId", "==", restaurantId).where("floorPlanId", "==", floorPlanId).limit(1).get(),
      params.db.collection("zones").where("restaurantId", "==", restaurantId).where("floorPlanId", "==", floorPlanId).limit(1).get(),
    ]);
    if (!tables.empty || !zones.empty) continue;
    await ref.delete();
    deletedFloorPlanIds.push(floorPlanId);
  }

  await migrationRef.update({
    status: "rolled_back",
    rolledBackAt: Date.now(),
    rolledBackBy: params.userId,
    rolledBackTableIds: deletedTableIds,
    rolledBackZoneIds: deletedZoneIds,
    rolledBackFloorPlanIds: deletedFloorPlanIds,
    updatedAt: Date.now(),
    updatedBy: params.userId,
  });

  return {
    migrationId,
    status: "rolled_back",
    alreadyRolledBack: false,
    deletedFloorPlanIds,
    deletedZoneIds,
    deletedTableIds,
  };
}
