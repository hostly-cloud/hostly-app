import {
  SALA_ESPACIO_PRESET_CATALOG,
  getSalaEspacioPreset,
  type SalaEspacioPresetKey,
} from "@/lib/sala-editor/catalog/espacio-presets";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";

/** Presets cargados por defecto en la ruta preview del editor V2. */
export const PREVIEW_ESPACIO_PRESET_KEYS: readonly SalaEspacioPresetKey[] = [
  "main-hall",
  "terrace",
  "bar",
  "vip",
  "garden",
  "pool",
] as const;

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
        color: preset.defaultColor,
        sortOrder: preset.defaultSortOrder,
        visible: true,
        active: true,
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
    color: preset.defaultColor,
    sortOrder: preset.defaultSortOrder,
    visible: true,
    active: true,
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
