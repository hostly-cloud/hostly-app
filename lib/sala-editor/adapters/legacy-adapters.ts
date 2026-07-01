/**
 * Adaptadores puros entre modelo legacy (FloorPlan, Zone, PlanElementType)
 * y el contrato canónico del editor de sala.
 *
 * Solo lectura / transformación en memoria. No Firestore.
 */

import type { FloorPlan } from "@/lib/firestore/floorPlans";
import type { PlanElementType } from "@/lib/firestore/tables";
import type { Zone } from "@/lib/firestore/zones";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { DEFAULT_SALA_ESPACIO_COLOR } from "@/lib/sala-editor/types/espacio";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaOperationalElementKind } from "@/lib/sala-editor/types/elementos-operativos";

/** Plano legacy → espacio de primer nivel (restaurante multi-plano). */
export function legacyFloorPlanToSalaEspacio(plan: FloorPlan): SalaEspacio {
  return {
    id: plan.id,
    restaurantId: plan.restaurantId,
    name: plan.name,
    color: DEFAULT_SALA_ESPACIO_COLOR,
    sortOrder: plan.sortOrder ?? 0,
    visible: plan.showInTpv !== false,
    active: plan.active !== false,
    legacyFloorPlanId: plan.id,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

/** Zona legacy → espacio dentro de un plano (subdivisión visual). */
export function legacyZoneToSalaEspacio(
  zone: Zone,
  sortOrder: number,
): SalaEspacio {
  return {
    id: zone.id,
    restaurantId: zone.restaurantId,
    name: zone.name,
    color: zone.color?.trim() || DEFAULT_SALA_ESPACIO_COLOR,
    sortOrder,
    visible: true,
    active: true,
    legacyZoneId: zone.id,
    legacyFloorPlanId: zone.floorPlanId,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

export type LegacyPlanElementClassification =
  | { layer: "estructura"; kind: SalaStructuralElementKind }
  | { layer: "operacion"; kind: SalaOperationalElementKind };

const LEGACY_STRUCTURAL_MAP: Partial<
  Record<PlanElementType, SalaStructuralElementKind>
> = {
  wall: "wall",
  bar: "bar",
  door: "door",
  planter: "planter",
  column: "decoration",
  pool: "decoration",
};

const LEGACY_OPERATIONAL_MAP: Partial<
  Record<PlanElementType, SalaOperationalElementKind>
> = {
  table: "table",
  sunbed: "sunbed",
  bed: "balinese-bed",
  custom: "custom",
};

/** Clasifica un `PlanElementType` legacy en capa estructural u operativa. */
export function classifyLegacyPlanElementType(
  type: PlanElementType,
): LegacyPlanElementClassification | null {
  const structural = LEGACY_STRUCTURAL_MAP[type];
  if (structural) return { layer: "estructura", kind: structural };

  const operational = LEGACY_OPERATIONAL_MAP[type];
  if (operational) return { layer: "operacion", kind: operational };

  return null;
}

export function legacyFloorPlansToSalaEspacios(
  plans: FloorPlan[],
): SalaEspacio[] {
  return plans.map(legacyFloorPlanToSalaEspacio);
}

export function legacyZonesToSalaEspacios(zones: Zone[]): SalaEspacio[] {
  return zones.map((zone, index) => legacyZoneToSalaEspacio(zone, index * 10));
}
