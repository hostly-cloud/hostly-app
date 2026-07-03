export type SurfaceObjectId = string;

export type SurfaceMaterialKind =
  | "wood"
  | "stone"
  | "grass"
  | "sand"
  | "water"
  | "deck"
  | "carpet"
  | "tile"
  | "custom";

export type SurfaceObjectKind = "surface";

export type SurfaceObjectGeometry =
  | {
      type: "placeholder";
    }
  | {
      type: "polygon";
      points: Array<{ x: number; y: number }>;
    };

export type SurfaceObject = {
  id: SurfaceObjectId;
  kind: SurfaceObjectKind;
  material: SurfaceMaterialKind;
  visible: boolean;
  locked: boolean;
  layer: number;
  geometry: SurfaceObjectGeometry;
  metadata?: Record<string, unknown>;
};

export type SurfaceObjectDraft = Omit<SurfaceObject, "id">;

export function createSurfaceObject(draft: SurfaceObjectDraft): SurfaceObject {
  return {
    id: `surface-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
  };
}
