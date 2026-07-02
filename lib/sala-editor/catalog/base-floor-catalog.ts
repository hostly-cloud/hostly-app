/**
 * Catálogo ampliable de suelos para la fase Base.
 */

import type { SalaEspacioBaseFloor } from "@/lib/sala-editor/types/espacio-base";

export type BaseFloorCatalogKind = Extract<
  SalaEspacioBaseFloor["kind"],
  "neutral" | "wood" | "stone" | "grass" | "sand"
>;

export type BaseFloorCatalogEntry = {
  kind: BaseFloorCatalogKind;
  label: string;
  color: string;
  /** Fondo CSS aplicado al lienzo de preview Base. */
  background: string;
};

export const BASE_FLOOR_CATALOG: readonly BaseFloorCatalogEntry[] = [
  {
    kind: "neutral",
    label: "Neutro",
    color: "#e8eef2",
    background: "linear-gradient(180deg, #f4f7fa 0%, #e8eef2 100%)",
  },
  {
    kind: "wood",
    label: "Madera",
    color: "#c9a66b",
    background:
      "repeating-linear-gradient(90deg, #dcc29a 0 14px, #c9a66b 14px 28px)",
  },
  {
    kind: "stone",
    label: "Piedra",
    color: "#b8c0c8",
    background: "linear-gradient(145deg, #d5dbe1 0%, #aeb7c0 100%)",
  },
  {
    kind: "grass",
    label: "Césped",
    color: "#7cb342",
    background: "linear-gradient(180deg, #9ccc65 0%, #689f38 100%)",
  },
  {
    kind: "sand",
    label: "Arena",
    color: "#e6d5a8",
    background: "linear-gradient(180deg, #f2e8cf 0%, #dcc89a 100%)",
  },
] as const;

export function getBaseFloorCatalogEntry(
  kind: BaseFloorCatalogKind,
): BaseFloorCatalogEntry {
  return BASE_FLOOR_CATALOG.find((entry) => entry.kind === kind) ?? BASE_FLOOR_CATALOG[0]!;
}

export function baseFloorFromCatalogKind(kind: BaseFloorCatalogKind): SalaEspacioBaseFloor {
  const entry = getBaseFloorCatalogEntry(kind);
  return {
    kind: entry.kind,
    color: entry.color,
  };
}
