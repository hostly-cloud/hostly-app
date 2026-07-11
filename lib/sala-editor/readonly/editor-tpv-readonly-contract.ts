import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import type { SurfaceObject } from "@/lib/sala-editor/surface/surface-object";
import type { Zone } from "@/lib/sala-editor/zones/zone";
import type { SalaStructuralElement } from "@/lib/sala-editor/types/elementos-estructurales";
import type { LandscapeElement } from "@/lib/sala-editor/landscape/landscape-element";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";

export type EditorTpvReadonlyLayerCounts = {
  surfaces: number;
  zones: number;
  walls: number;
  wallAttachments: number;
  structural: number;
  landscape: number;
  operationalInstances: number;
};

export type EditorTpvReadonlyVisualContract = {
  documentVersion: SalaEditorDocument["version"];
  restaurantId: string;
  space: SalaEspacio;
  surfaces: SurfaceObject[];
  zones: Zone[];
  walls: SalaWallSegment[];
  wallAttachments: SalaWallAttachment[];
  structuralElements: SalaStructuralElement[];
  landscapeElements: LandscapeElement[];
  operationalElementInstances: OperationalElementInstance[];
  counts: EditorTpvReadonlyLayerCounts;
};

export type EditorTpvPublisherVisualField =
  | "source"
  | "editorV2ElementId"
  | "editorV2ElementType"
  | "editorV2SpaceId"
  | "editorV2Layer"
  | "editorV2Kind"
  | "editorV2Subtype"
  | "rotation"
  | "visualVariant"
  | "canvasSize"
  | "material"
  | "color"
  | "metadata";

export type EditorTpvPublisherVisualLayer =
  | "tables"
  | "zones"
  | "surfaceObjects"
  | "walls"
  | "wallAttachments"
  | "structuralElements"
  | "landscapeElements"
  | "operationalElementInstances";

export type EditorTpvPublisherVisualFieldPlanItem = {
  field: EditorTpvPublisherVisualField;
  appliesTo: readonly EditorTpvPublisherVisualLayer[];
  compatibility: "legacy-safe" | "requires-legacy-reader-guard";
  reason: string;
};

export const EDITOR_TPV_PUBLISHER_VISUAL_FIELDS: readonly EditorTpvPublisherVisualField[] = [
  "source",
  "editorV2ElementId",
  "editorV2ElementType",
  "editorV2SpaceId",
  "editorV2Layer",
  "editorV2Kind",
  "editorV2Subtype",
  "rotation",
  "visualVariant",
  "canvasSize",
  "material",
  "color",
  "metadata",
] as const;

export const EDITOR_TPV_PUBLISHER_VISUAL_FIELD_PLAN: readonly EditorTpvPublisherVisualFieldPlanItem[] = [
  {
    field: "source",
    appliesTo: ["tables", "zones"],
    compatibility: "legacy-safe",
    reason: "Keeps current legacy documents identifiable as editor-v2 output without changing queries.",
  },
  {
    field: "editorV2ElementId",
    appliesTo: [
      "tables",
      "zones",
      "surfaceObjects",
      "walls",
      "wallAttachments",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "legacy-safe",
    reason: "Preserves a stable bridge back to the V2 document for parity audits and future readonly rendering.",
  },
  {
    field: "editorV2ElementType",
    appliesTo: [
      "tables",
      "zones",
      "surfaceObjects",
      "walls",
      "wallAttachments",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "legacy-safe",
    reason: "Avoids collapsing different V2 families into generic TPV decorative types.",
  },
  {
    field: "editorV2SpaceId",
    appliesTo: [
      "tables",
      "zones",
      "surfaceObjects",
      "walls",
      "wallAttachments",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "legacy-safe",
    reason: "Keeps one-to-one space and floorPlan verification independent from display names.",
  },
  {
    field: "editorV2Layer",
    appliesTo: [
      "surfaceObjects",
      "walls",
      "wallAttachments",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "requires-legacy-reader-guard",
    reason: "Lets TPV choose the correct readonly layer without guessing from legacy type names.",
  },
  {
    field: "editorV2Kind",
    appliesTo: ["structuralElements", "landscapeElements", "wallAttachments"],
    compatibility: "requires-legacy-reader-guard",
    reason: "Preserves catalog-level identity such as column, door, tree, palm, plant, or service object.",
  },
  {
    field: "editorV2Subtype",
    appliesTo: [
      "surfaceObjects",
      "walls",
      "wallAttachments",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "requires-legacy-reader-guard",
    reason: "Carries finer visual variants without overloading operational table type.",
  },
  {
    field: "rotation",
    appliesTo: [
      "tables",
      "surfaceObjects",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "legacy-safe",
    reason: "Keeps geometry parity for every object that can be rotated in the editor.",
  },
  {
    field: "visualVariant",
    appliesTo: [
      "tables",
      "surfaceObjects",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "requires-legacy-reader-guard",
    reason: "Allows readonly TPV rendering to match the editor catalog instead of using generic blocks.",
  },
  {
    field: "canvasSize",
    appliesTo: ["tables", "operationalElementInstances"],
    compatibility: "legacy-safe",
    reason: "Preserves the exact operation object footprint when width and height are derived from catalog metadata.",
  },
  {
    field: "material",
    appliesTo: ["surfaceObjects", "structuralElements"],
    compatibility: "requires-legacy-reader-guard",
    reason: "Keeps surfaces and structure visually faithful without encoding material into free-form CSS.",
  },
  {
    field: "color",
    appliesTo: ["zones", "surfaceObjects", "walls", "structuralElements", "landscapeElements"],
    compatibility: "legacy-safe",
    reason: "Preserves user-visible color choices already understood by current zone and decorative readers.",
  },
  {
    field: "metadata",
    appliesTo: [
      "tables",
      "zones",
      "surfaceObjects",
      "walls",
      "wallAttachments",
      "structuralElements",
      "landscapeElements",
      "operationalElementInstances",
    ],
    compatibility: "requires-legacy-reader-guard",
    reason: "Carries namespaced visual metadata for readonly parity while keeping legacy operational fields stable.",
  },
] as const;

export function buildEditorTpvReadonlyVisualContract(
  document: SalaEditorDocument,
  spaceId: string | null | undefined,
): EditorTpvReadonlyVisualContract | null {
  const normalizedSpaceId = String(spaceId ?? "").trim();
  if (!normalizedSpaceId) return null;

  const space = document.espacios.find((item) => item.id === normalizedSpaceId);
  if (!space) return null;

  const wallIds = new Set(
    document.walls
      .filter((wall) => wall.espacioId === normalizedSpaceId)
      .map((wall) => wall.id),
  );
  const surfaces = document.surfaceObjects.filter(
    (surface) => surface.espacioId === normalizedSpaceId && surface.visible !== false,
  );
  const zones = document.zones.filter(
    (zone) => zone.espacioId === normalizedSpaceId && zone.visible !== false,
  );
  const walls = document.walls.filter((wall) => wall.espacioId === normalizedSpaceId);
  const wallAttachments = document.wallAttachments.filter((attachment) =>
    wallIds.has(attachment.wallId),
  );
  const structuralElements = document.structuralElements.filter(
    (element) => element.espacioId === normalizedSpaceId,
  );
  const landscapeElements = document.landscapeElements.filter(
    (element) => element.espacioId === normalizedSpaceId && element.visible !== false,
  );
  const operationalElementInstances = document.operationalElementInstances.filter(
    (instance) =>
      instance.spaceId === normalizedSpaceId &&
      instance.visible !== false &&
      instance.enabled !== false,
  );

  return {
    documentVersion: document.version,
    restaurantId: document.restaurantId,
    space,
    surfaces,
    zones,
    walls,
    wallAttachments,
    structuralElements,
    landscapeElements,
    operationalElementInstances,
    counts: {
      surfaces: surfaces.length,
      zones: zones.length,
      walls: walls.length,
      wallAttachments: wallAttachments.length,
      structural: structuralElements.length,
      landscape: landscapeElements.length,
      operationalInstances: operationalElementInstances.length,
    },
  };
}
