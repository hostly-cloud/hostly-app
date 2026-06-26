import {
  canvasSizeForNewFloorPlan,
  entityBelongsToFloorPlan,
  resolveFloorPlanCanvasSize,
} from "@/lib/firestore/floorPlans";
import type {
  FloorPlanWorkingDraft,
  LoadPublishedFloorPlanParams,
} from "@/lib/map/floor-plan-publish-types";

function assertNonEmptyId(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`loadPublishedFloorPlan: ${label} obligatorio`);
  }
  return trimmed;
}

function cloneElement<T extends { id: string }>(item: T): T {
  return { ...item };
}

/**
 * Construye un `FloorPlanWorkingDraft` desde datos ya cargados (sin I/O Firestore).
 *
 * Filtra elementos y zonas al `floorPlanId` usando `entityBelongsToFloorPlan`.
 * Solo incluye mesas con `isActive !== false`, alineado con `refreshElements` del editor.
 */
export function loadPublishedFloorPlan(
  params: LoadPublishedFloorPlanParams,
): FloorPlanWorkingDraft {
  const restaurantId = assertNonEmptyId(params.restaurantId, "restaurantId");
  const floorPlanId = assertNonEmptyId(params.floorPlanId, "floorPlanId");
  const floorPlans = params.floorPlans ?? [];

  const selectedPlan =
    floorPlans.find((plan) => plan.id === floorPlanId) ?? null;

  const elements = params.tables
    .filter((table) => table.isActive !== false)
    .filter((table) =>
      entityBelongsToFloorPlan(table, floorPlanId, floorPlans),
    )
    .map(cloneElement);

  const zones = params.zones
    .filter((zone) => entityBelongsToFloorPlan(zone, floorPlanId, floorPlans))
    .map(cloneElement);

  const canvas =
    params.canvas ??
    (selectedPlan
      ? resolveFloorPlanCanvasSize(selectedPlan, floorPlans)
      : canvasSizeForNewFloorPlan(floorPlans));

  return {
    floorPlanId,
    restaurantId,
    elements,
    zones,
    canvas: {
      width: canvas.width,
      height: canvas.height,
    },
    revision: 1,
    source: "published",
    publishedRevision: 1,
  };
}

/** Alias export requerido por el contrato arquitectónico. */
export const LoadPublishedFloorPlan = loadPublishedFloorPlan;
