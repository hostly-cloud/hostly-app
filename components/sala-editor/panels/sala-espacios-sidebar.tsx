"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { sortSalaEspacios } from "@/lib/sala-editor/types/espacio";

export type SalaEspaciosSidebarProps = {
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  onSelectEspacio: (espacioId: string) => void;
  onAddEspacio: () => void;
  canAddEspacio: boolean;
};

export function SalaEspaciosSidebar({
  espacios,
  selectedEspacioId,
  onSelectEspacio,
  onAddEspacio,
  canAddEspacio,
}: SalaEspaciosSidebarProps) {
  const sorted = sortSalaEspacios(espacios);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-900">Espacios</h3>
      </div>

      <button
        type="button"
        disabled={!canAddEspacio}
        onClick={onAddEspacio}
        className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--hostly-accent)_22%,#cbd5e1)] bg-[var(--hostly-accent-soft)] px-3 text-sm font-extrabold text-[var(--hostly-accent)] transition hover:bg-[color-mix(in_srgb,var(--hostly-accent-soft)_88%,#dbeafe)] disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span aria-hidden>+</span>
        Añadir espacio
      </button>

      <div className="h-px bg-slate-200/80" aria-hidden />

      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5">
        {sorted.map((espacio) => {
          const selected = espacio.id === selectedEspacioId;
          return (
            <li key={espacio.id}>
              <button
                type="button"
                onClick={() => onSelectEspacio(espacio.id)}
                className={[
                  "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
                  selected
                    ? "border-[color-mix(in_srgb,var(--hostly-accent)_38%,#e2e8f0)] bg-[var(--hostly-accent-soft)]"
                    : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50",
                ].join(" ")}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: espacio.color }}
                  aria-hidden
                />
                <span className="truncate text-sm font-extrabold text-slate-900">
                  {espacio.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
