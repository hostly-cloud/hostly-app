"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";

export type SalaEspacioWorkspaceHeroProps = {
  espacio: SalaEspacio;
};

export function SalaEspacioWorkspaceHero({ espacio }: SalaEspacioWorkspaceHeroProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);

  return (
    <div className="hostly-sala-editor-canvas-frame hostly-sala-editor-canvas-frame--canvas">
      <div className="hostly-sala-editor-canvas-frame__surface relative flex items-center justify-center">
        <div className="hostly-sala-editor-dot-grid" aria-hidden />

        <div className="hostly-sala-editor-empty relative">
          <div
            className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-sm"
            style={{
              backgroundColor: `${espacio.color}20`,
              boxShadow: `inset 0 0 0 1px ${espacio.color}30`,
            }}
            aria-hidden
          >
            {icon}
          </div>
          <p className="hostly-sala-editor-empty__title">{espacio.name}</p>
          <p className="hostly-sala-editor-empty__hint">
            Inspector · Estructura para dibujar
          </p>
        </div>
      </div>
    </div>
  );
}
