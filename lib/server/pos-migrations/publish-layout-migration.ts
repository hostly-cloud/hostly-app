import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import type { PosLayoutCandidate, PosLayoutPublishResult } from "@/lib/pos-migration/layout-types";

const WRITE_CHUNK_SIZE = 300;
const DEFAULT_CANVAS_WIDTH = 1800;
const DEFAULT_CANVAS_HEIGHT = 1200;
const DEFAULT_TABLE_WIDTH = 116;
const DEFAULT_TABLE_HEIGHT = 76;

export class PublishPosLayoutMigrationError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "PublishPosLayoutMigrationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "plano";
}

function readItem(data: Record<string, unknown>, id: string): PosLayoutCandidate {
  const warnings = Array.isArray(data.warnings)
    ? data.warnings.filter((value): value is string => typeof value === "string")
    : [];
  const shape = data.shape === "round" || data.shape === "rect" ? data.shape : "square";
  const decision = data.decision === "blocked" || data.decision === "review" ? data.decision : "create";
  const finite = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    id,
    rowNumber: typeof data.rowNumber === "number" ? data.rowNumber : 0,
    sourceName: typeof data.sourceName === "string" ? data.sourceName.trim() : "",
    finalName: typeof data.finalName === "string" ? data.finalName.trim() : "",
    floorPlanName: typeof data.floorPlanName === "string" && data.floorPlanName.trim() ? data.floorPlanName.trim() : "Principal",
    zoneName: typeof data.zoneName === "string" && data.zoneName.trim() ? data.zoneName.trim() : "Principal",
    seats: typeof data.seats === "number" && Number.isFinite(data.seats) ? Math.max(1, Math.min(20, Math.round(data.seats))) : 4,
    x: finite(data.x),
    y: finite(data.y),
    width: finite(data.width),
    height: finite(data.height),
    shape,
    decision,
    warnings,
  };
}

function autoPosition(index: number): { x: number; y: number } {
  const columns = 8;
  const gapX = 170;
  const gapY = 125;
  return {
    x: 80 + (index % columns) * gapX,
    y: 90 + Math.floor(index / columns) * gapY,
  };
}

export async function publishPosLayoutMigration(params: {
  db: Firestore;
  restaurantId: string;
  migrationId: string;
  userId: string;
  confirmReviewItemIds?: string[];
}): Promise<PosLayoutPublishResult> {
  const restaurantId = params.restaurantId.trim();
  const migrationId = params.migrationId.trim();
  if (!migrationId) throw new PublishPosLayoutMigrationError("INVALID_MIGRATION_ID", "migrationId requerido", 400);

  const migrationRef = params.db.collection("restaurants").doc(restaurantId).collection("posMigrations").doc(migrationId);
  const migrationSnap = await migrationRef.get();
  if (!migrationSnap.exists) throw new PublishPosLayoutMigrationError("MIGRATION_NOT_FOUND", "Migración no encontrada", 404);
  const migration = migrationSnap.data() as Record<string, unknown>;
  if (migration.restaurantId !== restaurantId || migration.migrationKind !== "layout") {
    throw new PublishPosLayoutMigrationError("TENANT_OR_KIND_MISMATCH", "Migración no válida para este restaurante", 403);
  }
  if (migration.status === "published") {
    const strings = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
    return {
      migrationId,
      status: "published",
      alreadyPublished: true,
      createdFloorPlanIds: strings(migration.createdFloorPlanIds),
      createdZoneIds: strings(migration.createdZoneIds),
      createdTableIds: strings(migration.createdTableIds),
      skippedItemIds: strings(migration.skippedItemIds),
    };
  }
  if (migration.status !== "preview") {
    throw new PublishPosLayoutMigrationError("MIGRATION_NOT_PUBLISHABLE", "La migración no está en previsualización", 409);
  }

  const confirmed = new Set((params.confirmReviewItemIds ?? []).map((value) => value.trim()).filter(Boolean));
  const itemSnap = await migrationRef.collection("layoutItems").orderBy("rowNumber", "asc").limit(500).get();
  const allItems = itemSnap.docs.map((doc) => readItem(doc.data() as Record<string, unknown>, doc.id));
  const selected = allItems.filter((item) => item.decision === "create" || (item.decision === "review" && confirmed.has(item.id)));
  const selectedIds = new Set(selected.map((item) => item.id));
  const skippedItemIds = allItems.filter((item) => !selectedIds.has(item.id)).map((item) => item.id);

  const createdFloorPlanIds: string[] = [];
  const createdZoneIds: string[] = [];
  const createdTableIds: string[] = [];
  await migrationRef.update({ publishInProgress: true, updatedAt: Date.now(), updatedBy: params.userId });

  try {
    const [plansSnap, zonesSnap, tablesSnap] = await Promise.all([
      params.db.collection("floorPlans").where("restaurantId", "==", restaurantId).get(),
      params.db.collection("zones").where("restaurantId", "==", restaurantId).get(),
      params.db.collection("tables").where("restaurantId", "==", restaurantId).get(),
    ]);

    const plansByName = new Map<string, { id: string; name: string }>();
    plansSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (name) plansByName.set(normalize(name), { id: doc.id, name });
    });
    let nextPlanSort = plansSnap.docs.reduce((max, doc) => {
      const value = (doc.data() as Record<string, unknown>).sortOrder;
      return Math.max(max, typeof value === "number" && Number.isFinite(value) ? value : -1);
    }, -1) + 1;

    for (const planName of [...new Set(selected.map((item) => item.floorPlanName))]) {
      const key = normalize(planName);
      if (plansByName.has(key)) continue;
      const ref = params.db.collection("floorPlans").doc();
      await ref.set({
        restaurantId,
        name: planName,
        slug: `${slugify(planName)}-${ref.id.slice(0, 6)}`,
        active: true,
        showInTpv: true,
        isDefault: plansSnap.empty && createdFloorPlanIds.length === 0,
        sortOrder: nextPlanSort++,
        width: DEFAULT_CANVAS_WIDTH,
        height: DEFAULT_CANVAS_HEIGHT,
        source: "pos_migration",
        importedFromPosMigrationId: migrationId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      createdFloorPlanIds.push(ref.id);
      plansByName.set(key, { id: ref.id, name: planName });
      await migrationRef.update({ createdFloorPlanIds: [...createdFloorPlanIds], updatedAt: Date.now() });
    }

    const zonesByKey = new Map<string, { id: string; name: string }>();
    zonesSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const floorPlanId = typeof data.floorPlanId === "string" ? data.floorPlanId.trim() : "";
      if (name) zonesByKey.set(`${floorPlanId}::${normalize(name)}`, { id: doc.id, name });
    });

    for (const item of selected) {
      const plan = plansByName.get(normalize(item.floorPlanName));
      if (!plan) continue;
      const zoneKey = `${plan.id}::${normalize(item.zoneName)}`;
      if (zonesByKey.has(zoneKey)) continue;
      const ref = params.db.collection("zones").doc();
      await ref.set({
        restaurantId,
        name: item.zoneName,
        floorPlanId: plan.id,
        source: "pos_migration",
        importedFromPosMigrationId: migrationId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      createdZoneIds.push(ref.id);
      zonesByKey.set(zoneKey, { id: ref.id, name: item.zoneName });
      await migrationRef.update({ createdZoneIds: [...createdZoneIds], updatedAt: Date.now() });
    }

    const existingNames = new Set(
      tablesSnap.docs
        .map((doc) => (doc.data() as Record<string, unknown>).name)
        .filter((value): value is string => typeof value === "string")
        .map(normalize),
    );
    const writes: { ref: DocumentReference; item: PosLayoutCandidate; data: Record<string, unknown> }[] = [];
    selected.forEach((item, index) => {
      if (!item.finalName || existingNames.has(normalize(item.finalName))) {
        if (!skippedItemIds.includes(item.id)) skippedItemIds.push(item.id);
        return;
      }
      existingNames.add(normalize(item.finalName));
      const plan = plansByName.get(normalize(item.floorPlanName));
      if (!plan) return;
      const zone = zonesByKey.get(`${plan.id}::${normalize(item.zoneName)}`);
      const fallback = autoPosition(index);
      const ref = params.db.collection("tables").doc();
      writes.push({
        ref,
        item,
        data: {
          id: ref.id,
          restaurantId,
          name: item.finalName,
          type: "table",
          status: "free",
          floorPlanId: plan.id,
          zone: item.zoneName,
          zoneId: zone?.id ?? null,
          zoneName: zone?.name ?? item.zoneName,
          tableShape: item.shape === "round" ? "round" : "square",
          shape: item.shape,
          seats: item.seats,
          x: Math.round(item.x ?? fallback.x),
          y: Math.round(item.y ?? fallback.y),
          width: Math.round(item.width ?? DEFAULT_TABLE_WIDTH),
          height: Math.round(item.height ?? DEFAULT_TABLE_HEIGHT),
          isActive: true,
          source: "pos_migration",
          importedFromPosMigrationId: migrationId,
          importedPosMigrationItemId: item.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      });
    });

    for (let offset = 0; offset < writes.length; offset += WRITE_CHUNK_SIZE) {
      const chunk = writes.slice(offset, offset + WRITE_CHUNK_SIZE);
      const batch = params.db.batch();
      for (const write of chunk) {
        batch.set(write.ref, write.data);
        batch.update(migrationRef.collection("layoutItems").doc(write.item.id), {
          publishStatus: "published",
          publishedTableId: write.ref.id,
          publishedAt: Date.now(),
        });
      }
      await batch.commit();
      createdTableIds.push(...chunk.map((write) => write.ref.id));
      await migrationRef.update({
        createdTableIds: [...createdTableIds],
        createdZoneIds: [...createdZoneIds],
        createdFloorPlanIds: [...createdFloorPlanIds],
        skippedItemIds,
        updatedAt: Date.now(),
      });
    }

    await migrationRef.update({
      status: "published",
      publishInProgress: false,
      createdFloorPlanIds,
      createdZoneIds,
      createdTableIds,
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
      createdFloorPlanIds,
      createdZoneIds,
      createdTableIds,
      skippedItemIds,
    };
  } catch (error) {
    await migrationRef.update({
      status: "failed",
      publishInProgress: false,
      createdFloorPlanIds,
      createdZoneIds,
      createdTableIds,
      skippedItemIds,
      failedAt: Date.now(),
      updatedAt: Date.now(),
      updatedBy: params.userId,
    }).catch(() => undefined);
    throw error;
  }
}
