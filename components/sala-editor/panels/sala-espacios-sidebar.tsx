"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { sortSalaEspacios } from "@/lib/sala-editor/types/espacio";
import { SalaEspacioCard } from "@/components/sala-editor/panels/sala-espacio-card";
import { SalaEspaciosEmptyState } from "@/components/sala-editor/panels/sala-espacios-empty-state";

export type SalaEspaciosSidebarProps = {
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  elementCountByEspacioId: Record<string, number>;
  onSelectEspacio: (espacioId: string) => void;
  onRequestAddEspacio: () => void;
};

export function SalaEspaciosSidebar({
  espacios,
  selectedEspacioId,
  elementCountByEspacioId,
  onSelectEspacio,
  onRequestAddEspacio,
}: SalaEspaciosSidebarProps) {
  const sorted = sortSalaEspacios(espacios);

  if (sorted.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <SalaEspaciosEmptyState onCreateEspacio={onRequestAddEspacio} compact />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-900">Espacios</h3>
        <span className="text-[11px] font-bold text-slate-400">{sorted.length}</span>
      </div>

      <button
        type="button"
        onClick={onRequestAddEspacio}
        className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--hostly-accent)_22%,#cbd5e1)] bg-[var(--hostly-accent-soft)] px-3 text-sm font-extrabold text-[var(--hostly-accent)] transition hover:bg-[color-mix(in_srgb,var(--hostly-accent-soft)_88%,#dbeafe)]"
      >
        <span aria-hidden>+</span>
        Añadir espacio
      </button>

      <div className="h-px bg-slate-200/80" aria-hidden />

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
        {sorted.map((espacio) => (
          <li key={espacio.id}>
            <SalaEspacioCard
              espacio={espacio}
              selected={espacio.id === selectedEspacioId}
              elementCount={elementCountByEspacioId[espacio.id] ?? 0}
              onSelect={() => onSelectEspacio(espacio.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
