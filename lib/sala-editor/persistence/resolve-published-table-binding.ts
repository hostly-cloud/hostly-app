/**
 * Vínculo canónico instancia published TABLE → mesa runtime TPV.
 * Identidad estable: legacyTableId → instance.id. Sin match por nombre/posición.
 */

import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { Table } from "@/lib/firestore/tables";
import { resolveInstanceLegacyTableId } from "@/lib/sala-editor/persistence/sala-published-geometry";
import {
  isOrderablePublishedType,
  resolveLegacyFloorPlanIdForEspacio,
} from "@/lib/sala-editor/persistence/sala-published-readonly-resolve";

export type PublishedTableBindingExclusion =
  | "missing-runtime-table"
  | "floor-plan-mismatch"
  | "inactive-runtime-table"
  | "missing-binding"
  | "hidden-group-secondary"
  | "duplicate-binding"
  | "tenant-mismatch"
  | null;

export type PublishedTableBinding = {
  instanceId: string;
  legacyTableId: string | null;
  resolvedTableId: string | null;
  runtimeTableFound: boolean;
  runtimeFloorPlanId: string | null;
  publishedSpaceId: string;
  publishedLegacyFloorPlanId: string | null;
  interactive: boolean;
  hiddenByGroup: boolean;
  exclusionReason: PublishedTableBindingExclusion;
  runtimeTable: Table | null;
};

export function extractPublishedLegacyTableId(
  instance: OperationalElementInstance,
): string | null {
  const meta = instance.metadata ?? {};
  const legacy =
    typeof meta.legacyTableId === "string" ? meta.legacyTableId.trim() : "";
  return legacy || null;
}

/** ¿table.floorPlanId pertenece al espacio publicado (ids normalizados)? */
export function runtimeTableMatchesPublishedEspacio(
  table: Pick<Table, "floorPlanId">,
  espacio: Pick<SalaEspacio, "id" | "legacyFloorPlanId">,
): boolean {
  const fp =
    typeof table.floorPlanId === "string" ? table.floorPlanId.trim() : "";
  if (!fp) return true;
  const canonical = resolveLegacyFloorPlanIdForEspacio(espacio);
  return fp === espacio.id || (Boolean(canonical) && fp === canonical);
}

export function resolvePublishedTableBinding(params: {
  instance: OperationalElementInstance;
  runtimeTablesById: ReadonlyMap<string, Table>;
  activeSpace: Pick<SalaEspacio, "id" | "legacyFloorPlanId">;
  restaurantId: string;
  hiddenTableIds?: ReadonlySet<string>;
  /** IDs ya vinculados en este espacio (detecta duplicate-binding). */
  claimedTableIds?: ReadonlySet<string>;
}): PublishedTableBinding {
  const { instance, activeSpace } = params;
  const publishedSpaceId = activeSpace.id;
  const publishedLegacyFloorPlanId =
    String(activeSpace.legacyFloorPlanId ?? "").trim() || null;
  const legacyFromMeta = extractPublishedLegacyTableId(instance);
  const fallbackId = String(instance.id ?? "").trim() || null;
  const candidateId = legacyFromMeta || fallbackId;

  const base: PublishedTableBinding = {
    instanceId: instance.id,
    legacyTableId: legacyFromMeta,
    resolvedTableId: candidateId,
    runtimeTableFound: false,
    runtimeFloorPlanId: null,
    publishedSpaceId,
    publishedLegacyFloorPlanId,
    interactive: false,
    hiddenByGroup: false,
    exclusionReason: "missing-binding",
    runtimeTable: null,
  };

  if (!candidateId) {
    return { ...base, resolvedTableId: null, exclusionReason: "missing-binding" };
  }

  if (params.hiddenTableIds?.has(candidateId)) {
    return {
      ...base,
      hiddenByGroup: true,
      exclusionReason: "hidden-group-secondary",
    };
  }

  if (params.claimedTableIds?.has(candidateId)) {
    return {
      ...base,
      exclusionReason: "duplicate-binding",
    };
  }

  const runtime = params.runtimeTablesById.get(candidateId) ?? null;
  if (!runtime) {
    return {
      ...base,
      exclusionReason: "missing-runtime-table",
    };
  }

  const runtimeFloorPlanId =
    typeof runtime.floorPlanId === "string"
      ? runtime.floorPlanId.trim() || null
      : null;

  if (
    params.restaurantId &&
    String(runtime.restaurantId ?? "").trim() !== params.restaurantId.trim()
  ) {
    return {
      ...base,
      runtimeTableFound: true,
      runtimeFloorPlanId,
      runtimeTable: runtime,
      exclusionReason: "tenant-mismatch",
    };
  }

  if (!runtimeTableMatchesPublishedEspacio(runtime, activeSpace)) {
    return {
      ...base,
      runtimeTableFound: true,
      runtimeFloorPlanId,
      runtimeTable: runtime,
      exclusionReason: "floor-plan-mismatch",
    };
  }

  if (runtime.isActive === false) {
    return {
      ...base,
      runtimeTableFound: true,
      runtimeFloorPlanId,
      runtimeTable: runtime,
      exclusionReason: "inactive-runtime-table",
    };
  }

  return {
    ...base,
    runtimeTableFound: true,
    runtimeFloorPlanId,
    runtimeTable: runtime,
    interactive: true,
    exclusionReason: null,
  };
}

export type PublishedOperationalTablesResult = {
  bindings: PublishedTableBinding[];
  /** Mesas runtime únicas e interactivas (para contadores / overlays). */
  boundTables: Table[];
  interactiveTableIds: Set<string>;
};

/**
 * Mesas published del espacio activo ∩ bindings runtime válidos.
 * Dedup por resolvedTableId (primera instancia gana).
 */
export function collectPublishedOperationalTables(params: {
  instances: readonly OperationalElementInstance[];
  activeSpace: Pick<SalaEspacio, "id" | "legacyFloorPlanId">;
  runtimeTables: readonly Table[];
  restaurantId: string;
  hiddenTableIds?: ReadonlySet<string> | string[];
}): PublishedOperationalTablesResult {
  const spaceId = params.activeSpace.id;
  const runtimeTablesById = new Map<string, Table>();
  for (const t of params.runtimeTables) {
    const id = String(t.id ?? "").trim();
    if (id) runtimeTablesById.set(id, t);
  }
  const hidden = toHiddenSet(params.hiddenTableIds);
  const claimed = new Set<string>();
  const bindings: PublishedTableBinding[] = [];
  const boundTables: Table[] = [];
  const interactiveTableIds = new Set<string>();

  for (const instance of params.instances) {
    if (instance.spaceId !== spaceId) continue;
    if (!isOrderablePublishedType(instance.elementType)) continue;
    if (instance.visible === false) continue;

    const binding = resolvePublishedTableBinding({
      instance,
      runtimeTablesById,
      activeSpace: params.activeSpace,
      restaurantId: params.restaurantId,
      hiddenTableIds: hidden,
      claimedTableIds: claimed,
    });
    bindings.push(binding);

    if (binding.interactive && binding.runtimeTable && binding.resolvedTableId) {
      claimed.add(binding.resolvedTableId);
      interactiveTableIds.add(binding.resolvedTableId);
      boundTables.push(binding.runtimeTable);
    }
  }

  return { bindings, boundTables, interactiveTableIds };
}

/** Compat: ID de mesa preferido para overlays/click (legacyTableId o instance.id). */
export function resolvePublishedInstanceTableId(
  instance: OperationalElementInstance,
): string {
  return resolveInstanceLegacyTableId(instance);
}

export function logReadonlyMapTableBinding(
  binding: PublishedTableBinding,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console === "undefined") return;
  console.log("[Hostly:ReadonlyMapTableBinding]", {
    instanceId: binding.instanceId,
    legacyTableId: binding.legacyTableId,
    resolvedTableId: binding.resolvedTableId,
    runtimeTableFound: binding.runtimeTableFound,
    runtimeFloorPlanId: binding.runtimeFloorPlanId,
    publishedSpaceId: binding.publishedSpaceId,
    publishedLegacyFloorPlanId: binding.publishedLegacyFloorPlanId,
    interactive: binding.interactive,
    hiddenByGroup: binding.hiddenByGroup,
    exclusionReason: binding.exclusionReason,
  });
}

function toHiddenSet(
  value: ReadonlySet<string> | string[] | undefined,
): Set<string> {
  if (!value) return new Set();
  if (Array.isArray(value)) {
    return new Set(value.map((id) => String(id).trim()).filter(Boolean));
  }
  return new Set([...value].map((id) => String(id).trim()).filter(Boolean));
}
