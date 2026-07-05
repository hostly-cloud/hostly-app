"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { SALA_ESPACIO_PRESET_CATALOG } from "@/lib/sala-editor/catalog/espacio-presets";
import { sortSalaEspacios } from "@/lib/sala-editor/types/espacio";

export type SalaEspaciosPhasePanelProps = {
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  onSelectEspacio?: (espacioId: string) => void;
};

/**
 * Panel Fase 1 — gestión de espacios (scaffold).
 * Sin persistencia; lista y presets para validar arquitectura.
 */
export function SalaEspaciosPhasePanel({
  espacios,
  selectedEspacioId,
  onSelectEspacio,
}: SalaEspaciosPhasePanelProps) {
  const sorted = sortSalaEspacios(espacios);

  return (
    <div className="flex min-h-[240px] flex-col gap-3">
      <p className="text-sm text-slate-600">
        Crea y ordena los espacios del restaurante con nombre, color,
        visibilidad y orden.
      </p>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-700">Sin espacios creados</p>
          <p className="mt-1 text-xs text-slate-500">
            Ejemplos sugeridos: Sala principal, Terraza, Barra, VIP…
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {SALA_ESPACIO_PRESET_CATALOG.slice(0, 4).map((preset) => (
              <span
                key={preset.key}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600"
              >
                {preset.label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((espacio) => {
            const selected = espacio.id === selectedEspacioId;
            return (
              <li key={espacio.id}>
                <button
                  type="button"
                  onClick={() => onSelectEspacio?.(espacio.id)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                    selected
                      ? "border-[color-mix(in_srgb,var(--hostly-accent)_38%,#e2e8f0)] bg-[var(--hostly-accent-soft)]"
                      : "border-slate-200/80 bg-white hover:border-slate-300",
                  ].join(" ")}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: espacio.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-slate-900">
                      {espacio.name}
                    </span>
                    <span className="block text-[11px] font-semibold text-slate-500">
                      Orden {espacio.sortOrder}
                      {!espacio.visible ? " · Oculto" : ""}
                      {!espacio.active ? " · Inactivo" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
