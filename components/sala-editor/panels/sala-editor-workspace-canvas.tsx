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
  onPlaceOperationalElement?: (point: { x: number; y: number }) => void;
  onSelectOperationalElementInstance?: (instanceId: string) => void;
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
  onPlaceOperationalElement,
  onSelectOperationalElementInstance,
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
      <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-10 text-center">
        <p className="text-sm font-extrabold text-slate-700">
          Selecciona un espacio
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Elige un espacio en la Fase 1 para continuar en Estructura u Operación.
        </p>
      </div>
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
      <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-10 text-center">
        <p className="text-sm font-extrabold text-slate-700">
          Selecciona una herramienta
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Elige Pared, Cristal, Puerta u otra herramienta del panel izquierdo.
        </p>
      </div>
    );
  }

  if (phase === "operacion" && espacio && activeOperationalCatalogItem) {
    return (
      <SalaOperacionWorkspace
        espacioName={espacio.name}
        catalogItem={activeOperationalCatalogItem}
        instances={operationalElementInstances}
        selectedInstanceId={selectedOperationalElementInstanceId}
        onCanvasPlace={onPlaceOperationalElement ?? (() => undefined)}
        onSelectInstance={onSelectOperationalElementInstance ?? (() => undefined)}
      />
    );
  }

  if (phase === "operacion") {
    return (
      <div className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-10 text-center">
        <p className="text-sm font-extrabold text-slate-700">
          Selecciona un elemento
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Elige Mesa, Sofá, Hamaca u otro tipo del panel izquierdo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f1f5f9_100%)]">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <h3 className="text-2xl font-extrabold text-slate-900">{espacio.name}</h3>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          Espacio seleccionado.
        </p>
      </div>
    </div>
  );
}
