"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";

export type SalaTerrenoWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
};

const TERRAIN_SURFACES = [
  "Madera",
  "Piedra",
  "Césped",
  "Arena",
  "Tarima",
  "Agua / piscina",
] as const;

export function SalaTerrenoWorkspace({
  espacio,
  restaurantId,
}: SalaTerrenoWorkspaceProps) {
  const base = normalizeSalaEspacioBase(espacio.base);
  const floorEntry = getBaseFloorCatalogEntry(
    (base.floor.kind === "wood" ||
    base.floor.kind === "stone" ||
    base.floor.kind === "grass" ||
    base.floor.kind === "sand" ||
    base.floor.kind === "neutral"
      ? base.floor.kind
      : "neutral") as BaseFloorCatalogKind,
  );

  return (
    <SalaEspacioCanvasFrame
      espacio={espacio}
      restaurantId={restaurantId}
      basePreview={base}
      floorBackground={floorEntry.background}
    >
      <div className="hostly-sala-terreno-placeholder">
        <div className="hostly-sala-terreno-placeholder__card">
          <span className="hostly-sala-terreno-placeholder__eyebrow">
            Próxima fase visual
          </span>
          <h2 className="hostly-sala-terreno-placeholder__title">
            Construye el terreno del mapa
          </h2>
          <p className="hostly-sala-terreno-placeholder__text">
            Aquí se añadirán superficies dentro del mapa: madera, piedra,
            césped, arena, tarima y agua o piscina. En esta fase no se dibujan
            muros ni se colocan mesas.
          </p>
          <div className="hostly-sala-terreno-placeholder__chips" aria-label="Superficies previstas">
            {TERRAIN_SURFACES.map((surface) => (
              <span key={surface} className="hostly-sala-terreno-placeholder__chip">
                {surface}
              </span>
            ))}
          </div>
        </div>
      </div>
    </SalaEspacioCanvasFrame>
  );
}
