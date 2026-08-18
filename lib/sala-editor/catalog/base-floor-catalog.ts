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
    background:
      "radial-gradient(circle at 16% 18%, rgba(255,255,255,.82) 0 1px, transparent 1.6px), radial-gradient(circle at 74% 68%, rgba(100,116,139,.12) 0 1px, transparent 1.5px), linear-gradient(145deg, #f5f7f6 0%, #e9eeed 100%)",
  },
  {
    kind: "wood",
    label: "Madera",
    color: "#c9a66b",
    background:
      "linear-gradient(90deg, rgba(87,58,35,.16) 0 1px, transparent 1px 100%), repeating-linear-gradient(90deg, #ddc5a1 0 22px, #c9a477 22px 23px, #d6b88d 23px 45px, #b98f62 45px 46px), linear-gradient(180deg, rgba(255,255,255,.2), rgba(78,52,32,.08))",
  },
  {
    kind: "stone",
    label: "Piedra",
    color: "#b8c0c8",
    background:
      "linear-gradient(90deg, rgba(94,105,112,.2) 1px, transparent 1px), linear-gradient(rgba(94,105,112,.18) 1px, transparent 1px), radial-gradient(ellipse at 24% 32%, rgba(255,255,255,.4), transparent 38%), linear-gradient(145deg, #d8dcd9 0%, #b8bfbc 100%)",
  },
  {
    kind: "grass",
    label: "Césped",
    color: "#809578",
    background:
      "radial-gradient(ellipse at 22% 30%, rgba(233,240,218,.2) 0 1px, transparent 2px), radial-gradient(ellipse at 68% 72%, rgba(55,75,50,.14) 0 1px, transparent 2px), repeating-linear-gradient(104deg, rgba(255,255,255,.05) 0 1px, transparent 1px 5px), linear-gradient(155deg, #a5b398 0%, #7d9274 100%)",
  },
  {
    kind: "sand",
    label: "Arena",
    color: "#e6d5a8",
    background:
      "radial-gradient(circle at 18% 24%, rgba(132,105,66,.2) 0 .7px, transparent 1px), radial-gradient(circle at 72% 63%, rgba(255,255,255,.38) 0 .8px, transparent 1.2px), radial-gradient(ellipse at 36% 42%, rgba(255,255,255,.18), transparent 42%), linear-gradient(150deg, #eee1c2 0%, #d8c195 100%)",
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
