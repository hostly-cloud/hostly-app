"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioBasePatch } from "@/lib/sala-editor/base/espacio-base-editor";
import { SalaBaseConfigPanel } from "@/components/sala-editor/panels/sala-base-config-panel";

export type SalaBaseSidebarProps = {
  espacio: SalaEspacio | null;
  onUpdateBase: (espacioId: string, patch: SalaEspacioBasePatch) => void;
};

export function SalaBaseSidebar({ espacio, onUpdateBase }: SalaBaseSidebarProps) {
  if (!espacio) {
    return (
      <div className="hostly-sala-editor-toolbox hostly-sala-base-config hostly-sala-base-config--empty">
        <p className="hostly-sala-base-config__empty">
          Selecciona un mapa para preparar su base.
        </p>
      </div>
    );
  }

  return (
    <div className="hostly-sala-editor-toolbox hostly-sala-editor-toolbox--base-config">
      <SalaBaseConfigPanel
        espacio={espacio}
        onUpdateBase={(patch) => onUpdateBase(espacio.id, patch)}
      />
    </div>
  );
}
