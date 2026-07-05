"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type {
  SalaWallAttachment,
  SalaWallAttachmentKind,
} from "@/lib/sala-editor/types/wall-attachment";
import type {
  SurfaceMaterialKind,
  SurfaceObject,
  SurfaceObjectDraft,
} from "@/lib/sala-editor/surface/surface-object";
import type {
  LandscapeElement,
  LandscapeElementDraft,
  LandscapeElementKind,
} from "@/lib/sala-editor/landscape/landscape-element";
import type { Zone, ZoneDraft, ZoneType } from "@/lib/sala-editor/zones/zone";
import type {
  SalaStructuralElement,
  SalaStructuralElementDraft,
} from "@/lib/sala-editor/types/elementos-estructurales";
import type { WallAttachmentEditOutcome } from "@/lib/sala-editor/canvas/wall-attachment-interaction";
import type { SurfaceEditOutcome } from "@/lib/sala-editor/surface/surface-interaction";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import { SalaEspacioWorkspaceHero } from "@/components/sala-editor/panels/sala-espacio-workspace-hero";
import { SalaEspaciosEmptyState } from "@/components/sala-editor/panels/sala-espacios-empty-state";
import { SalaBaseWorkspace } from "@/components/sala-editor/panels/sala-base-workspace";
import {
  SalaSurfaceObjectsLayer,
  SalaTerrenoWorkspace,
} from "@/components/sala-editor/panels/sala-terreno-workspace";
import { SalaZonasWorkspace } from "@/components/sala-editor/panels/sala-zonas-workspace";
import { SalaZoneLayer } from "@/components/sala-editor/panels/sala-zone-layer";
import { SalaEstructuraWorkspace } from "@/components/sala-editor/panels/sala-estructura-workspace";
import { SalaPaisajismoWorkspace } from "@/components/sala-editor/panels/sala-paisajismo-workspace";
import { SalaLandscapeElementsLayer } from "@/components/sala-editor/panels/sala-landscape-elements-layer";
import {
  SalaOperationalInstancesLayer,
  SalaOperacionWorkspace,
} from "@/components/sala-editor/panels/sala-operacion-workspace";
import { SalaWallCanvas } from "@/components/sala-editor/panels/sala-wall-canvas";
import { SalaStructureObjectsLayer } from "@/components/sala-editor/panels/sala-structure-objects-layer";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { OperationalInstanceResizeCorner } from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { OperationalInstancePointerPayload } from "@/lib/sala-editor/canvas/pointer-interaction";
import type { WallPointerPayload } from "@/lib/sala-editor/canvas/wall-interaction";
import type { SnapGuide } from "@/lib/sala-editor/snap";
import {
  createSpaceWorkspaceScope,
  getSpaceWorkspaceKey,
} from "@/lib/sala-editor/canvas/space-workspace";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import { SalaEditorEmptyState } from "@/components/sala-editor/panels/sala-editor-empty-state";

export type SalaEditorWorkspaceCanvasProps = {
  restaurantId: string;
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  hasEspacios: boolean;
  activeStructuralToolboxItem: StructuralToolboxItem | null;
  activeSurfaceMaterial?: SurfaceMaterialKind | null;
  surfaceObjects?: SurfaceObject[];
  selectedSurfaceObjectId?: string | null;
  onSurfaceObjectCreate?: (draft: SurfaceObjectDraft) => void;
  onSurfaceObjectSelect?: (surfaceId: string | null) => void;
  onSurfaceObjectClearSelection?: () => void;
  onSurfaceObjectUpdate?: (
    surfaceId: string,
    patch: Partial<Omit<SurfaceObject, "id">>,
  ) => void;
  onSurfaceObjectMoveStart?: () => void;
  onSurfaceObjectMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onSurfaceObjectResizeStart?: () => void;
  onSurfaceObjectResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  activeZoneType?: ZoneType | null;
  zones?: Zone[];
  selectedZoneId?: string | null;
  onZoneCreate?: (draft: ZoneDraft) => void;
  onZoneSelect?: (zoneId: string | null) => void;
  onZoneClearSelection?: () => void;
  onZoneUpdate?: (zoneId: string, patch: Partial<Omit<Zone, "id">>) => void;
  onZoneMoveStart?: () => void;
  onZoneMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onZoneResizeStart?: () => void;
  onZoneResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  structuralElements?: SalaStructuralElement[];
  selectedStructuralElementId?: string | null;
  onStructuralElementCreate?: (draft: SalaStructuralElementDraft) => void;
  onStructuralElementSelect?: (elementId: string | null) => void;
  onStructuralElementClearSelection?: () => void;
  onStructuralElementUpdate?: (
    elementId: string,
    patch: Partial<Omit<SalaStructuralElement, "id">>,
  ) => void;
  onStructuralElementMoveStart?: () => void;
  onStructuralElementMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onStructuralElementResizeStart?: () => void;
  onStructuralElementResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  activeLandscapeKind?: LandscapeElementKind | null;
  landscapeElements?: LandscapeElement[];
  selectedLandscapeElementId?: string | null;
  onLandscapeElementCreate?: (draft: LandscapeElementDraft) => void;
  onLandscapeElementSelect?: (elementId: string | null) => void;
  onLandscapeElementClearSelection?: () => void;
  onLandscapeElementUpdate?: (
    elementId: string,
    patch: Partial<Omit<LandscapeElement, "id">>,
  ) => void;
  onLandscapeElementMoveStart?: () => void;
  onLandscapeElementMoveEnd?: (outcome: SurfaceEditOutcome) => void;
  onLandscapeElementResizeStart?: () => void;
  onLandscapeElementResizeEnd?: (outcome: SurfaceEditOutcome) => void;
  walls?: SalaWallSegment[];
  wallAttachments?: SalaWallAttachment[];
  wallDraft?: SalaWallDrawingDraft | null;
  selectedWallId?: string | null;
  selectedWallAttachmentId?: string | null;
  onWallPointerDown?: (payload: WallPointerPayload) => void;
  onWallPointerMove?: (payload: WallPointerPayload) => void;
  onWallPointerUp?: () => void;
  onWallPointerCancel?: () => void;
  onWallAttachmentPlace?: (
    wallId: string,
    positionRatio: number,
    kind: SalaWallAttachmentKind,
  ) => void;
  onWallAttachmentSelect?: (attachmentId: string) => void;
  onWallAttachmentClearSelection?: () => void;
  onWallAttachmentUpdate?: (
    attachmentId: string,
    patch: Partial<Pick<SalaWallAttachment, "positionRatio" | "offset">>,
  ) => void;
  onWallAttachmentMoveStart?: () => void;
  onWallAttachmentMoveEnd?: (outcome: WallAttachmentEditOutcome) => void;
  activeOperationalCatalogItem?: OperationalElementCatalogItem | null;
  operationalElementInstances?: OperationalElementInstance[];
  selectedOperationalElementInstanceId?: string | null;
  draggingOperationalInstanceId?: string | null;
  resizingOperationalInstanceId?: string | null;
  dropAnimatingOperationalInstanceId?: string | null;
  operationalSnapGuides?: SnapGuide[];
  isOperationalDragging?: () => boolean;
  isOperationalResizing?: () => boolean;
  onOperationalCanvasPointerDown?: (point: { x: number; y: number }) => void;
  onOperationalInstancePointerDown?: (
    instanceId: string,
    payload: OperationalInstancePointerPayload,
  ) => void;
  onOperationalInstancePointerMove?: (
    instanceId: string,
    payload: OperationalInstancePointerPayload,
  ) => void;
  onOperationalInstancePointerUp?: (instanceId: string) => void;
  onOperationalInstancePointerCancel?: (instanceId: string) => void;
  onOperationalResizeStart?: (
    instanceId: string,
    corner: OperationalInstanceResizeCorner,
    clientX: number,
    clientY: number,
  ) => void;
  onOperationalResizeMove?: (clientX: number, clientY: number) => void;
  onOperationalResizeEnd?: () => void;
  onOperationalResizeCancel?: () => void;
  onOperationalDuplicateInstance?: (instanceId: string) => void;
  onRequestCreateEspacio: () => void;
};

export function SalaEditorWorkspaceCanvas({
  restaurantId,
  phase,
  espacio,
  hasEspacios,
  activeStructuralToolboxItem,
  activeSurfaceMaterial = null,
  surfaceObjects = [],
  selectedSurfaceObjectId = null,
  onSurfaceObjectCreate,
  onSurfaceObjectSelect,
  onSurfaceObjectClearSelection,
  onSurfaceObjectUpdate,
  onSurfaceObjectMoveStart,
  onSurfaceObjectMoveEnd,
  onSurfaceObjectResizeStart,
  onSurfaceObjectResizeEnd,
  activeZoneType = null,
  zones = [],
  selectedZoneId = null,
  onZoneCreate,
  onZoneSelect,
  onZoneClearSelection,
  onZoneUpdate,
  onZoneMoveStart,
  onZoneMoveEnd,
  onZoneResizeStart,
  onZoneResizeEnd,
  structuralElements = [],
  selectedStructuralElementId = null,
  onStructuralElementCreate,
  onStructuralElementSelect,
  onStructuralElementClearSelection,
  onStructuralElementUpdate,
  onStructuralElementMoveStart,
  onStructuralElementMoveEnd,
  onStructuralElementResizeStart,
  onStructuralElementResizeEnd,
  activeLandscapeKind = null,
  landscapeElements = [],
  selectedLandscapeElementId = null,
  onLandscapeElementCreate,
  onLandscapeElementSelect,
  onLandscapeElementClearSelection,
  onLandscapeElementUpdate,
  onLandscapeElementMoveStart,
  onLandscapeElementMoveEnd,
  onLandscapeElementResizeStart,
  onLandscapeElementResizeEnd,
  walls = [],
  wallAttachments = [],
  wallDraft = null,
  selectedWallId = null,
  selectedWallAttachmentId = null,
  onWallPointerDown,
  onWallPointerMove,
  onWallPointerUp,
  onWallPointerCancel,
  onWallAttachmentPlace,
  onWallAttachmentSelect,
  onWallAttachmentClearSelection,
  onWallAttachmentUpdate,
  onWallAttachmentMoveStart,
  onWallAttachmentMoveEnd,
  activeOperationalCatalogItem = null,
  operationalElementInstances = [],
  selectedOperationalElementInstanceId = null,
  draggingOperationalInstanceId = null,
  resizingOperationalInstanceId = null,
  dropAnimatingOperationalInstanceId = null,
  operationalSnapGuides,
  isOperationalDragging,
  isOperationalResizing,
  onOperationalCanvasPointerDown,
  onOperationalInstancePointerDown,
  onOperationalInstancePointerMove,
  onOperationalInstancePointerUp,
  onOperationalInstancePointerCancel,
  onOperationalResizeStart,
  onOperationalResizeMove,
  onOperationalResizeEnd,
  onOperationalResizeCancel,
  onOperationalDuplicateInstance,
  onRequestCreateEspacio,
}: SalaEditorWorkspaceCanvasProps) {
  const spaceWorkspaceKey =
    espacio != null
      ? getSpaceWorkspaceKey(createSpaceWorkspaceScope(restaurantId, espacio.id))
      : "no-space";

  if (!hasEspacios) {
    return <SalaEspaciosEmptyState onCreateEspacio={onRequestCreateEspacio} />;
  }

  if (phase === "espacios" && espacio) {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaEspacioWorkspaceHero espacio={espacio} restaurantId={restaurantId} />
      </div>
    );
  }

  if (!espacio) {
    return (
      <SalaEditorEmptyState
        title="Selecciona un espacio en el panel izquierdo."
        hint="Elige una sala, terraza o zona para preparar tu restaurante."
        glyph="▢"
      />
    );
  }

  const base = normalizeSalaEspacioBase(espacio.base);
  const gridSize = base.grid.size;

  const terrainLayer =
    surfaceObjects.length > 0 ? (
      <SalaSurfaceObjectsLayer
        key="terrain-layer"
        surfaceObjects={surfaceObjects}
        readOnly
      />
    ) : null;

  const zoneLayer =
    zones.length > 0 ? (
      <SalaZoneLayer
        key="zone-layer"
        espacioId={espacio.id}
        gridSize={gridSize}
        zones={zones}
        readOnly
      />
    ) : null;

  const structureLayer =
    walls.length > 0 ||
    wallAttachments.length > 0 ||
    structuralElements.length > 0 ? (
      <>
        {walls.length > 0 || wallAttachments.length > 0 ? (
          <SalaWallCanvas
            key="structure-wall-layer"
            walls={walls}
            wallAttachments={wallAttachments}
            draft={null}
            selectedWallId={null}
            selectedWallAttachmentId={null}
            embedded
            readOnly
          />
        ) : null}
        {structuralElements.length > 0 ? (
          <SalaStructureObjectsLayer
            key="structure-objects-layer"
            espacioId={espacio.id}
            gridSize={gridSize}
            structuralElements={structuralElements}
            readOnly
          />
        ) : null}
      </>
    ) : null;

  const landscapeLayer =
    landscapeElements.length > 0 ? (
      <SalaLandscapeElementsLayer
        key="landscape-layer"
        espacioId={espacio.id}
        gridSize={gridSize}
        landscapeElements={landscapeElements}
        readOnly
      />
    ) : null;

  const operationLayer =
    operationalElementInstances.length > 0 ? (
      <SalaOperationalInstancesLayer
        key="operation-layer"
        instances={operationalElementInstances}
        readOnly
      />
    ) : null;

  if (phase === "base") {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaBaseWorkspace
          espacio={espacio}
          restaurantId={restaurantId}
          canvasLayers={
            <>
              {terrainLayer}
              {zoneLayer}
              {structureLayer}
              {landscapeLayer}
              {operationLayer}
            </>
          }
        />
      </div>
    );
  }

  if (phase === "terreno") {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaTerrenoWorkspace
          espacio={espacio}
          restaurantId={restaurantId}
          activeSurfaceMaterial={activeSurfaceMaterial}
          surfaceObjects={surfaceObjects}
          selectedSurfaceObjectId={selectedSurfaceObjectId}
          onSurfaceObjectCreate={onSurfaceObjectCreate}
          onSurfaceObjectSelect={onSurfaceObjectSelect}
          onSurfaceObjectClearSelection={onSurfaceObjectClearSelection}
          onSurfaceObjectUpdate={onSurfaceObjectUpdate}
          onSurfaceObjectMoveStart={onSurfaceObjectMoveStart}
          onSurfaceObjectMoveEnd={onSurfaceObjectMoveEnd}
          onSurfaceObjectResizeStart={onSurfaceObjectResizeStart}
          onSurfaceObjectResizeEnd={onSurfaceObjectResizeEnd}
          canvasLayers={
            <>
              {zoneLayer}
              {structureLayer}
              {landscapeLayer}
              {operationLayer}
            </>
          }
        />
      </div>
    );
  }

  if (phase === "zonas") {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaZonasWorkspace
          espacio={espacio}
          restaurantId={restaurantId}
          activeZoneType={activeZoneType}
          zones={zones}
          selectedZoneId={selectedZoneId}
          onZoneCreate={onZoneCreate}
          onZoneSelect={onZoneSelect}
          onZoneClearSelection={onZoneClearSelection}
          onZoneUpdate={onZoneUpdate}
          onZoneMoveStart={onZoneMoveStart}
          onZoneMoveEnd={onZoneMoveEnd}
          onZoneResizeStart={onZoneResizeStart}
          onZoneResizeEnd={onZoneResizeEnd}
          canvasLayers={
            <>
              {terrainLayer}
              {structureLayer}
              {landscapeLayer}
              {operationLayer}
            </>
          }
        />
      </div>
    );
  }

  if (phase === "estructura" && activeStructuralToolboxItem) {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaEstructuraWorkspace
          espacio={espacio}
          restaurantId={restaurantId}
          tool={activeStructuralToolboxItem}
          walls={walls}
          wallAttachments={wallAttachments}
          wallDraft={wallDraft}
          selectedWallId={selectedWallId}
          selectedWallAttachmentId={selectedWallAttachmentId}
          onWallPointerDown={onWallPointerDown}
          onWallPointerMove={onWallPointerMove}
          onWallPointerUp={onWallPointerUp}
          onWallPointerCancel={onWallPointerCancel}
          onWallAttachmentPlace={onWallAttachmentPlace}
          onWallAttachmentSelect={onWallAttachmentSelect}
          onWallAttachmentClearSelection={onWallAttachmentClearSelection}
          onWallAttachmentUpdate={onWallAttachmentUpdate}
          onWallAttachmentMoveStart={onWallAttachmentMoveStart}
          onWallAttachmentMoveEnd={onWallAttachmentMoveEnd}
          structuralElements={structuralElements}
          selectedStructuralElementId={selectedStructuralElementId}
          onStructuralElementCreate={onStructuralElementCreate}
          onStructuralElementSelect={onStructuralElementSelect}
          onStructuralElementClearSelection={onStructuralElementClearSelection}
          onStructuralElementUpdate={onStructuralElementUpdate}
          onStructuralElementMoveStart={onStructuralElementMoveStart}
          onStructuralElementMoveEnd={onStructuralElementMoveEnd}
          onStructuralElementResizeStart={onStructuralElementResizeStart}
          onStructuralElementResizeEnd={onStructuralElementResizeEnd}
          canvasLayers={
            <>
              {terrainLayer}
              {zoneLayer}
              {landscapeLayer}
              {operationLayer}
            </>
          }
        />
      </div>
    );
  }

  if (phase === "estructura") {
    return (
      <SalaEditorEmptyState
        title="Elige qué elemento fijo quieres colocar."
        hint="Pared, cristal, puerta o separador."
        glyph="⎔"
      />
    );
  }

  if (phase === "paisajismo") {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaPaisajismoWorkspace
          espacio={espacio}
          restaurantId={restaurantId}
          activeLandscapeKind={activeLandscapeKind}
          landscapeElements={landscapeElements}
          selectedLandscapeElementId={selectedLandscapeElementId}
          onLandscapeElementCreate={onLandscapeElementCreate}
          onLandscapeElementSelect={onLandscapeElementSelect}
          onLandscapeElementClearSelection={onLandscapeElementClearSelection}
          onLandscapeElementUpdate={onLandscapeElementUpdate}
          onLandscapeElementMoveStart={onLandscapeElementMoveStart}
          onLandscapeElementMoveEnd={onLandscapeElementMoveEnd}
          onLandscapeElementResizeStart={onLandscapeElementResizeStart}
          onLandscapeElementResizeEnd={onLandscapeElementResizeEnd}
          canvasLayers={
            <>
              {terrainLayer}
              {zoneLayer}
              {structureLayer}
              {operationLayer}
            </>
          }
        />
      </div>
    );
  }

  if (phase === "operacion" && espacio && activeOperationalCatalogItem) {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaOperacionWorkspace
          espacio={espacio}
          restaurantId={restaurantId}
          activeCatalogItem={activeOperationalCatalogItem}
          instances={operationalElementInstances}
        selectedInstanceId={selectedOperationalElementInstanceId}
        draggingInstanceId={draggingOperationalInstanceId}
        resizingInstanceId={resizingOperationalInstanceId}
        dropAnimatingInstanceId={dropAnimatingOperationalInstanceId}
        snapGuides={operationalSnapGuides}
        isDragging={isOperationalDragging ?? (() => false)}
        isResizing={isOperationalResizing ?? (() => false)}
        onCanvasPointerDown={onOperationalCanvasPointerDown ?? (() => undefined)}
        onInstancePointerDown={onOperationalInstancePointerDown ?? (() => undefined)}
        onInstancePointerMove={onOperationalInstancePointerMove ?? (() => undefined)}
        onInstancePointerUp={onOperationalInstancePointerUp ?? (() => undefined)}
        onInstancePointerCancel={onOperationalInstancePointerCancel ?? (() => undefined)}
        onResizeStart={onOperationalResizeStart ?? (() => undefined)}
        onResizeMove={onOperationalResizeMove ?? (() => undefined)}
        onResizeEnd={onOperationalResizeEnd ?? (() => undefined)}
        onResizeCancel={onOperationalResizeCancel ?? (() => undefined)}
        onDuplicateInstance={onOperationalDuplicateInstance ?? (() => undefined)}
          canvasLayers={
            <>
              {terrainLayer}
              {zoneLayer}
              {structureLayer}
              {landscapeLayer}
            </>
          }
        />
      </div>
    );
  }

  if (phase === "operacion") {
    return (
      <SalaEditorEmptyState
        title="Elige qué quieres colocar para el servicio."
        hint="Mesa, barra, recepción o punto de apoyo."
        glyph="◎"
      />
    );
  }

  return (
    <SalaEditorEmptyState
      title={espacio.name}
      hint="Espacio seleccionado."
      glyph="◫"
    />
  );
}
