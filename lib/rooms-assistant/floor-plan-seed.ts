import type { RoomsAssistantDraft } from "./draft";
import { buildLayoutFromDraft } from "./floor-plan-seed-layout";
import type { FloorPlanSeedFromDraft } from "./floor-plan-seed-types";

export type {
  FloorPlanSeedElement,
  FloorPlanSeedFromDraft,
  FloorPlanSeedRect,
  FloorPlanSeedZone,
  FloorPlanSeedZoneKey,
} from "./floor-plan-seed-types";

export function draftIncludesKitchen(draft: RoomsAssistantDraft): boolean {
  const doors = Array.isArray(draft.structuralElements?.doors)
    ? draft.structuralElements.doors
    : [];
  const pickup = draft.serviceElements?.pickup;
  const waiterStation = draft.serviceElements?.waiterStation;
  return (
    doors.includes("kitchen") ||
    pickup === "kitchen" ||
    pickup === "both" ||
    waiterStation === "kitchen"
  );
}

export function draftIncludesReception(draft: RoomsAssistantDraft): boolean {
  const reception = draft.serviceElements?.reception;
  return reception === "entrance" || reception === "inside";
}

export function draftIncludesBar(draft: RoomsAssistantDraft): boolean {
  const serviceBar = draft.serviceElements?.bar;
  return (
    draft.generatedPlan?.hasBar === true ||
    (serviceBar !== null && serviceBar !== undefined && serviceBar !== "none") ||
    (draft.tables.barSeating !== null && draft.tables.barSeating !== "none")
  );
}

/**
 * Traduce el borrador del asistente a un plano inicial legible (sin persistencia).
 * La Fase 3 sustituirá esto por un algoritmo definitivo.
 */
export function buildFloorPlanSeedFromDraft(
  draft: RoomsAssistantDraft,
  _floorPlanId: string,
): FloorPlanSeedFromDraft {
  void _floorPlanId;
  if (!draft || typeof draft !== "object") {
    return { zones: [], elements: [] };
  }
  return buildLayoutFromDraft({
    draft,
    hasBar: draftIncludesBar(draft),
    hasKitchen: draftIncludesKitchen(draft),
    hasReception: draftIncludesReception(draft),
    hasTerrace: draft.generatedPlan?.hasTerrace === true,
    hasOutdoor: draft.generatedPlan?.hasOutdoor === true,
  });
}
