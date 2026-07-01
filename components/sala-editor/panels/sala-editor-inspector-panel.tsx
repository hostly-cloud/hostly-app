"use client";

import type { ReactNode } from "react";
import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import type { StructuralToolboxItem } from "@/lib/sala-editor/catalog/structural-toolbox";
import {
  SALA_ESPACIO_TYPE_OPTIONS,
  salaEspacioTypeLabel,
} from "@/lib/sala-editor/catalog/espacio-types";
import type { SalaEspacioType } from "@/lib/sala-editor/catalog/espacio-types";
import { SalaStructuralToolInspector } from "@/components/sala-editor/panels/sala-structural-tool-inspector";
import { SalaWallInspector } from "@/components/sala-editor/panels/sala-wall-inspector";
import { SalaOperationalElementInspector } from "@/components/sala-editor/panels/sala-operational-element-inspector";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import { SalaOperationalElementInstanceInspector } from "@/components/sala-editor/panels/sala-operational-element-instance-inspector";
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { SalaEditorInspectorEmpty } from "@/components/sala-editor/panels/sala-editor-inspector-empty";

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="hostly-sala-editor-inspector__section">
      <h4 className="hostly-sala-editor-inspector__section-title">{title}</h4>
      {children}
    </section>
  );
}

export type SalaEditorInspectorPanelProps = {
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  elementCount?: number;
  activeStructuralToolboxItem?: StructuralToolboxItem | null;
  selectedWall?: SalaWallSegment | null;
  activeOperationalCatalogItem?: OperationalElementCatalogItem | null;
  selectedOperationalElementInstance?: OperationalElementInstance | null;
  onUpdateEspacio?: (patch: Partial<SalaEspacioDraft>) => void;
};

export function SalaEditorInspectorPanel({
  phase,
  espacio,
  elementCount = 0,
  activeStructuralToolboxItem = null,
  selectedWall = null,
  activeOperationalCatalogItem = null,
  selectedOperationalElementInstance = null,
  onUpdateEspacio,
}: SalaEditorInspectorPanelProps) {
  if (phase === "estructura") {
    if (!espacio) return <SalaEditorInspectorEmpty />;
    if (selectedWall) return <SalaWallInspector wall={selectedWall} />;
    if (activeStructuralToolboxItem) {
      return <SalaStructuralToolInspector tool={activeStructuralToolboxItem} />;
    }
    return <SalaEditorInspectorEmpty message="Selecciona una herramienta para ver sus propiedades." />;
  }

  if (phase === "operacion") {
    if (!espacio) return <SalaEditorInspectorEmpty />;
    if (selectedOperationalElementInstance) {
      return (
        <SalaOperationalElementInstanceInspector
          instance={selectedOperationalElementInstance}
        />
      );
    }
    if (activeOperationalCatalogItem) {
      return (
        <SalaOperationalElementInspector catalogItem={activeOperationalCatalogItem} />
      );
    }
    return <SalaEditorInspectorEmpty message="Selecciona un elemento para ver sus propiedades." />;
  }

  if (!espacio) {
    return <SalaEditorInspectorEmpty />;
  }

  const handleTipoChange = (tipo: SalaEspacioType) => {
    onUpdateEspacio?.({ tipo });
  };

  return (
    <div className="hostly-sala-editor-inspector">
      <InspectorSection title="General">
        <label className="hostly-sala-editor-inspector__field">
          <span className="hostly-sala-editor-inspector__field-label">Nombre</span>
          <input
            type="text"
            value={espacio.name}
            onChange={(e) => onUpdateEspacio?.({ name: e.target.value })}
            className="hostly-sala-editor-inspector__input"
          />
        </label>

        <label className="hostly-sala-editor-inspector__field">
          <span className="hostly-sala-editor-inspector__field-label">Tipo</span>
          <select
            value={espacio.tipo}
            onChange={(e) => handleTipoChange(e.target.value as SalaEspacioType)}
            className="hostly-sala-editor-inspector__input"
          >
            {SALA_ESPACIO_TYPE_OPTIONS.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="hostly-sala-editor-inspector__field">
          <span className="hostly-sala-editor-inspector__field-label">Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={espacio.color}
              onChange={(e) => onUpdateEspacio?.({ color: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5"
            />
            <span className="text-[11px] font-semibold text-slate-500">{espacio.color}</span>
          </div>
        </label>

        <label className="hostly-sala-editor-inspector__field">
          <span className="hostly-sala-editor-inspector__field-label">Orden</span>
          <input
            type="number"
            min={0}
            step={1}
            value={espacio.sortOrder}
            onChange={(e) =>
              onUpdateEspacio?.({
                sortOrder: Math.max(0, Math.floor(Number(e.target.value) || 0)),
              })
            }
            className="hostly-sala-editor-inspector__input"
          />
        </label>
      </InspectorSection>

      <InspectorSection title="Visibilidad">
        <label className="hostly-sala-editor-inspector__toggle-row">
          <span>Visible</span>
          <input
            type="checkbox"
            checked={espacio.visible}
            onChange={(e) => onUpdateEspacio?.({ visible: e.target.checked })}
            className="h-4 w-4 accent-[var(--hostly-accent)]"
          />
        </label>
        <label className="hostly-sala-editor-inspector__toggle-row">
          <span>Activo</span>
          <input
            type="checkbox"
            checked={espacio.active}
            onChange={(e) => onUpdateEspacio?.({ active: e.target.checked })}
            className="h-4 w-4 accent-[var(--hostly-accent)]"
          />
        </label>
      </InspectorSection>

      <InspectorSection title="Resumen">
        <div className="hostly-sala-editor-inspector__card">
          <p className="text-xs font-extrabold text-slate-800">
            {elementCount} elemento{elementCount === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {salaEspacioTypeLabel(espacio.tipo)}
            {elementCount > 0
              ? ` · ${elementCount} en este espacio`
              : " · sin estructura creada"}
          </p>
        </div>
      </InspectorSection>
    </div>
  );
}
