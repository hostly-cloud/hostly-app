"use client";

import type { SalaEspacio, SalaEspacioDraft } from "@/lib/sala-editor/types/espacio";
import { sortSalaEspacios } from "@/lib/sala-editor/types/espacio";
import { SalaEspacioCard } from "@/components/sala-editor/panels/sala-espacio-card";
import { SalaEspaciosEmptyState } from "@/components/sala-editor/panels/sala-espacios-empty-state";

export type SalaEspaciosSidebarProps = {
  espacios: SalaEspacio[];
  selectedEspacioId: string | null;
  elementCountByEspacioId: Record<string, number>;
  onSelectEspacio: (espacioId: string) => void;
  onRequestAddEspacio: () => void;
  onUpdateEspacio?: (espacioId: string, patch: Partial<SalaEspacioDraft>) => void;
};

export function SalaEspaciosSidebar({
  espacios,
  selectedEspacioId,
  elementCountByEspacioId,
  onSelectEspacio,
  onRequestAddEspacio,
  onUpdateEspacio,
}: SalaEspaciosSidebarProps) {
  const sorted = sortSalaEspacios(espacios);

  if (sorted.length === 0) {
    return <SalaEspaciosEmptyState onCreateEspacio={onRequestAddEspacio} compact />;
  }

  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--spaces">
      <button
        type="button"
        onClick={onRequestAddEspacio}
        className="hostly-sala-editor-toolbox__add hostly-sala-editor-toolbox__add--icon"
        title="Añadir espacio"
      >
        <span aria-hidden>+</span>
      </button>

      <ul className="hostly-sala-editor-space-grid">
        {sorted.map((espacio) => (
          <li key={espacio.id}>
            <SalaEspacioCard
              espacio={espacio}
              selected={espacio.id === selectedEspacioId}
              elementCount={elementCountByEspacioId[espacio.id] ?? 0}
              onSelect={() => onSelectEspacio(espacio.id)}
              onUpdateEspacio={
                onUpdateEspacio
                  ? (patch) => onUpdateEspacio(espacio.id, patch)
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
