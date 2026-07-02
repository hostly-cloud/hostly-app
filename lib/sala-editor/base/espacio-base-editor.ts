/**
 * Edición mínima de Base por mapa (fase Base · Pass 1).
 */

import type { SalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";

export type SalaEspacioBasePatch = Partial<
  Pick<SalaEspacioBase, "dimensions" | "floor" | "grid" | "orientation" | "scale" | "shapeType">
>;

export function applySalaEspacioBasePatch(
  current: SalaEspacioBase | undefined,
  patch: SalaEspacioBasePatch,
): SalaEspacioBase {
  const normalized = normalizeSalaEspacioBase(current);

  return normalizeSalaEspacioBase({
    ...normalized,
    ...patch,
    dimensions: {
      ...normalized.dimensions,
      ...patch.dimensions,
    },
    floor: {
      ...normalized.floor,
      ...patch.floor,
    },
    grid: {
      ...normalized.grid,
      ...patch.grid,
    },
    scale: {
      ...normalized.scale,
      ...patch.scale,
    },
    orientation: {
      ...normalized.orientation,
      ...patch.orientation,
    },
    updatedAt: Date.now(),
  });
}

export {
  deriveSalaEspacioBaseStatus,
  isDefaultSalaEspacioBase,
  meetsSalaEspacioBaseListaCriteria,
} from "@/lib/sala-editor/types/espacio-base";
