/**
 * Resolución canónica plano TPV ↔ espacio publicado V2 + diagnóstico readonly.
 */

import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { SalaEditorPublishedDocument } from "@/lib/sala-editor/persistence/sala-editor-published-types";
import type { TpvMapSource } from "@/lib/sala-editor/persistence/sala-editor-published-types";
import {
  instanceTopLeftLayout,
  resolveInstanceLegacyTableId,
} from "@/lib/sala-editor/persistence/sala-published-geometry";

export type ReadonlyMapDiscardReason =
  | "space-mismatch"
  | "unsupported-kind"
  | "inactive-legacy"
  | "missing-link"
  | "invalid-geometry"
  | "hidden-group-secondary"
  | "invisible"
  | "disabled";

export type ReadonlyMapDiscardedId = {
  id: string;
  reason: ReadonlyMapDiscardReason;
};

export type ReadonlyMapPublishedDiag = {
  source: TpvMapSource;
  publishedExists: boolean;
  schemaVersion: number | null;
  publishedSpaceIds: string[];
  selectedPlanId: string | null;
  selectedSpaceId: string | null;
  publishedInstanceCount: number;
  publishedOperationalCount: number;
  publishedTableCount: number;
  linkedTableCount: number;
  unboundTableCount: number;
  legacyActiveTableCount: number;
  resolvedReadonlyElementCount: number;
  discarded: ReadonlyMapDiscardedId[];
};

const ORDERABLE_TYPES = new Set<OperationalElementType>([
  "TABLE",
  "HIGH_TABLE",
  "SUNBED",
  "BALINESE_BED",
  "SOFA",
  "CUSTOM",
]);

export function isOrderablePublishedType(t: OperationalElementType): boolean {
  return ORDERABLE_TYPES.has(t);
}

/** ID de floorPlan legacy al que sincroniza un espacio publicado. */
export function resolveLegacyFloorPlanIdForEspacio(
  espacio: Pick<SalaEspacio, "id" | "legacyFloorPlanId">,
): string {
  return String(espacio.legacyFloorPlanId?.trim() || espacio.id || "").trim();
}

/**
 * Resuelve el espacio V2 a partir del plano seleccionado en TPV.
 * Orden: legacyFloorPlanId → espacio.id → primer espacio visible/activo.
 */
export function resolvePublishedEspacioForTpvPlan(
  document: SalaEditorDocument | null | undefined,
  selectedPlanId: string | null | undefined,
): SalaEspacio | null {
  if (!document?.espacios?.length) return null;
  const espacios = document.espacios;
  const planId = String(selectedPlanId ?? "").trim();
  if (planId) {
    const byLegacy = espacios.find(
      (e) => resolveLegacyFloorPlanIdForEspacio(e) === planId,
    );
    if (byLegacy) return byLegacy;
    const byId = espacios.find((e) => e.id === planId);
    if (byId) return byId;
  }
  return (
    espacios.find((e) => e.visible !== false && e.active !== false) ??
    espacios[0] ??
    null
  );
}

function hasValidInstanceGeometry(instance: OperationalElementInstance): boolean {
  try {
    const layout = instanceTopLeftLayout(instance);
    return (
      Number.isFinite(layout.x) &&
      Number.isFinite(layout.y) &&
      Number.isFinite(layout.width) &&
      Number.isFinite(layout.height) &&
      layout.width > 0 &&
      layout.height > 0
    );
  } catch {
    return false;
  }
}

export function buildReadonlyMapPublishedDiag(params: {
  source: TpvMapSource;
  published: SalaEditorPublishedDocument | null | undefined;
  selectedPlanId: string | null | undefined;
  selectedSpaceId: string | null | undefined;
  /** IDs de mesas legacy activas del restaurante (cualquier plano). */
  legacyActiveTableIds: ReadonlySet<string> | string[];
  /** IDs conocidos en `tables` (activo o no). */
  legacyKnownTableIds?: ReadonlySet<string> | string[];
  /** Mesas legacy activas del plano seleccionado (contador operativo TPV). */
  legacyActiveTableCount: number;
  hiddenTableIds?: ReadonlySet<string> | string[];
}): ReadonlyMapPublishedDiag {
  const published = params.published ?? null;
  const publishedExists = Boolean(published?.document);
  const document = published?.document ?? null;
  const legacyActive = toIdSet(params.legacyActiveTableIds);
  const legacyKnown = toIdSet(params.legacyKnownTableIds);
  const hidden = toIdSet(params.hiddenTableIds);

  const publishedSpaceIds = (document?.espacios ?? []).map((e) => e.id);
  const selectedPlanId = String(params.selectedPlanId ?? "").trim() || null;
  const selectedSpaceId =
    String(params.selectedSpaceId ?? "").trim() ||
    resolvePublishedEspacioForTpvPlan(document, selectedPlanId)?.id ||
    null;

  const discarded: ReadonlyMapDiscardedId[] = [];
  const instances = document?.operationalElementInstances ?? [];
  let publishedOperationalCount = 0;
  let publishedTableCount = 0;
  let linkedTableCount = 0;
  let unboundTableCount = 0;
  let resolvedReadonlyElementCount = 0;

  // Elementos no operativos del espacio (paredes, estructurales, landscape…)
  if (document && selectedSpaceId) {
    resolvedReadonlyElementCount += (document.walls ?? []).filter(
      (w) => w.espacioId === selectedSpaceId,
    ).length;
    resolvedReadonlyElementCount += (document.structuralElements ?? []).filter(
      (e) => e.espacioId === selectedSpaceId,
    ).length;
    resolvedReadonlyElementCount += (document.landscapeElements ?? []).filter(
      (e) => e.espacioId === selectedSpaceId && e.visible !== false,
    ).length;
    resolvedReadonlyElementCount += (document.surfaceObjects ?? []).filter(
      (s) => s.espacioId === selectedSpaceId && s.visible !== false,
    ).length;
    resolvedReadonlyElementCount += (document.zones ?? []).filter(
      (z) => z.espacioId === selectedSpaceId && z.visible !== false,
    ).length;
  }

  for (const instance of instances) {
    publishedOperationalCount += 1;
    const isTableLike = isOrderablePublishedType(instance.elementType);
    if (isTableLike) publishedTableCount += 1;

    if (selectedSpaceId && instance.spaceId !== selectedSpaceId) {
      discarded.push({ id: instance.id, reason: "space-mismatch" });
      continue;
    }
    if (instance.visible === false) {
      discarded.push({ id: instance.id, reason: "invisible" });
      continue;
    }
    if (instance.enabled === false) {
      discarded.push({ id: instance.id, reason: "disabled" });
      continue;
    }
    if (!hasValidInstanceGeometry(instance)) {
      discarded.push({ id: instance.id, reason: "invalid-geometry" });
      continue;
    }

    const tableId = resolveInstanceLegacyTableId(instance);
    if (isTableLike) {
      if (tableId && hidden.has(tableId)) {
        discarded.push({ id: instance.id, reason: "hidden-group-secondary" });
        continue;
      }
      if (tableId && legacyActive.has(tableId)) {
        linkedTableCount += 1;
      } else if (tableId && legacyKnown.has(tableId)) {
        unboundTableCount += 1;
        discarded.push({ id: instance.id, reason: "inactive-legacy" });
      } else {
        unboundTableCount += 1;
        discarded.push({ id: instance.id, reason: "missing-link" });
      }
    }

    resolvedReadonlyElementCount += 1;
  }

  return {
    source: params.source,
    publishedExists,
    schemaVersion:
      typeof published?.schemaVersion === "number"
        ? published.schemaVersion
        : null,
    publishedSpaceIds,
    selectedPlanId,
    selectedSpaceId,
    publishedInstanceCount: instances.length,
    publishedOperationalCount,
    publishedTableCount,
    linkedTableCount,
    unboundTableCount,
    legacyActiveTableCount: params.legacyActiveTableCount,
    resolvedReadonlyElementCount,
    discarded,
  };
}

export function logReadonlyMapPublishedDiag(
  diag: ReadonlyMapPublishedDiag,
): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console === "undefined") return;
  const byReason: Record<string, string[]> = {};
  for (const row of diag.discarded) {
    (byReason[row.reason] ??= []).push(row.id);
  }
  console.log("[Hostly:ReadonlyMapPublishedDiag]", {
    source: diag.source,
    publishedExists: diag.publishedExists,
    schemaVersion: diag.schemaVersion,
    publishedSpaceIds: diag.publishedSpaceIds,
    selectedPlanId: diag.selectedPlanId,
    selectedSpaceId: diag.selectedSpaceId,
    publishedInstanceCount: diag.publishedInstanceCount,
    publishedOperationalCount: diag.publishedOperationalCount,
    publishedTableCount: diag.publishedTableCount,
    linkedTableCount: diag.linkedTableCount,
    unboundTableCount: diag.unboundTableCount,
    legacyActiveTableCount: diag.legacyActiveTableCount,
    resolvedReadonlyElementCount: diag.resolvedReadonlyElementCount,
    discardedByReason: byReason,
  });
}

/** Empty-state legacy solo aplica fuera de v2-published. */
export function shouldShowLegacyMapEmptyState(
  source: TpvMapSource,
  legacyVisibleTableCount: number,
): boolean {
  if (source === "v2-published") return false;
  return legacyVisibleTableCount === 0;
}

function toIdSet(
  value: ReadonlySet<string> | string[] | undefined,
): Set<string> {
  if (!value) return new Set();
  if (Array.isArray(value)) {
    return new Set(value.map((id) => String(id).trim()).filter(Boolean));
  }
  return new Set([...value].map((id) => String(id).trim()).filter(Boolean));
}
