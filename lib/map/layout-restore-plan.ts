import {
  entityBelongsToFloorPlan,
  type FloorPlan,
} from "@/lib/firestore/floorPlans";
import type { FloorPlanSnapshotFloorPlan } from "@/lib/firestore/floor-plan-snapshots";
import {
  getDefaultSizeForPlanElementType,
  isDecorativePlanElementType,
  type PlanElementType,
  type Table,
} from "@/lib/firestore/tables";
import type { Zone } from "@/lib/firestore/zones";

/** Campos de geometría/layout restaurados desde snapshot (sin runtime operacional). */
export type LayoutElementLayoutFields = {
  name: string;
  type: PlanElementType;
  tableShape: Table["tableShape"];
  seats: number;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
  floorPlanId?: string;
  zoneId?: string;
  zoneName?: string;
  zone?: string;
};

export type LayoutElementCreateOp = {
  id: string;
  payload: LayoutElementLayoutFields & {
    restaurantId: string;
    isActive: true;
  };
  clearZone: boolean;
};

export type LayoutElementUpdateOp = {
  id: string;
  payload: LayoutElementLayoutFields & { isActive: true };
  clearZone: boolean;
};

export type LayoutElementSoftDisableOp = {
  id: string;
};

export type LayoutZoneLayoutFields = {
  name: string;
  floorPlanId?: string;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type LayoutZoneCreateOp = {
  id: string;
  payload: LayoutZoneLayoutFields & { restaurantId: string };
};

export type LayoutZoneUpdateOp = {
  id: string;
  payload: LayoutZoneLayoutFields;
};

export type LayoutFloorPlanUpdateOp = {
  floorPlanId: string;
  width?: number;
  height?: number;
};

export type LayoutRestorePlan = {
  restaurantId: string;
  floorPlanId: string;
  floorPlanUpdate: LayoutFloorPlanUpdateOp | null;
  elementCreates: LayoutElementCreateOp[];
  elementUpdates: LayoutElementUpdateOp[];
  elementSoftDisables: LayoutElementSoftDisableOp[];
  zoneCreates: LayoutZoneCreateOp[];
  zoneUpdates: LayoutZoneUpdateOp[];
  /** Zonas live del plano que no están en el snapshot (sin mutación automática en v1). */
  unchangedLiveZoneIds: string[];
};

export type ComputeLayoutRestorePlanInput = {
  snapshot: FloorPlanSnapshotFloorPlan;
  liveElements: readonly Table[];
  liveZones: readonly Zone[];
  allFloorPlans: readonly FloorPlan[];
};

function roundDim(n: number): number {
  return Math.round(n);
}

function extractZoneLayoutFields(zone: Zone): LayoutZoneLayoutFields {
  const out: LayoutZoneLayoutFields = {
    name: String(zone.name ?? "").trim(),
  };
  const floorPlanId =
    typeof zone.floorPlanId === "string" ? zone.floorPlanId.trim() : "";
  if (floorPlanId) out.floorPlanId = floorPlanId;
  const color = typeof zone.color === "string" ? zone.color.trim() : "";
  if (color) out.color = color;
  if (typeof zone.x === "number" && Number.isFinite(zone.x)) {
    out.x = roundDim(zone.x);
  }
  if (typeof zone.y === "number" && Number.isFinite(zone.y)) {
    out.y = roundDim(zone.y);
  }
  if (typeof zone.width === "number" && Number.isFinite(zone.width)) {
    out.width = roundDim(zone.width);
  }
  if (typeof zone.height === "number" && Number.isFinite(zone.height)) {
    out.height = roundDim(zone.height);
  }
  return out;
}

function zonesLayoutEqual(a: LayoutZoneLayoutFields, b: LayoutZoneLayoutFields): boolean {
  return (
    a.name === b.name &&
    (a.floorPlanId ?? "") === (b.floorPlanId ?? "") &&
    (a.color ?? "") === (b.color ?? "") &&
    (a.x ?? null) === (b.x ?? null) &&
    (a.y ?? null) === (b.y ?? null) &&
    (a.width ?? null) === (b.width ?? null) &&
    (a.height ?? null) === (b.height ?? null)
  );
}

function extractElementLayoutFields(el: Table): LayoutElementLayoutFields {
  const decorative = isDecorativePlanElementType(el.type);
  const def = getDefaultSizeForPlanElementType(el.type);
  const zoneId = typeof el.zoneId === "string" ? el.zoneId.trim() : "";
  const zoneName = typeof el.zoneName === "string" ? el.zoneName.trim() : "";
  const zoneRaw = typeof el.zone === "string" ? el.zone.trim() : "";
  const floorPlanId =
    typeof el.floorPlanId === "string" ? el.floorPlanId.trim() : "";

  const out: LayoutElementLayoutFields = {
    name: String(el.name ?? "").trim(),
    type: el.type,
    tableShape: el.tableShape ?? "square",
    seats: decorative ? 0 : (el.seats ?? 4),
    x: roundDim(el.x ?? 0),
    y: roundDim(el.y ?? 0),
    width: roundDim(el.width ?? def.width),
    height: roundDim(el.height ?? def.height),
    locked: el.locked === true,
  };

  if (floorPlanId) out.floorPlanId = floorPlanId;
  if (zoneId && zoneName) {
    out.zoneId = zoneId;
    out.zoneName = zoneName;
    out.zone = zoneRaw || zoneName;
  }

  return out;
}

function elementsLayoutEqual(
  a: LayoutElementLayoutFields,
  b: LayoutElementLayoutFields,
): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.tableShape === b.tableShape &&
    a.seats === b.seats &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.locked === b.locked &&
    (a.floorPlanId ?? "") === (b.floorPlanId ?? "") &&
    (a.zoneId ?? "") === (b.zoneId ?? "") &&
    (a.zoneName ?? "") === (b.zoneName ?? "") &&
    (a.zone ?? "") === (b.zone ?? "")
  );
}

function hasZoneAssignment(fields: LayoutElementLayoutFields): boolean {
  const zoneId = fields.zoneId?.trim() ?? "";
  const zoneName = fields.zoneName?.trim() ?? "";
  return zoneId !== "" && zoneName !== "";
}

/**
 * Calcula el plan de restore snapshot → live state.
 * Función pura: no escribe en Firestore.
 */
export function computeLayoutRestorePlan(
  input: ComputeLayoutRestorePlanInput,
): LayoutRestorePlan {
  const { snapshot, liveElements, liveZones, allFloorPlans } = input;

  const floorPlanId = String(snapshot.plan.id ?? "").trim();
  const restaurantId = String(snapshot.plan.restaurantId ?? "").trim();
  if (!floorPlanId) {
    throw new Error("layout-restore-plan: snapshot.plan.id obligatorio");
  }
  if (!restaurantId) {
    throw new Error("layout-restore-plan: snapshot.plan.restaurantId obligatorio");
  }

  const snapshotElements = snapshot.elements.filter((el) => {
    const id = String(el.id ?? "").trim();
    if (!id) return false;
    return entityBelongsToFloorPlan(el, floorPlanId, [...allFloorPlans]);
  });

  const snapshotZones = snapshot.zones.filter((z) => {
    const id = String(z.id ?? "").trim();
    if (!id) return false;
    return entityBelongsToFloorPlan(z, floorPlanId, [...allFloorPlans]);
  });

  const liveById = new Map<string, Table>();
  for (const el of liveElements) {
    const id = String(el.id ?? "").trim();
    if (id) liveById.set(id, el);
  }

  const liveOnPlan = liveElements.filter((el) =>
    entityBelongsToFloorPlan(el, floorPlanId, [...allFloorPlans]),
  );

  const snapshotElementIds = new Set(
    snapshotElements.map((el) => String(el.id).trim()),
  );

  const elementCreates: LayoutElementCreateOp[] = [];
  const elementUpdates: LayoutElementUpdateOp[] = [];

  for (const snapEl of snapshotElements) {
    const id = String(snapEl.id).trim();
    const layout = extractElementLayoutFields(snapEl);
    const clearZone = !hasZoneAssignment(layout);
    const live = liveById.get(id);

    if (!live) {
      elementCreates.push({
        id,
        clearZone,
        payload: {
          ...layout,
          restaurantId,
          isActive: true,
        },
      });
      continue;
    }

    const liveLayout = extractElementLayoutFields(live);
    const needsUpdate =
      !elementsLayoutEqual(layout, liveLayout) || live.isActive === false;

    if (needsUpdate) {
      elementUpdates.push({
        id,
        clearZone,
        payload: {
          ...layout,
          isActive: true,
        },
      });
    }
  }

  const elementSoftDisables: LayoutElementSoftDisableOp[] = [];
  for (const liveEl of liveOnPlan) {
    const id = String(liveEl.id).trim();
    if (!id || snapshotElementIds.has(id)) continue;
    if (liveEl.isActive === false) continue;
    elementSoftDisables.push({ id });
  }

  const liveZoneById = new Map<string, Zone>();
  for (const z of liveZones) {
    const id = String(z.id ?? "").trim();
    if (id) liveZoneById.set(id, z);
  }

  const snapshotZoneIds = new Set(snapshotZones.map((z) => String(z.id).trim()));
  const zoneCreates: LayoutZoneCreateOp[] = [];
  const zoneUpdates: LayoutZoneUpdateOp[] = [];

  for (const snapZone of snapshotZones) {
    const id = String(snapZone.id).trim();
    const layout = extractZoneLayoutFields(snapZone);
    const live = liveZoneById.get(id);

    if (!live) {
      zoneCreates.push({
        id,
        payload: {
          ...layout,
          restaurantId,
        },
      });
      continue;
    }

    const liveLayout = extractZoneLayoutFields(live);
    if (!zonesLayoutEqual(layout, liveLayout)) {
      zoneUpdates.push({ id, payload: layout });
    }
  }

  const unchangedLiveZoneIds: string[] = [];
  for (const liveZone of liveZones) {
    const id = String(liveZone.id ?? "").trim();
    if (!id) continue;
    if (!entityBelongsToFloorPlan(liveZone, floorPlanId, [...allFloorPlans])) {
      continue;
    }
    if (!snapshotZoneIds.has(id)) {
      unchangedLiveZoneIds.push(id);
    }
  }

  const planWidth =
    typeof snapshot.plan.width === "number" && Number.isFinite(snapshot.plan.width)
      ? roundDim(snapshot.plan.width)
      : undefined;
  const planHeight =
    typeof snapshot.plan.height === "number" && Number.isFinite(snapshot.plan.height)
      ? roundDim(snapshot.plan.height)
      : undefined;

  const floorPlanUpdate: LayoutFloorPlanUpdateOp | null =
    planWidth !== undefined || planHeight !== undefined
      ? {
          floorPlanId,
          ...(planWidth !== undefined ? { width: planWidth } : {}),
          ...(planHeight !== undefined ? { height: planHeight } : {}),
        }
      : null;

  return {
    restaurantId,
    floorPlanId,
    floorPlanUpdate,
    elementCreates,
    elementUpdates,
    elementSoftDisables,
    zoneCreates,
    zoneUpdates,
    unchangedLiveZoneIds,
  };
}

/** Total de operaciones de escritura que generará el plan (para chunking). */
export function countLayoutRestoreWriteOps(plan: LayoutRestorePlan): number {
  let n = 0;
  if (plan.floorPlanUpdate) n += 1;
  n += plan.elementCreates.length;
  n += plan.elementUpdates.length;
  n += plan.elementSoftDisables.length;
  n += plan.zoneCreates.length;
  n += plan.zoneUpdates.length;
  return n;
}
