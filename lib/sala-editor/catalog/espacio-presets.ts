/**
 * Presets de espacios sugeridos al crear un local.
 * Solo catálogo de producto; no escribe Firestore.
 */

export type SalaEspacioPresetKey =
  | "main-hall"
  | "terrace"
  | "bar"
  | "garden"
  | "vip"
  | "pool"
  | "rooftop"
  | "beach";

export type SalaEspacioPreset = {
  key: SalaEspacioPresetKey;
  label: string;
  defaultColor: string;
  /** Orden sugerido relativo al resto de presets. */
  defaultSortOrder: number;
};

export const SALA_ESPACIO_PRESET_CATALOG: readonly SalaEspacioPreset[] = [
  {
    key: "main-hall",
    label: "Sala principal",
    defaultColor: "#315f7d",
    defaultSortOrder: 10,
  },
  {
    key: "terrace",
    label: "Terraza",
    defaultColor: "#0d9488",
    defaultSortOrder: 20,
  },
  {
    key: "bar",
    label: "Barra",
    defaultColor: "#7c3aed",
    defaultSortOrder: 30,
  },
  {
    key: "garden",
    label: "Jardín",
    defaultColor: "#16a34a",
    defaultSortOrder: 40,
  },
  {
    key: "vip",
    label: "VIP",
    defaultColor: "#b45309",
    defaultSortOrder: 50,
  },
  {
    key: "pool",
    label: "Piscina",
    defaultColor: "#0284c7",
    defaultSortOrder: 60,
  },
  {
    key: "rooftop",
    label: "Azotea",
    defaultColor: "#6366f1",
    defaultSortOrder: 70,
  },
  {
    key: "beach",
    label: "Beach",
    defaultColor: "#eab308",
    defaultSortOrder: 80,
  },
] as const;

export function getSalaEspacioPreset(
  key: SalaEspacioPresetKey,
): SalaEspacioPreset | undefined {
  return SALA_ESPACIO_PRESET_CATALOG.find((p) => p.key === key);
}

export function salaEspacioPresetToDraftName(key: SalaEspacioPresetKey): string {
  return getSalaEspacioPreset(key)?.label ?? key;
}
