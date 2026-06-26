import {
  deleteField,
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  getDefaultSizeForPlanElementType,
  isDecorativePlanElementType,
  TABLE_MAP_STATUS_FREE,
  type PlanElementType,
} from "@/lib/firestore/tables";
import type {
  PublishFloorPlanParams,
  PublishFloorPlanResult,
} from "@/lib/map/floor-plan-publish-types";

/** Espejo de `minSizeForPlanType` en `app/dashboard/config/mesas/page.tsx`. */
function minSizeForPlanType(t: PlanElementType): { w: number; h: number } {
  if (t === "sunbed") return { w: 64, h: 28 };
  if (t === "bed") return { w: 72, h: 44 };
  if (t === "wall") return { w: 10, h: 4 };
  if (t === "bar") return { w: 44, h: 16 };
  if (t === "column") return { w: 10, h: 10 };
  if (t === "pool") return { w: 48, h: 28 };
  if (t === "door") return { w: 10, h: 10 };
  if (t === "planter") return { w: 12, h: 8 };
  return { w: 36, h: 36 };
}

const idempotencyCache = new Map<
  string,
  { at: number; result: PublishFloorPlanResult }
>();

const IDEMPOTENCY_TTL_MS = 60_000;

function readCachedPublish(idempotencyKey: string): PublishFloorPlanResult | null {
  const entry = idempotencyCache.get(idempotencyKey);
  if (!entry) return null;
  if (Date.now() - entry.at > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(idempotencyKey);
    return null;
  }
  return entry.result;
}

function cachePublishResult(
  idempotencyKey: string,
  result: PublishFloorPlanResult,
): void {
  idempotencyCache.set(idempotencyKey, { at: Date.now(), result });
}

/**
 * Iteración 1 — fachada de publicación sobre el batch actual del editor.
 *
 * **Escribe (Firestore):**
 * - `floorPlans/{floorPlanId}` — width/height del canvas, updatedAt
 * - `tables/{id}` — merge de todos los `workingDraft.elements` (estado global del editor)
 * - `tables/{id}` — soft-delete (`isActive: false`) de baseline ausente en working draft
 * - `zones/{id}` — update/set solo de zonas con diff vs `loadedBaseline`
 *
 * **No escribe:**
 * - sessionStorage, activityLogs, `config/floorPlanLayouts`, snapshots
 * - `setAsDefaultForTpv` (pendiente iteración 2)
 * - campos operativos TPV en mesa (`dinersCount`, `waiterId`, …) salvo los del payload layout
 *
 * **Pendiente iteraciones futuras:**
 * - Publicación atómica scoped solo al plano (sin elementos de otros planos en el batch)
 * - Eliminar writes parciales del seed del asistente (`createZone` inmediato)
 * - Idempotencia server-side / `publishedRevision` en documento
 * - Chunking >500 ops, conflict detection, activityLog
 */
export async function publishFloorPlan(
  params: PublishFloorPlanParams,
): Promise<PublishFloorPlanResult> {
  const restaurantId = params.restaurantId.trim();
  const floorPlanId = params.floorPlanId.trim();
  const idempotencyKey = params.idempotencyKey?.trim() || undefined;

  if (!restaurantId) {
    return {
      status: "failed",
      floorPlanId,
      publishedRevision: params.workingDraft.publishedRevision ?? 0,
      error: {
        code: "invalid_params",
        message: "restaurantId es obligatorio",
        retryable: false,
      },
      idempotencyKey,
    };
  }

  if (params.options?.areaTemplateBusy) {
    return {
      status: "skipped",
      floorPlanId,
      publishedRevision: params.workingDraft.publishedRevision ?? 0,
      error: {
        code: "area_template_busy",
        message: "Espera a que termine de crearse la zona antes de guardar.",
        retryable: true,
      },
      idempotencyKey,
    };
  }

  if (idempotencyKey) {
    const cached = readCachedPublish(idempotencyKey);
    if (cached) {
      return cached;
    }
  }

  const elements = params.workingDraft.elements;
  const zones = params.workingDraft.zones;
  const loadedElements = params.loadedBaseline.elements;
  const loadedZones = params.loadedBaseline.zones;
  const canvas = params.workingDraft.canvas;

  const batch = writeBatch(db);
  let zonesWritten = 0;
  let deactivated = 0;

  if (floorPlanId) {
    batch.set(
      doc(db, "floorPlans", floorPlanId),
      {
        id: floorPlanId,
        restaurantId,
        width: canvas.width,
        height: canvas.height,
        updatedAt: serverTimestamp(),
      } as DocumentData,
      { merge: true },
    );
  }

  const loadedById: Record<string, (typeof elements)[number]> = {};
  for (const el of loadedElements) loadedById[el.id] = el;

  const currentIds = new Set(elements.map((e) => e.id));
  for (const oldId of Object.keys(loadedById)) {
    if (!currentIds.has(oldId)) {
      batch.update(doc(db, "tables", oldId), {
        isActive: false,
        updatedAt: serverTimestamp(),
      } as DocumentData);
      deactivated += 1;
    }
  }

  for (const el of elements) {
    const ref = doc(db, "tables", el.id);
    const def = getDefaultSizeForPlanElementType(el.type);
    const mins = minSizeForPlanType(el.type);
    const width = Math.max(mins.w, Math.round(el.width ?? def.width));
    const height = Math.max(mins.h, Math.round(el.height ?? def.height));
    const decorative = isDecorativePlanElementType(el.type);
    const payload: DocumentData = {
      id: el.id,
      restaurantId,
      name: String(el.name ?? "").trim(),
      type: el.type,
      status: el.status ?? TABLE_MAP_STATUS_FREE,
      tableShape: el.tableShape ?? "square",
      seats: decorative ? 0 : (el.seats ?? 4),
      x: Math.round(el.x ?? 0),
      y: Math.round(el.y ?? 0),
      width,
      height,
      isActive: el.isActive !== false,
      locked: el.locked === true,
      updatedAt: serverTimestamp(),
    };
    if (el.zoneId && el.zoneName) {
      payload.zoneId = el.zoneId;
      payload.zoneName = el.zoneName;
      payload.zone = el.zoneName;
    } else {
      payload.zoneId = deleteField();
      payload.zoneName = deleteField();
      payload.zone = deleteField();
    }
    if (typeof el.floorPlanId === "string" && el.floorPlanId.trim() !== "") {
      payload.floorPlanId = el.floorPlanId.trim();
    } else {
      payload.floorPlanId = deleteField();
    }
    if (!loadedById[el.id]) payload.createdAt = serverTimestamp();
    batch.set(ref, payload, { merge: true });
  }

  const loadedZonesById: Record<string, (typeof zones)[number]> = {};
  for (const z of loadedZones) loadedZonesById[z.id] = z;

  for (const z of zones) {
    const before = loadedZonesById[z.id];
    const changed =
      !before ||
      before.name !== z.name ||
      (before.floorPlanId ?? "") !== (z.floorPlanId ?? "") ||
      (before.color ?? "") !== (z.color ?? "") ||
      (before.x ?? null) !== (z.x ?? null) ||
      (before.y ?? null) !== (z.y ?? null) ||
      (before.width ?? null) !== (z.width ?? null) ||
      (before.height ?? null) !== (z.height ?? null);
    if (!changed) continue;

    const zref = doc(db, "zones", z.id);
    const up: DocumentData = {
      name: z.name,
      updatedAt: serverTimestamp(),
    };
    if (z.floorPlanId && z.floorPlanId.trim()) {
      up.floorPlanId = z.floorPlanId.trim();
    } else {
      up.floorPlanId = deleteField();
    }
    if (z.color && z.color.trim()) up.color = z.color.trim();
    else up.color = deleteField();
    if (
      typeof z.x === "number" &&
      typeof z.y === "number" &&
      typeof z.width === "number" &&
      typeof z.height === "number" &&
      Number.isFinite(z.x) &&
      Number.isFinite(z.y) &&
      Number.isFinite(z.width) &&
      Number.isFinite(z.height)
    ) {
      up.x = Math.round(z.x);
      up.y = Math.round(z.y);
      up.width = Math.round(z.width);
      up.height = Math.round(z.height);
    } else {
      up.x = deleteField();
      up.y = deleteField();
      up.width = deleteField();
      up.height = deleteField();
    }
    if (before) {
      batch.update(zref, up);
    } else {
      batch.set(
        zref,
        {
          ...up,
          id: z.id,
          restaurantId,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
    zonesWritten += 1;
  }

  try {
    await batch.commit();
    const publishedRevision = (params.workingDraft.publishedRevision ?? 1) + 1;
    const result: PublishFloorPlanResult = {
      status: "success",
      floorPlanId,
      publishedRevision,
      counts: {
        tables: elements.length,
        zones: zones.length,
        zonesWritten,
        deactivated,
      },
      idempotencyKey,
    };
    if (idempotencyKey) cachePublishResult(idempotencyKey, result);
    return result;
  } catch (error) {
    console.error("[PublishFloorPlan] batch failed", error);
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      floorPlanId,
      publishedRevision: params.workingDraft.publishedRevision ?? 0,
      error: {
        code: "batch_commit_failed",
        message,
        retryable: true,
      },
      idempotencyKey,
    };
  }
}

/** Alias export requerido por el contrato arquitectónico. */
export const PublishFloorPlan = publishFloorPlan;
