"use client";

import type { CSSProperties } from "react";
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
  /** primary = fase Espacios · switcher = selector compacto en Estructura/Operación */
  mode?: "primary" | "switcher";
};

export function SalaEspaciosSidebar({
  espacios,
  selectedEspacioId,
  elementCountByEspacioId,
  onSelectEspacio,
  onRequestAddEspacio,
  onUpdateEspacio,
  mode = "primary",
}: SalaEspaciosSidebarProps) {
  const sorted = sortSalaEspacios(espacios);

  if (sorted.length === 0) {
    return <SalaEspaciosEmptyState onCreateEspacio={onRequestAddEspacio} compact />;
  }

  const isSwitcher = mode === "switcher";

  if (isSwitcher) {
    return (
      <div className="hostly-sala-editor-space-switcher">
        <p className="hostly-sala-editor-space-switcher__label">Mapa activo</p>
        <ul className="hostly-sala-editor-space-switcher__list">
          {sorted.map((espacio) => {
            const selected = espacio.id === selectedEspacioId;
            return (
              <li key={espacio.id}>
                <button
                  type="button"
                  className={[
                    "hostly-sala-editor-space-switcher__item",
                    selected ? "is-selected" : "",
                    !espacio.active ? "is-inactive" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ "--espacio-accent": espacio.color } as CSSProperties}
                  onClick={() => onSelectEspacio(espacio.id)}
                  title={espacio.name}
                  aria-current={selected ? "true" : undefined}
                >
                  <span
                    className="hostly-sala-editor-space-switcher__dot"
                    style={{ backgroundColor: espacio.color }}
                    aria-hidden
                  />
                  <span className="hostly-sala-editor-space-switcher__name">
                    {espacio.name}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="hostly-sala-editor-space-switcher__add"
          onClick={onRequestAddEspacio}
        >
          <span aria-hidden>+</span>
          Nuevo mapa
        </button>
      </div>
    );
  }

  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--spaces">
      <button
        type="button"
        onClick={onRequestAddEspacio}
        className="hostly-sala-editor-toolbox__add hostly-sala-editor-toolbox__add--icon"
        title="Añadir mapa"
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
