"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SurfaceMaterialKind } from "@/lib/sala-editor/surface/surface-object";
import { getSurfaceMaterialCatalogItem } from "@/lib/sala-editor/surface/surface-material-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";

export type SalaTerrenoWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  activeSurfaceMaterial?: SurfaceMaterialKind | null;
};

export function SalaTerrenoWorkspace({
  espacio,
  restaurantId,
  activeSurfaceMaterial = null,
}: SalaTerrenoWorkspaceProps) {
  const base = normalizeSalaEspacioBase(espacio.base);
  const activeMaterial = getSurfaceMaterialCatalogItem(activeSurfaceMaterial);
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
            Surface Objects
          </span>
          <h2 className="hostly-sala-terreno-placeholder__title">
            {activeMaterial
              ? `${activeMaterial.label} preparado`
              : "Selecciona un material para comenzar a construir el terreno."}
          </h2>
          <p className="hostly-sala-terreno-placeholder__text">
            {activeMaterial
              ? "El cursor queda preparado para la siguiente iteración. Todavía no se crea ningún objeto ni se dibuja geometría."
              : "La biblioteca de Terreno ya separa materiales como madera, piedra, césped, arena, agua y tarima. En esta fase no se dibujan muros ni se colocan mesas."}
          </p>
          {activeMaterial ? (
            <div className="hostly-sala-terreno-placeholder__ready">
              <span
                className="hostly-sala-terreno-placeholder__swatch"
                style={{ background: activeMaterial.swatch }}
                aria-hidden
              />
              <span>{activeMaterial.description}</span>
            </div>
          ) : null}
        </div>
      </div>
    </SalaEspacioCanvasFrame>
  );
}
