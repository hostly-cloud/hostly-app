"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";

export type SalaEspacioWorkspaceHeroProps = {
  espacio: SalaEspacio;
  restaurantId: string;
};

export function SalaEspacioWorkspaceHero({
  espacio,
  restaurantId,
}: SalaEspacioWorkspaceHeroProps) {
  return (
    <SalaEspacioCanvasFrame espacio={espacio} restaurantId={restaurantId}
      hint={
        <div className="hostly-sala-espacio-frame__hero">
          <p className="hostly-sala-espacio-frame__hero-title">Tu mapa está listo</p>
          <p className="hostly-sala-espacio-frame__hero-hint">
            Pasa a Estructura para dibujar · Operación para colocar mesas
          </p>
        </div>
      }
    />
  );
}
