"use client";

import type { ReactNode } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import {
  SALA_ESPACIO_BASE_STATUS_LABELS,
  normalizeSalaEspacioBase,
} from "@/lib/sala-editor/types/espacio-base";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";

export type SalaBaseWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  canvasLayers?: ReactNode;
};

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function SalaBaseWorkspace({
  espacio,
  restaurantId,
  canvasLayers = null,
}: SalaBaseWorkspaceProps) {
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
      hint={
        <div className="hostly-sala-espacio-frame__hero hostly-sala-base-workspace__hero">
          <p className="hostly-sala-espacio-frame__hero-title">
            Vista previa del espacio
          </p>
          <p className="hostly-sala-espacio-frame__hero-hint">
            {formatDimension(base.dimensions.width)} ×{" "}
            {formatDimension(base.dimensions.height)} {base.unit} ·{" "}
            {SALA_ESPACIO_BASE_STATUS_LABELS[base.status]}
          </p>
        </div>
      }
    >
      {canvasLayers}
    </SalaEspacioCanvasFrame>
  );
}
