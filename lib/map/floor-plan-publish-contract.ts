/**
 * Contrato de publicación de planos — Iteración 1
 *
 * Ubicación: `lib/map/` (no `lib/rooms-assistant/`).
 *
 * **Por qué `lib/map`:**
 * - El flujo editor ↔ Firestore ↔ TPV es dominio de mapa/plano, no solo del wizard.
 * - `lib/map` ya contiene utilidades de layout (`layout-restore-plan`, labels, spatial).
 * - `lib/rooms-assistant` queda acotado al input del asistente (futuro: produce WorkingDraft).
 *
 * **Iteración 1:** fachada sin cambiar semántica UX. `publishFloorPlan` envuelve el batch
 * legacy de `handleSavePlanChanges`. `loadPublishedFloorPlan` normaliza datos ya cargados.
 *
 * @see docs (futuro) `16_HOSTLY_FLOOR_PLAN_PUBLISH_SPEC.md`
 */

export type {
  FloorPlanDraftCanvas,
  FloorPlanDraftElement,
  FloorPlanDraftSource,
  FloorPlanDraftZone,
  FloorPlanLoadedBaseline,
  FloorPlanWorkingDraft,
  LoadPublishedFloorPlanParams,
  PublishFloorPlanError,
  PublishFloorPlanOptions,
  PublishFloorPlanParams,
  PublishFloorPlanResult,
} from "@/lib/map/floor-plan-publish-types";

export {
  loadPublishedFloorPlan,
  LoadPublishedFloorPlan,
} from "@/lib/map/load-published-floor-plan";

export {
  publishFloorPlan,
  PublishFloorPlan,
} from "@/lib/map/publish-floor-plan-legacy";

/**
 * Qué escribe `PublishFloorPlan` en iteración 1 (vía `publish-floor-plan-legacy`):
 *
 * | Destino | Operación |
 * | --- | --- |
 * | `floorPlans/{floorPlanId}` | merge width, height, updatedAt |
 * | `tables/{id}` | merge layout de todos los elementos del working draft |
 * | `tables/{id}` | isActive:false para ids en baseline y no en draft |
 * | `zones/{id}` | update/set si diff vs loadedBaseline |
 *
 * Qué NO escribe todavía: activityLogs, floorPlanLayouts, snapshots, sessionStorage,
 * default TPV flag, idempotencia durable en Firestore.
 */
