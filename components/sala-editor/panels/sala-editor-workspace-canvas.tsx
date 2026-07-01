"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { SalaWallDrawingDraft } from "@/hooks/useSalaWallDrawing";
import { SalaEspacioWorkspaceHero } from "@/components/sala-editor/panels/sala-espacio-workspace-hero";
import { SalaEspaciosEmptyState } from "@/components/sala-editor/panels/sala-espacios-empty-state";
import { SalaEstructuraWorkspace } from "@/components/sala-editor/panels/sala-estructura-workspace";
import { SalaOperacionWorkspace } from "@/components/sala-editor/panels/sala-operacion-workspace";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { SalaEditorEmptyState } from "@/components/sala-editor/panels/sala-editor-empty-state";

export type SalaEditorWorkspaceCanvasProps = {
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  hasEspacios: boolean;
  activeStructuralToolboxItem: StructuralToolboxItem | null;
  walls?: SalaWallSegment[];
  wallDraft?: SalaWallDrawingDraft | null;
  selectedWallId?: string | null;
  onWallPointerDown?: (point: { x: number; y: number }) => void;
  onWallPointerMove?: (point: { x: number; y: number }) => void;
  activeOperationalCatalogItem?: OperationalElementCatalogItem | null;
  operationalElementInstances?: OperationalElementInstance[];
  selectedOperationalElementInstanceId?: string | null;
  draggingOperationalInstanceId?: string | null;
  dropAnimatingOperationalInstanceId?: string | null;
  isOperationalDragging?: () => boolean;
  onOperationalCanvasPointerDown?: (point: { x: number; y: number }) => void;
  onOperationalInstancePointerDown?: (
    instanceId: string,
    point: { x: number; y: number },
  ) => void;
  onOperationalInstancePointerMove?: (
    instanceId: string,
    point: { x: number; y: number },
  ) => void;
  onOperationalInstancePointerUp?: (instanceId: string) => void;
  onOperationalInstancePointerCancel?: (instanceId: string) => void;
  onRequestCreateEspacio: () => void;
};

export function SalaEditorWorkspaceCanvas({
  phase,
  espacio,
  hasEspacios,
  activeStructuralToolboxItem,
  walls = [],
  wallDraft = null,
  selectedWallId = null,
  onWallPointerDown,
  onWallPointerMove,
  activeOperationalCatalogItem = null,
  operationalElementInstances = [],
  selectedOperationalElementInstanceId = null,
  draggingOperationalInstanceId = null,
  dropAnimatingOperationalInstanceId = null,
  isOperationalDragging,
  onOperationalCanvasPointerDown,
  onOperationalInstancePointerDown,
  onOperationalInstancePointerMove,
  onOperationalInstancePointerUp,
  onOperationalInstancePointerCancel,
  onRequestCreateEspacio,
}: SalaEditorWorkspaceCanvasProps) {
  if (!hasEspacios) {
    return <SalaEspaciosEmptyState onCreateEspacio={onRequestCreateEspacio} />;
  }

  if (phase === "espacios" && espacio) {
    return <SalaEspacioWorkspaceHero espacio={espacio} />;
  }

  if (!espacio) {
    return (
      <SalaEditorEmptyState
        title="Selecciona un espacio en el panel izquierdo."
        hint="Necesitas un espacio activo para diseñar estructura u operación."
        glyph="▢"
      />
    );
  }

  if (phase === "estructura" && activeStructuralToolboxItem) {
    return (
      <SalaEstructuraWorkspace
        espacio={espacio}
        tool={activeStructuralToolboxItem}
        walls={walls}
        wallDraft={wallDraft}
        selectedWallId={selectedWallId}
        onWallPointerDown={onWallPointerDown}
        onWallPointerMove={onWallPointerMove}
      />
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
      <SalaOperacionWorkspace
        espacioName={espacio.name}
        catalogItem={activeOperationalCatalogItem}
        instances={operationalElementInstances}
        selectedInstanceId={selectedOperationalElementInstanceId}
        draggingInstanceId={draggingOperationalInstanceId}
        dropAnimatingInstanceId={dropAnimatingOperationalInstanceId}
        isDragging={isOperationalDragging ?? (() => false)}
        onCanvasPointerDown={onOperationalCanvasPointerDown ?? (() => undefined)}
        onInstancePointerDown={onOperationalInstancePointerDown ?? (() => undefined)}
        onInstancePointerMove={onOperationalInstancePointerMove ?? (() => undefined)}
        onInstancePointerUp={onOperationalInstancePointerUp ?? (() => undefined)}
        onInstancePointerCancel={onOperationalInstancePointerCancel ?? (() => undefined)}
      />
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
      hint="Espacio seleccionado."
      glyph="◫"
    />
  );
}
