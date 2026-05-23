import type { Firestore } from "firebase-admin/firestore";
import type { CatalogMigrationConfig } from "@/lib/carta/catalog-migration-preview-types";

function configRef(db: Firestore, restaurantId: string) {
  return db
    .collection("restaurants")
    .doc(restaurantId.trim())
    .collection("config")
    .doc("catalogMigration");
}

export async function getCatalogMigrationConfig(
  db: Firestore,
  restaurantId: string,
): Promise<CatalogMigrationConfig | null> {
  const rid = restaurantId.trim();
  if (!rid) return null;
  try {
    const snap = await configRef(db, rid).get();
    if (!snap.exists) return null;
    const data = snap.data() as Record<string, unknown>;
    if (data.status !== "completed") return null;
    const completedAt =
      typeof data.completedAt === "number" && Number.isFinite(data.completedAt)
        ? data.completedAt
        : 0;
    const completedBy =
      typeof data.completedBy === "string" ? data.completedBy.trim() : "";
    if (!completedAt || !completedBy) return null;
    return {
      status: "completed",
      completedAt,
      completedBy,
      createdCount: readCount(data.createdCount),
      skippedCount: readCount(data.skippedCount),
      blockedCount: readCount(data.blockedCount),
      legacyCount: readCount(data.legacyCount),
      duplicateCount: readCount(data.duplicateCount),
      errorCount: readCount(data.errorCount),
    };
  } catch {
    return null;
  }
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export async function saveCatalogMigrationConfig(
  db: Firestore,
  restaurantId: string,
  config: CatalogMigrationConfig,
): Promise<void> {
  const rid = restaurantId.trim();
  if (!rid) return;
  await configRef(db, rid).set(config, { merge: false });
}
