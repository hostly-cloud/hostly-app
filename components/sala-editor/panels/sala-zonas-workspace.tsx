"use client";

import type { ReactNode } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SurfaceEditOutcome } from "@/lib/sala-editor/surface/surface-interaction";
import type { Zone, ZoneDraft, ZoneType } from "@/lib/sala-editor/zones/zone";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaZoneLayer } from "@/components/sala-editor/panels/sala-zone-layer";

export type SalaZonasWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
  activeZoneType: ZoneType | null;
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneCreate?: (draft: ZoneDraft) => void;
  onZoneSelect?: (zoneId: string | null) => void;
  onZoneClearSelection?: () => void;
  onZoneUpdate?: (zoneId: string, patch: Partial<Omit<Zone, "id">>) => void;
  onZoneMoveStart?: () => void;
  onZoneMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onZoneResizeStart?: () => void;
  onZoneResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  canvasLayers?: ReactNode;
};

export function SalaZonasWorkspace({
  espacio,
  restaurantId,
  activeZoneType,
  zones,
  selectedZoneId,
  onZoneCreate,
  onZoneSelect,
  onZoneClearSelection,
  onZoneUpdate,
  onZoneMoveStart,
  onZoneMoveEnd,
  onZoneResizeStart,
  onZoneResizeEnd,
  canvasLayers = null,
}: SalaZonasWorkspaceProps) {
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
      stageRole="application"
      stageAriaLabel="Lienzo de zonas funcionales"
      stageStyle={{ cursor: activeZoneType ? "crosshair" : "default" }}
    >
      {canvasLayers}
      <SalaZoneLayer
        espacioId={espacio.id}
        gridSize={base.grid.size}
        activeZoneType={activeZoneType}
        zones={zones}
        selectedZoneId={selectedZoneId}
        onCreateZone={onZoneCreate}
        onSelectZone={onZoneSelect}
        onClearZoneSelection={onZoneClearSelection}
        onUpdateZone={onZoneUpdate}
        onMoveStart={onZoneMoveStart}
        onMoveEnd={onZoneMoveEnd}
        onResizeStart={onZoneResizeStart}
        onResizeEnd={onZoneResizeEnd}
      />
    </SalaEspacioCanvasFrame>
  );
}
