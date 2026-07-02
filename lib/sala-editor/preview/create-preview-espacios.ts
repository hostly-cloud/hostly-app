import {
  SALA_ESPACIO_PRESET_CATALOG,
  getSalaEspacioPreset,
  type SalaEspacioPresetKey,
} from "@/lib/sala-editor/catalog/espacio-presets";
import type { SalaEspacioType } from "@/lib/sala-editor/catalog/espacio-types";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { createDefaultSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";

/** Presets cargados por defecto en la ruta preview del editor V2. */
export const PREVIEW_ESPACIO_PRESET_KEYS: readonly SalaEspacioPresetKey[] = [
  "main-hall",
  "terrace",
  "bar",
  "vip",
  "garden",
  "pool",
] as const;

const PRESET_KEY_TO_TIPO: Record<SalaEspacioPresetKey, SalaEspacioType> = {
  "main-hall": "sala",
  terrace: "terraza",
  bar: "barra",
  garden: "jardin",
  vip: "vip",
  pool: "piscina",
  rooftop: "terraza",
  beach: "personalizado",
};

export type CreateLocalEspacioInput = {
  restaurantId: string;
  name: string;
  tipo: SalaEspacioType;
  color: string;
  sortOrder: number;
};

export function createLocalEspacio(input: CreateLocalEspacioInput): SalaEspacio {
  const rid = input.restaurantId.trim();
  const name = input.name.trim();
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    restaurantId: rid,
    name: name || "Nuevo mapa",
    tipo: input.tipo,
    color: input.color,
    sortOrder: input.sortOrder,
    visible: true,
    active: true,
    base: createDefaultSalaEspacioBase(),
  };
}

export function nextEspacioSortOrder(espacios: Pick<SalaEspacio, "sortOrder">[]): number {
  if (espacios.length === 0) return 10;
  return Math.max(...espacios.map((e) => e.sortOrder)) + 10;
}

export function createPreviewEspaciosFromPresets(
  restaurantId: string,
  keys: readonly SalaEspacioPresetKey[] = PREVIEW_ESPACIO_PRESET_KEYS,
): SalaEspacio[] {
  const rid = restaurantId.trim();
  return keys.flatMap((key) => {
    const preset = getSalaEspacioPreset(key);
    if (!preset) return [];
    return [
      {
        id: `preview-${key}`,
        restaurantId: rid,
        name: preset.label,
        tipo: PRESET_KEY_TO_TIPO[key],
        color: preset.defaultColor,
        sortOrder: preset.defaultSortOrder,
        visible: true,
        active: true,
        base: createDefaultSalaEspacioBase(),
      },
    ];
  });
}

export function createLocalEspacioFromPreset(
  restaurantId: string,
  key: SalaEspacioPresetKey,
  existingNames: string[],
): SalaEspacio | null {
  const preset = getSalaEspacioPreset(key);
  if (!preset) return null;

  const baseName = preset.label;
  const used = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  let name = baseName;
  if (used.has(name.toLowerCase())) {
    let n = 2;
    while (used.has(`${baseName} ${n}`.toLowerCase())) n += 1;
    name = `${baseName} ${n}`;
  }

  return {
    id: `local-${key}-${Date.now()}`,
    restaurantId: restaurantId.trim(),
    name,
    tipo: PRESET_KEY_TO_TIPO[key],
    color: preset.defaultColor,
    sortOrder: preset.defaultSortOrder,
    visible: true,
    active: true,
    base: createDefaultSalaEspacioBase(),
  };
}

export function nextAvailableEspacioPresetKey(
  existingNames: string[],
): SalaEspacioPresetKey | null {
  const used = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  for (const preset of SALA_ESPACIO_PRESET_CATALOG) {
    if (!used.has(preset.label.toLowerCase())) return preset.key;
  }
  return null;
}
