"use client";

import { HostlyButton } from "@/components/ui/hostly";

export type SalaEspaciosEmptyStateProps = {
  onCreateEspacio: () => void;
  compact?: boolean;
};

export function SalaEspaciosEmptyState({
  onCreateEspacio,
  compact = false,
}: SalaEspaciosEmptyStateProps) {
  if (compact) {
    return (
      <div className="hostly-sala-editor-toolbox">
        <p className="hostly-sala-editor-toolbox__label" style={{ padding: "2px" }}>
          Sin espacios
        </p>
        <HostlyButton
          variant="icon"
          size="compact"
          iconOnlyLabel="Crear espacio"
          onClick={onCreateEspacio}
          className="hostly-sala-editor-toolbox__add"
          title="Crear espacio"
        >
          <span aria-hidden>+</span>
        </HostlyButton>
      </div>
    );
  }

  return (
    <div className="hostly-sala-editor-canvas-frame hostly-sala-editor-canvas-frame--canvas">
      <div className="hostly-sala-editor-canvas-frame__surface relative flex items-center justify-center">
        <div className="hostly-sala-editor-dot-grid" aria-hidden />

        <div className="hostly-sala-editor-empty relative">
          <span className="hostly-sala-editor-empty__glyph" aria-hidden>
            ◫
          </span>
          <p className="hostly-sala-editor-empty__title">Crea un espacio de tu restaurante</p>
          <p className="hostly-sala-editor-empty__hint">Sala, terraza, reservado o la zona que quieras preparar ahora.</p>
          <HostlyButton
            variant="primary"
            size="compact"
            onClick={onCreateEspacio}
            className="hostly-sala-editor-sidebar-action mt-3 max-w-[200px]"
          >
            Crear espacio
          </HostlyButton>
        </div>
      </div>
    </div>
  );
}
