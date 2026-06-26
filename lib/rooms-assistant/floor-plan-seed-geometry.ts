export type SeedRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SeedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const SEED_LAYOUT = {
  /** Margen interior dentro de cada zona. */
  zonePadding: 28,
  /** Pasillo principal entre bloques de mesas. */
  aisle: 52,
  /** Separación entre mesas dentro de un grupo. */
  tableGap: 22,
  /** Separación entre grupos de mesas. */
  clusterGap: 64,
  /** Espacio libre bajo la barra antes de mesas. */
  barClearance: 44,
  /** Franja reservada en la parte inferior (entrada / recepción). */
  entranceStrip: 88,
  /** Colchón alrededor de puertas y barra. */
  serviceClearance: 20,
  /** Separación visual entre zonas. */
  zoneGap: 24,
} as const;

export function insetRect(rect: SeedRect, margin: number): SeedRect {
  return {
    x: rect.x + margin,
    y: rect.y + margin,
    w: Math.max(0, rect.w - margin * 2),
    h: Math.max(0, rect.h - margin * 2),
  };
}

export function boundsFromRect(rect: SeedRect): SeedBounds {
  return { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
}

export function boundsFromElement(
  x: number,
  y: number,
  width: number,
  height: number,
): SeedBounds {
  return { x, y, width, height };
}

export function boundsOverlap(a: SeedBounds, b: SeedBounds, gap = 0): boolean {
  return !(
    a.x + a.width + gap <= b.x ||
    b.x + b.width + gap <= a.x ||
    a.y + a.height + gap <= b.y ||
    b.y + b.height + gap <= a.y
  );
}

export function canPlaceElement(
  bounds: SeedBounds,
  occupied: SeedBounds[],
  clearance: number = SEED_LAYOUT.serviceClearance,
): boolean {
  return !occupied.some((block) => boundsOverlap(bounds, block, clearance));
}

export function snap(value: number, grid = 4): number {
  return Math.round(value / grid) * grid;
}
