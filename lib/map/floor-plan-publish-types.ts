import type { FloorPlan, FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";
import type { FloorElement } from "@/lib/firestore/tables";
import type { Zone } from "@/lib/firestore/zones";

/** Origen del borrador de trabajo (no confundir con Firestore publish). */
export type FloorPlanDraftSource = "published" | "assistant" | "manual";

/**
 * Elemento de plano en borrador.
 * Reutiliza `FloorElement` (`Table` en colección `tables`).
 */
export type FloorPlanDraftElement = FloorElement;

/** Zona de plano en borrador. Reutiliza `Zone`. */
export type FloorPlanDraftZone = Zone;

/** Lienzo lógico del plano (px). */
export type FloorPlanDraftCanvas = FloorPlanCanvasSize;

/**
 * Borrador de trabajo normalizado para editor → publish.
 * Iteración 1: no sustituye el estado React del editor; es el contrato objetivo.
 */
export type FloorPlanWorkingDraft = {
  floorPlanId: string;
  restaurantId: string;
  elements: FloorPlanDraftElement[];
  zones: FloorPlanDraftZone[];
  canvas: FloorPlanDraftCanvas;
  /** Revisión monótona del borrador local (1 = primera carga publicada). */
  revision: number;
  source: FloorPlanDraftSource;
  /** Revisión publicada conocida; ausente hasta primer publish v2. */
  publishedRevision?: number;
};

/** Baseline cargado desde Firestore antes de ediciones locales (para diffs en publish). */
export type FloorPlanLoadedBaseline = {
  elements: FloorPlanDraftElement[];
  zones: FloorPlanDraftZone[];
};

export type LoadPublishedFloorPlanParams = {
  restaurantId: string;
  floorPlanId: string;
  /** Lista completa de mesas/elementos ya cargada por el editor (sin fetch). */
  tables: FloorPlanDraftElement[];
  zones: FloorPlanDraftZone[];
  floorPlans: FloorPlan[];
  /** Override opcional del canvas; si falta, se deriva del plano y catálogo. */
  canvas?: FloorPlanDraftCanvas;
};

export type PublishFloorPlanOptions = {
  /**
   * Iteración 2+: marcar plano como default operativo en TPV.
   * Iteración 1: documentado, sin efecto.
   */
  setAsDefaultForTpv?: boolean;
  /** Iteración 1: bloqueo heredado del editor si hay plantilla de zona en curso. */
  areaTemplateBusy?: boolean;
};

export type PublishFloorPlanParams = {
  restaurantId: string;
  floorPlanId: string;
  workingDraft: FloorPlanWorkingDraft;
  /** Snapshot Firestore previo al editar (p. ej. `loadedElements` / `loadedZones`). */
  loadedBaseline: FloorPlanLoadedBaseline;
  options?: PublishFloorPlanOptions;
  idempotencyKey?: string;
};

export type PublishFloorPlanError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type PublishFloorPlanResult = {
  status: "success" | "failed" | "skipped";
  floorPlanId: string;
  publishedRevision: number;
  counts?: {
    tables: number;
    zones: number;
    zonesWritten: number;
    deactivated: number;
  };
  error?: PublishFloorPlanError;
  idempotencyKey?: string;
};
