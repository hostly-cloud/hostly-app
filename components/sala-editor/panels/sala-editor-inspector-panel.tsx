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
import type { OperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h4 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </h4>
      {children}
    </section>
  );
}

function InspectorDivider() {
  return <div className="h-px bg-slate-200/80" aria-hidden />;
}

export type SalaEditorInspectorPanelProps = {
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  elementCount?: number;
  activeStructuralToolboxItem?: StructuralToolboxItem | null;
  selectedWall?: SalaWallSegment | null;
  activeOperationalCatalogItem?: OperationalElementCatalogItem | null;
  onUpdateEspacio?: (patch: Partial<SalaEspacioDraft>) => void;
};

export function SalaEditorInspectorPanel({
  phase,
  espacio,
  elementCount = 0,
  activeStructuralToolboxItem = null,
  selectedWall = null,
  activeOperationalCatalogItem = null,
  onUpdateEspacio,
}: SalaEditorInspectorPanelProps) {
  if (phase === "estructura") {
    if (!espacio) {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
            <p className="text-sm font-bold text-slate-600">
              Selecciona un espacio en la Fase 1
            </p>
          </div>
        </div>
      );
    }

    if (selectedWall) {
      return <SalaWallInspector wall={selectedWall} />;
    }

    if (activeStructuralToolboxItem) {
      return (
        <SalaStructuralToolInspector
          tool={activeStructuralToolboxItem}
          subtitle="Herramienta activa"
        />
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-600">
            Selecciona una herramienta
          </p>
        </div>
      </div>
    );
  }

  if (phase === "operacion") {
    if (!espacio) {
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
            <p className="text-sm font-bold text-slate-600">
              Selecciona un espacio en la Fase 1
            </p>
          </div>
        </div>
      );
    }

    if (activeOperationalCatalogItem) {
      return (
        <SalaOperationalElementInspector catalogItem={activeOperationalCatalogItem} />
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-600">
            Selecciona un elemento
          </p>
        </div>
      </div>
    );
  }

  if (!espacio) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-600">Sin espacio seleccionado</p>
        </div>
      </div>
    );
  }

  const handleTipoChange = (tipo: SalaEspacioType) => {
    onUpdateEspacio?.({ tipo });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-0.5">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <p className="mt-1 text-xs text-slate-500">Edición local · sin guardar</p>
      </div>

      <InspectorSection title="General">
        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-600">Nombre</span>
          <input
            type="text"
            value={espacio.name}
            onChange={(e) => onUpdateEspacio?.({ name: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[color-mix(in_srgb,var(--hostly-accent)_35%,#cbd5e1)] focus:ring-2 focus:ring-[var(--hostly-accent-soft)]"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-600">Tipo</span>
          <select
            value={espacio.tipo}
            onChange={(e) => handleTipoChange(e.target.value as SalaEspacioType)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[color-mix(in_srgb,var(--hostly-accent)_35%,#cbd5e1)]"
          >
            {SALA_ESPACIO_TYPE_OPTIONS.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-600">Color</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={espacio.color}
              onChange={(e) => onUpdateEspacio?.({ color: e.target.value })}
              className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            />
            <span className="text-xs font-semibold text-slate-500">{espacio.color}</span>
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-bold text-slate-600">Orden</span>
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
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[color-mix(in_srgb,var(--hostly-accent)_35%,#cbd5e1)]"
          />
        </label>
      </InspectorSection>

      <InspectorDivider />

      <InspectorSection title="Visibilidad">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
          <span className="text-sm font-bold text-slate-700">Visible</span>
          <input
            type="checkbox"
            checked={espacio.visible}
            onChange={(e) => onUpdateEspacio?.({ visible: e.target.checked })}
            className="h-4 w-4 accent-[var(--hostly-accent)]"
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
          <span className="text-sm font-bold text-slate-700">Activo</span>
          <input
            type="checkbox"
            checked={espacio.active}
            onChange={(e) => onUpdateEspacio?.({ active: e.target.checked })}
            className="h-4 w-4 accent-[var(--hostly-accent)]"
          />
        </label>
      </InspectorSection>

      <InspectorDivider />

      <InspectorSection title="Información">
        <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-3">
          <p className="text-sm font-extrabold text-slate-800">
            {elementCount} elemento{elementCount === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Tipo: {salaEspacioTypeLabel(espacio.tipo)}
          </p>
          <p className="mt-2 text-xs font-semibold text-slate-400">
            {elementCount > 0
              ? `${elementCount} elemento${elementCount === 1 ? "" : "s"} en este espacio`
              : "Sin estructura creada"}
          </p>
        </div>
      </InspectorSection>
    </div>
  );
}
