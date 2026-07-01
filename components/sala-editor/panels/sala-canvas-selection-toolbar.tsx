"use client";

export type SalaCanvasSelectionToolbarProps = {
  onDuplicate: () => void;
  onDelete: () => void;
};

export function SalaCanvasSelectionToolbar({
  onDuplicate,
  onDelete,
}: SalaCanvasSelectionToolbarProps) {
  return (
    <div className="hostly-sala-canvas-toolbar" role="toolbar" aria-label="Acciones rápidas">
      <button
        type="button"
        className="hostly-sala-canvas-toolbar__btn"
        title="Duplicar"
        aria-label="Duplicar"
        onClick={(event) => {
          event.stopPropagation();
          onDuplicate();
        }}
      >
        <span aria-hidden>⧉</span>
      </button>
      <button
        type="button"
        className="hostly-sala-canvas-toolbar__btn hostly-sala-canvas-toolbar__btn--danger"
        title="Eliminar"
        aria-label="Eliminar"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <span aria-hidden>⌫</span>
      </button>
      <button
        type="button"
        className="hostly-sala-canvas-toolbar__btn"
        title="Bloquear — próximamente"
        aria-label="Bloquear — próximamente"
        disabled
      >
        <span aria-hidden>🔒</span>
      </button>
      <button
        type="button"
        className="hostly-sala-canvas-toolbar__btn"
        title="Más — próximamente"
        aria-label="Más opciones — próximamente"
        disabled
      >
        <span aria-hidden>⋯</span>
      </button>
    </div>
  );
}
