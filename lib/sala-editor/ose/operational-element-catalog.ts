/**
 * OperationalElementCatalog — catálogo oficial OSE (Fase 1).
 */

import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";

export type OperationalElementCatalogItem = {
  type: OperationalElementType;
  icon: string;
  label: string;
  description: string;
  defaultCapacity: number;
  color: string;
  supportsReservations: boolean;
  supportsTpv: boolean;
  supportsCleaning: boolean;
  supportsInventory: boolean;
  workspaceHint: string;
};

export const OPERATIONAL_ELEMENT_CATALOG: readonly OperationalElementCatalogItem[] =
  [
    {
      type: "TABLE",
      icon: "🪑",
      label: "Mesa",
      description: "Mesa estándar de servicio en sala o terraza.",
      defaultCapacity: 4,
      color: "#315f7d",
      supportsReservations: true,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic sobre el plano para colocar una mesa.",
    },
    {
      type: "HIGH_TABLE",
      icon: "🍸",
      label: "Mesa alta",
      description: "Mesa de bar, cocktail o zona alta.",
      defaultCapacity: 2,
      color: "#4a6fa5",
      supportsReservations: true,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar una mesa alta.",
    },
    {
      type: "BAR_SEAT",
      icon: "🪑",
      label: "Taburete de barra",
      description: "Asiento individual en barra o mostrador.",
      defaultCapacity: 1,
      color: "#5b7c99",
      supportsReservations: false,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar un taburete de barra.",
    },
    {
      type: "BAR_STRAIGHT",
      icon: "▰",
      label: "Barra recta",
      description: "Mostrador operativo permanente para servicio de barra.",
      defaultCapacity: 0,
      color: "#475569",
      supportsReservations: false,
      supportsTpv: false,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic sobre el plano para colocar una barra recta.",
    },
    {
      type: "BAR_L",
      icon: "┗",
      label: "Barra en L",
      description: "Mostrador operativo en esquina para barras o servicio.",
      defaultCapacity: 0,
      color: "#475569",
      supportsReservations: false,
      supportsTpv: false,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic sobre el plano para colocar una barra en L.",
    },
    {
      type: "SOFA",
      icon: "🛋️",
      label: "Sofá",
      description: "Asiento lounge o zona chill-out.",
      defaultCapacity: 4,
      color: "#6b7280",
      supportsReservations: true,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar un sofá.",
    },
    {
      type: "SUNBED",
      icon: "🏖️",
      label: "Hamaca",
      description: "Tumbona o sunbed de playa o piscina.",
      defaultCapacity: 2,
      color: "#0d9488",
      supportsReservations: true,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar una hamaca.",
    },
    {
      type: "BALINESE_BED",
      icon: "🛏️",
      label: "Cama balinesa",
      description: "Daybed exterior o zona VIP.",
      defaultCapacity: 4,
      color: "#7c3aed",
      supportsReservations: true,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar una cama balinesa.",
    },
    {
      type: "ROOM",
      icon: "🚪",
      label: "Sala privada",
      description: "Área cerrada o reservable como unidad.",
      defaultCapacity: 8,
      color: "#b45309",
      supportsReservations: true,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar una sala privada.",
    },
    {
      type: "CABANA",
      icon: "🏕️",
      label: "Cabaña",
      description: "Estructura premium de playa o piscina.",
      defaultCapacity: 6,
      color: "#ca8a04",
      supportsReservations: true,
      supportsTpv: true,
      supportsCleaning: true,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar una cabaña.",
    },
    {
      type: "PICKUP_POINT",
      icon: "📦",
      label: "Punto de recogida",
      description: "Mostrador de recogida para delivery o take away.",
      defaultCapacity: 0,
      color: "#64748b",
      supportsReservations: false,
      supportsTpv: true,
      supportsCleaning: false,
      supportsInventory: true,
      workspaceHint: "Haz clic para colocar un punto de recogida.",
    },
    {
      type: "CUSTOM",
      icon: "✦",
      label: "Personalizado",
      description: "Elemento operativo a medida del negocio.",
      defaultCapacity: 2,
      color: "#94a3b8",
      supportsReservations: false,
      supportsTpv: true,
      supportsCleaning: false,
      supportsInventory: false,
      workspaceHint: "Haz clic para colocar un elemento personalizado.",
    },
  ] as const;

export function getOperationalElementCatalogItem(
  type: OperationalElementType,
): OperationalElementCatalogItem | undefined {
  return OPERATIONAL_ELEMENT_CATALOG.find((item) => item.type === type);
}

export function getDefaultOperationalElementCatalogItem(): OperationalElementCatalogItem {
  return OPERATIONAL_ELEMENT_CATALOG[0]!;
}
