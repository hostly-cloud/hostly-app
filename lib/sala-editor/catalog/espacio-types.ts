/**
 * Tipos de espacio para Fase 1 del editor V2.
 * Solo catálogo local; sin persistencia Firestore.
 */

export type SalaEspacioType =
  | "sala"
  | "terraza"
  | "jardin"
  | "vip"
  | "piscina"
  | "barra"
  | "personalizado";

export type SalaEspacioTypeOption = {
  type: SalaEspacioType;
  label: string;
  icon: string;
  defaultColor: string;
};

export const SALA_ESPACIO_TYPE_OPTIONS: readonly SalaEspacioTypeOption[] = [
  { type: "sala", label: "Sala", icon: "🏠", defaultColor: "#315f7d" },
  { type: "terraza", label: "Terraza", icon: "☀️", defaultColor: "#0d9488" },
  { type: "jardin", label: "Jardín", icon: "🌿", defaultColor: "#16a34a" },
  { type: "vip", label: "VIP", icon: "✨", defaultColor: "#b45309" },
  { type: "piscina", label: "Piscina", icon: "💧", defaultColor: "#0284c7" },
  { type: "barra", label: "Barra", icon: "🍸", defaultColor: "#7c3aed" },
  {
    type: "personalizado",
    label: "Personalizado",
    icon: "⬡",
    defaultColor: "#64748b",
  },
] as const;

export function getSalaEspacioTypeOption(
  type: SalaEspacioType,
): SalaEspacioTypeOption {
  return (
    SALA_ESPACIO_TYPE_OPTIONS.find((o) => o.type === type) ??
    SALA_ESPACIO_TYPE_OPTIONS[0]!
  );
}

export function salaEspacioTypeLabel(type: SalaEspacioType): string {
  return getSalaEspacioTypeOption(type).label;
}

export function salaEspacioTypeIcon(type: SalaEspacioType): string {
  return getSalaEspacioTypeOption(type).icon;
}
