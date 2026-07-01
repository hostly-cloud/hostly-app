"use client";

import type { SalaEditorPhase } from "@/lib/sala-editor/types/editor-navigation";
import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";

export type SalaEditorInspectorPanelProps = {
  phase: SalaEditorPhase;
  espacio: SalaEspacio | null;
  onUpdateEspacio?: (patch: Partial<SalaEspacioDraft>) => void;
};

export function SalaEditorInspectorPanel({
  phase,
  espacio,
  onUpdateEspacio,
}: SalaEditorInspectorPanelProps) {
  if (phase !== "espacios" || !espacio) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <h3 className="text-sm font-extrabold text-slate-900">Inspector</h3>
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-600">
            {phase === "estructura"
              ? "Selecciona un espacio para continuar"
              : phase === "operacion"
                ? "Elementos operativos en preview"
                : "Sin espacio seleccionado"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Los detalles editables aparecen en la Fase 1.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">Espacio</h3>
        <p className="mt-1 text-xs text-slate-500">
          Edición local — no se guarda en Firestore.
        </p>
      </div>

      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-400">
            Nombre
          </span>
          <input
            type="text"
            value={espacio.name}
            onChange={(e) => onUpdateEspacio?.({ name: e.target.value })}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[color-mix(in_srgb,var(--hostly-accent)_35%,#cbd5e1)] focus:ring-2 focus:ring-[var(--hostly-accent-soft)]"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-400">
            Color
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={espacio.color}
              onChange={(e) => onUpdateEspacio?.({ color: e.target.value })}
              className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            />
            <input
              type="text"
              value={espacio.color}
              onChange={(e) => onUpdateEspacio?.({ color: e.target.value })}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-[color-mix(in_srgb,var(--hostly-accent)_35%,#cbd5e1)]"
            />
          </div>
        </label>

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

        <label className="block space-y-1">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-slate-400">
            Orden
          </span>
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
      </div>
    </div>
  );
}
