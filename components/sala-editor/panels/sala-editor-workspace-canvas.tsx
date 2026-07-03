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
import type { WallAttachmentEditOutcome } from "@/lib/sala-editor/canvas/wall-attachment-interaction";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import { SalaEspacioWorkspaceHero } from "@/components/sala-editor/panels/sala-espacio-workspace-hero";
import { SalaEspaciosEmptyState } from "@/components/sala-editor/panels/sala-espacios-empty-state";
import { SalaBaseWorkspace } from "@/components/sala-editor/panels/sala-base-workspace";
import { SalaTerrenoWorkspace } from "@/components/sala-editor/panels/sala-terreno-workspace";
import { SalaEstructuraWorkspace } from "@/components/sala-editor/panels/sala-estructura-workspace";
import { SalaOperacionWorkspace } from "@/components/sala-editor/panels/sala-operacion-workspace";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { OperationalInstanceResizeCorner } from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { OperationalInstancePointerPayload } from "@/lib/sala-editor/canvas/pointer-interaction";
import type { WallPointerPayload } from "@/lib/sala-editor/canvas/wall-interaction";
import type { OperationalSnapGuides } from "@/lib/sala-editor/canvas/operational-snap";
import {
  createSpaceWorkspaceScope,
  getSpaceWorkspaceKey,
} from "@/lib/sala-editor/canvas/space-workspace";
import { SalaEditorEmptyState } from "@/components/sala-editor/panels/sala-editor-empty-state";

export type SalaEditorWorkspaceCanvasProps = {
  restaurantId: string;
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  hasEspacios: boolean;
  activeStructuralToolboxItem: StructuralToolboxItem | null;
  activeSurfaceMaterial?: SurfaceMaterialKind | null;
  surfaceObjects?: SurfaceObject[];
  onSurfaceObjectCreate?: (draft: SurfaceObjectDraft) => void;
  walls?: SalaWallSegment[];
  wallAttachments?: SalaWallAttachment[];
  wallDraft?: SalaWallDrawingDraft | null;
  selectedWallId?: string | null;
  selectedWallAttachmentId?: string | null;
  onWallPointerDown?: (payload: WallPointerPayload) => void;
  onWallPointerMove?: (payload: WallPointerPayload) => void;
  onWallPointerUp?: () => void;
  onWallPointerCancel?: () => void;
  onWallDelete?: (wallId: string) => void;
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
  onWallAttachmentDelete?: (attachmentId: string) => void;
  onWallAttachmentMoveStart?: () => void;
  onWallAttachmentMoveEnd?: (outcome: WallAttachmentEditOutcome) => void;
  activeOperationalCatalogItem?: OperationalElementCatalogItem | null;
  operationalElementInstances?: OperationalElementInstance[];
  selectedOperationalElementInstanceId?: string | null;
  draggingOperationalInstanceId?: string | null;
  resizingOperationalInstanceId?: string | null;
  dropAnimatingOperationalInstanceId?: string | null;
  operationalSnapGuides?: OperationalSnapGuides;
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
  onOperationalDeleteInstance?: (instanceId: string) => void;
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
  onSurfaceObjectCreate,
  walls = [],
  wallAttachments = [],
  wallDraft = null,
  selectedWallId = null,
  selectedWallAttachmentId = null,
  onWallPointerDown,
  onWallPointerMove,
  onWallPointerUp,
  onWallPointerCancel,
  onWallDelete,
  onWallAttachmentPlace,
  onWallAttachmentSelect,
  onWallAttachmentClearSelection,
  onWallAttachmentUpdate,
  onWallAttachmentDelete,
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
  onOperationalDeleteInstance,
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
        title="Selecciona un mapa en el panel izquierdo."
        hint="Necesitas un mapa activo para preparar base, terreno, estructura u operación."
        glyph="▢"
      />
    );
  }

  if (phase === "base") {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaBaseWorkspace espacio={espacio} restaurantId={restaurantId} />
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
          onSurfaceObjectCreate={onSurfaceObjectCreate}
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
          onWallDelete={onWallDelete}
          onWallAttachmentPlace={onWallAttachmentPlace}
          onWallAttachmentSelect={onWallAttachmentSelect}
          onWallAttachmentClearSelection={onWallAttachmentClearSelection}
          onWallAttachmentUpdate={onWallAttachmentUpdate}
          onWallAttachmentDelete={onWallAttachmentDelete}
          onWallAttachmentMoveStart={onWallAttachmentMoveStart}
          onWallAttachmentMoveEnd={onWallAttachmentMoveEnd}
        />
      </div>
    );
  }

  if (phase === "estructura") {
    return (
      <SalaEditorEmptyState
        title="Elige una herramienta del panel izquierdo."
        hint="Pared, cristal, puerta u otra estructura."
        glyph="⎔"
      />
    );
  }

  if (phase === "operacion" && espacio && activeOperationalCatalogItem) {
    return (
      <div key={spaceWorkspaceKey} className="hostly-sala-space-workspace-root">
        <SalaOperacionWorkspace
          espacio={espacio}
          restaurantId={restaurantId}
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
        onDeleteInstance={onOperationalDeleteInstance ?? (() => undefined)}
        />
      </div>
    );
  }

  if (phase === "operacion") {
    return (
      <SalaEditorEmptyState
        title="Elige un elemento operativo."
        hint="Mesa, sofá u otro tipo del panel izquierdo."
        glyph="◎"
      />
    );
  }

  return (
    <SalaEditorEmptyState
      title={espacio.name}
      hint="Mapa seleccionado."
      glyph="◫"
    />
  );
}
