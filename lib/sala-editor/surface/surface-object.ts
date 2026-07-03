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

export type SurfaceObject = {
  id: SurfaceObjectId;
  espacioId: string;
  material: SurfaceMaterialKind;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  locked: boolean;
};

export type SurfaceObjectDraft = Omit<SurfaceObject, "id">;

export function createSurfaceObject(draft: SurfaceObjectDraft): SurfaceObject {
  return {
    id: `surface-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSurfaceMaterialKind(value: unknown): value is SurfaceMaterialKind {
  return (
    value === "wood" ||
    value === "stone" ||
    value === "grass" ||
    value === "sand" ||
    value === "water" ||
    value === "deck" ||
    value === "carpet" ||
    value === "tile" ||
    value === "custom"
  );
}

export function normalizeSurfaceObjects(
  surfaces: readonly unknown[],
  validEspacioIds: ReadonlySet<string>,
): SurfaceObject[] {
  const normalized: SurfaceObject[] = [];

  for (const raw of surfaces) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;
    const entry = raw as Partial<SurfaceObject>;
    if (typeof entry.id !== "string" || entry.id.trim() === "") continue;
    if (typeof entry.espacioId !== "string" || !validEspacioIds.has(entry.espacioId)) {
      continue;
    }
    if (!isSurfaceMaterialKind(entry.material)) continue;
    if (
      !isFiniteNumber(entry.x) ||
      !isFiniteNumber(entry.y) ||
      !isFiniteNumber(entry.width) ||
      !isFiniteNumber(entry.height) ||
      entry.width <= 0 ||
      entry.height <= 0
    ) {
      continue;
    }

    normalized.push({
      id: entry.id,
      espacioId: entry.espacioId,
      material: entry.material,
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
      visible: entry.visible !== false,
      locked: entry.locked === true,
    });
  }

  return normalized;
}
