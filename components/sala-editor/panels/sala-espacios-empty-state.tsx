"use client";

export type SalaEspaciosEmptyStateProps = {
  onCreateEspacio: () => void;
  compact?: boolean;
};

export function SalaEspaciosEmptyState({
  onCreateEspacio,
  compact = false,
}: SalaEspaciosEmptyStateProps) {
  return (
    <div className="hostly-sala-editor-canvas-frame">
      <div className="hostly-sala-editor-empty">
        <span className="hostly-sala-editor-empty__glyph" aria-hidden>
          ◫
        </span>
        <p className="hostly-sala-editor-empty__title">Crea tu primer espacio</p>
        <p className="hostly-sala-editor-empty__hint">
          {compact
            ? "Empieza diseñando la sala."
            : "Empieza diseñando la sala de tu restaurante."}
        </p>
        <button
          type="button"
          onClick={onCreateEspacio}
          className="hostly-sala-editor-sidebar-action mt-3 max-w-[200px]"
        >
          Crear espacio
        </button>
      </div>
    </div>
  );
}
