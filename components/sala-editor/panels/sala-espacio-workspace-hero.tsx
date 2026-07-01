"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { salaEspacioTypeIcon } from "@/lib/sala-editor/catalog/espacio-types";

export type SalaEspacioWorkspaceHeroProps = {
  espacio: SalaEspacio;
};

export function SalaEspacioWorkspaceHero({ espacio }: SalaEspacioWorkspaceHeroProps) {
  const icon = salaEspacioTypeIcon(espacio.tipo);

  return (
    <div className="hostly-sala-editor-canvas-frame">
      <div className="hostly-sala-editor-empty">
        <div
          className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl text-xl"
          style={{
            backgroundColor: `${espacio.color}18`,
            boxShadow: `inset 0 0 0 1px ${espacio.color}33`,
          }}
          aria-hidden
        >
          {icon}
        </div>
        <p className="hostly-sala-editor-empty__title">{espacio.name}</p>
        <p className="hostly-sala-editor-empty__hint">
          Edita propiedades en el inspector · pasa a Estructura para dibujar.
        </p>
      </div>
    </div>
  );
}
