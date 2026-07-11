"use client";

import type { CSSProperties } from "react";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaSurfaceObjectsLayer } from "@/components/sala-editor/panels/sala-terreno-workspace";
import { SalaZoneLayer } from "@/components/sala-editor/panels/sala-zone-layer";
import { SalaWallCanvas } from "@/components/sala-editor/panels/sala-wall-canvas";
import { SalaStructureObjectsLayer } from "@/components/sala-editor/panels/sala-structure-objects-layer";
import { SalaLandscapeElementsLayer } from "@/components/sala-editor/panels/sala-landscape-elements-layer";
import { SalaOperationalInstancesLayer } from "@/components/sala-editor/panels/sala-operacion-workspace";
import "@/components/sala-editor/sala-editor-workbench.css";

export type SalaEditorReadonlyOperationalMode = "all" | "non-table" | "none";

export type SalaEditorReadonlyMapProps = {
  contract: EditorTpvReadonlyVisualContract;
  className?: string;
  style?: CSSProperties;
  operationalMode?: SalaEditorReadonlyOperationalMode;
};

function resolveReadonlyFloorKind(kind: string): BaseFloorCatalogKind {
  if (
    kind === "wood" ||
    kind === "stone" ||
    kind === "grass" ||
    kind === "sand" ||
    kind === "neutral"
  ) {
    return kind;
  }
  return "neutral";
}

export function SalaEditorReadonlyMap({
  contract,
  className,
  style,
  operationalMode = "all",
}: SalaEditorReadonlyMapProps) {
  const base = normalizeSalaEspacioBase(contract.space.base);
  const floorEntry = getBaseFloorCatalogEntry(resolveReadonlyFloorKind(base.floor.kind));
  const operationalInstances =
    operationalMode === "none"
      ? []
      : operationalMode === "non-table"
        ? contract.operationalElementInstances.filter(
            (instance) => instance.elementType !== "TABLE",
          )
        : contract.operationalElementInstances;

  return (
    <div
      className={className}
      data-hostly-readonly-map-source="editor-v2"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        pointerEvents: "none",
        ...style,
      }}
    >
      <SalaEspacioCanvasFrame
        espacio={contract.space}
        restaurantId={contract.restaurantId}
        basePreview={base}
        floorBackground={floorEntry.background}
        stageRole="img"
        stageAriaLabel={`Plano readonly de ${contract.space.name}`}
        stageStyle={{
          pointerEvents: "none",
        }}
      >
        {contract.surfaces.length > 0 ? (
          <SalaSurfaceObjectsLayer surfaceObjects={contract.surfaces} readOnly />
        ) : null}
        {contract.zones.length > 0 ? (
          <SalaZoneLayer
            espacioId={contract.space.id}
            gridSize={base.grid.size}
            zones={contract.zones}
            readOnly
          />
        ) : null}
        {contract.walls.length > 0 || contract.wallAttachments.length > 0 ? (
          <SalaWallCanvas
            walls={contract.walls}
            wallAttachments={contract.wallAttachments}
            draft={null}
            selectedWallId={null}
            readOnly
            embedded
          />
        ) : null}
        {contract.structuralElements.length > 0 ? (
          <SalaStructureObjectsLayer
            espacioId={contract.space.id}
            gridSize={base.grid.size}
            structuralElements={contract.structuralElements}
            readOnly
          />
        ) : null}
        {contract.landscapeElements.length > 0 ? (
          <SalaLandscapeElementsLayer
            espacioId={contract.space.id}
            gridSize={base.grid.size}
            landscapeElements={contract.landscapeElements}
            readOnly
          />
        ) : null}
        {operationalInstances.length > 0 ? (
          <SalaOperationalInstancesLayer instances={operationalInstances} readOnly />
        ) : null}
      </SalaEspacioCanvasFrame>
    </div>
  );
}
