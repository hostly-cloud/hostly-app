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
    return <SalaEspaciosEmptyState onCreateEspacio={onRequestAddEspacio} compact />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="hostly-sala-editor-sidebar-heading">
        <h3 className="hostly-sala-editor-sidebar-heading__title">Espacios</h3>
        <span className="hostly-sala-editor-sidebar-heading__count">{sorted.length}</span>
      </div>

      <button type="button" onClick={onRequestAddEspacio} className="hostly-sala-editor-sidebar-action">
        <span aria-hidden>+</span>
        Añadir
      </button>

      <ul className="hostly-sala-editor-sidebar-list">
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
