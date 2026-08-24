"use client";

import { useRef, type CSSProperties } from "react";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import {
  getBaseFloorCatalogEntry,
  type BaseFloorCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { CanvasViewportProvider } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";
import { SalaSurfaceObjectsLayer } from "@/components/sala-editor/panels/sala-terreno-workspace";
import { SalaZoneLayer } from "@/components/sala-editor/panels/sala-zone-layer";
import { SalaWallCanvas } from "@/components/sala-editor/panels/sala-wall-canvas";
import { SalaStructureObjectsLayer } from "@/components/sala-editor/panels/sala-structure-objects-layer";
import { SalaLandscapeElementsLayer } from "@/components/sala-editor/panels/sala-landscape-elements-layer";
import { SalaOperationalInstancesLayer } from "@/components/sala-editor/panels/sala-operacion-workspace";
import {
  SalaEditorReadonlyOperationalLayer,
  type SalaEditorReadonlyTpvOperationalState,
} from "@/components/sala-editor/readonly/sala-editor-readonly-operational-layer";
import "@/components/sala-editor/sala-editor-workbench.css";
import "@/components/sala-editor/sala-editor-workbench-premium.css";

export type SalaEditorReadonlyOperationalMode = "all" | "non-table" | "none" | "tpv";
export type SalaEditorReadonlyMapMode = "standalone" | "logical-underlay";

export type SalaEditorReadonlyMapProps = {
  contract: EditorTpvReadonlyVisualContract;
  className?: string;
  style?: CSSProperties;
  operationalMode?: SalaEditorReadonlyOperationalMode;
  mode?: SalaEditorReadonlyMapMode;
  coordinateScale?: number;
  operationalStateByInstanceId?: Record<string, SalaEditorReadonlyTpvOperationalState>;
  operationalStateByTableId?: Record<string, SalaEditorReadonlyTpvOperationalState>;
  operationalSelectedTableIds?: readonly string[];
  operationalVisibleInstanceIds?: readonly string[];
  onOperationalTableClick?: (tableId: string, instanceId: string) => void;
  /** Compatibilidad temporal con consumidores anteriores a la API tableId. */
  operationalStateByLegacyTableId?: Record<string, SalaEditorReadonlyTpvOperationalState>;
  /** Compatibilidad temporal con consumidores anteriores a la API tableId. */
  operationalSelectedLegacyTableIds?: readonly string[];
  /** Compatibilidad temporal con consumidores anteriores a la API tableId. */
  onOperationalLegacyTableClick?: (legacyTableId: string, instanceId: string) => void;
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
  mode = "standalone",
  coordinateScale = 1,
  operationalStateByInstanceId,
  operationalStateByTableId,
  operationalSelectedTableIds,
  operationalVisibleInstanceIds,
  onOperationalTableClick,
  operationalStateByLegacyTableId,
  operationalSelectedLegacyTableIds,
  onOperationalLegacyTableClick,
}: SalaEditorReadonlyMapProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const base = normalizeSalaEspacioBase(contract.space.base);
  const floorEntry = getBaseFloorCatalogEntry(resolveReadonlyFloorKind(base.floor.kind));
  const safeCoordinateScale =
    Number.isFinite(coordinateScale) && coordinateScale > 0 ? coordinateScale : 1;
  const logicalWidth = base.dimensions.width * base.scale.pixelsPerUnit * safeCoordinateScale;
  const logicalHeight =
    base.dimensions.height * base.scale.pixelsPerUnit * safeCoordinateScale;
  const operationalInstances =
    operationalMode === "none" || operationalMode === "tpv"
      ? []
      : operationalMode === "non-table"
        ? contract.operationalElementInstances.filter(
            (instance) => instance.elementType !== "TABLE",
          )
        : contract.operationalElementInstances;
  const visibleInstanceIdSet =
    operationalVisibleInstanceIds != null
      ? new Set(operationalVisibleInstanceIds.map((id) => String(id).trim()).filter(Boolean))
      : null;
  const tpvOperationalInstances =
    visibleInstanceIdSet == null
      ? contract.operationalElementInstances
      : contract.operationalElementInstances.filter(
          (instance) =>
            instance.elementType !== "TABLE" || visibleInstanceIdSet.has(instance.id),
        );
  const hasNativeTpvInteraction = operationalMode === "tpv";
  const resolvedOperationalStateByTableId =
    operationalStateByTableId ?? operationalStateByLegacyTableId;
  const resolvedOperationalSelectedTableIds =
    operationalSelectedTableIds ?? operationalSelectedLegacyTableIds;
  const resolvedOnOperationalTableClick =
    onOperationalTableClick ?? onOperationalLegacyTableClick;

  const layers = (
    <>
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
      {operationalMode === "tpv" && tpvOperationalInstances.length > 0 ? (
        <SalaEditorReadonlyOperationalLayer
          instances={tpvOperationalInstances}
          stateByInstanceId={operationalStateByInstanceId}
          stateByTableId={resolvedOperationalStateByTableId}
          selectedTableIds={resolvedOperationalSelectedTableIds}
          onTableClick={resolvedOnOperationalTableClick}
        />
      ) : null}
    </>
  );

  if (mode === "logical-underlay") {
    return (
      <div
        ref={stageRef}
        className={className}
        data-hostly-readonly-map-source="editor-v2"
        data-hostly-readonly-map-mode="logical-underlay"
        data-hostly-readonly-map-interaction={
          hasNativeTpvInteraction ? "native-v2" : "readonly"
        }
        aria-hidden={hasNativeTpvInteraction ? undefined : true}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: logicalWidth,
          height: logicalHeight,
          minWidth: logicalWidth,
          minHeight: logicalHeight,
          pointerEvents: hasNativeTpvInteraction ? "auto" : "none",
          overflow: "hidden",
          zIndex: 1,
          ...style,
        }}
      >
        <CanvasViewportProvider
          stageRef={stageRef}
          scale={1}
          displayPixelsPerUnit={base.scale.pixelsPerUnit * safeCoordinateScale}
          logicalPixelsPerUnit={base.scale.pixelsPerUnit}
          coordinateScale={safeCoordinateScale}
        >
          {layers}
        </CanvasViewportProvider>
      </div>
    );
  }

  return (
    <div
      className={className}
      data-hostly-readonly-map-source="editor-v2"
      data-hostly-readonly-map-interaction={
        hasNativeTpvInteraction ? "native-v2" : "readonly"
      }
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        pointerEvents: hasNativeTpvInteraction ? "auto" : "none",
        ...style,
      }}
    >
      <SalaEspacioCanvasFrame
        espacio={contract.space}
        restaurantId={contract.restaurantId}
        basePreview={base}
        floorBackground={floorEntry.background}
        stageRole={hasNativeTpvInteraction ? "group" : "img"}
        stageAriaLabel={`Plano readonly de ${contract.space.name}`}
        stageStyle={{
          pointerEvents: hasNativeTpvInteraction ? "auto" : "none",
        }}
      >
        {layers}
      </SalaEspacioCanvasFrame>
    </div>
  );
}
