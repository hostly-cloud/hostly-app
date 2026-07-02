"use client";

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
          Sin mapas
        </p>
        <button type="button" onClick={onCreateEspacio} className="hostly-sala-editor-toolbox__add" title="Crear mapa">
          <span aria-hidden>+</span>
        </button>
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
          <p className="hostly-sala-editor-empty__title">Crea tu primer mapa</p>
          <p className="hostly-sala-editor-empty__hint">Empieza diseñando un plano operativo.</p>
          <button
            type="button"
            onClick={onCreateEspacio}
            className="hostly-sala-editor-sidebar-action mt-3 max-w-[200px]"
          >
            Crear mapa
          </button>
        </div>
      </div>
    </div>
  );
}
