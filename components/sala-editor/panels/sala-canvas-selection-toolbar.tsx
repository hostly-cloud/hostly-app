"use client";

import { HostlyButton } from "@/components/ui/hostly";

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
      <HostlyButton
        variant="icon"
        size="compact"
        iconOnlyLabel="Duplicar"
        className="hostly-sala-canvas-toolbar__btn"
        title="Duplicar"
        onClick={(event) => {
          event.stopPropagation();
          onDuplicate();
        }}
      >
        <span aria-hidden>⧉</span>
      </HostlyButton>
      <HostlyButton
        variant="destructive"
        size="compact"
        aria-label="Eliminar"
        className="hostly-sala-canvas-toolbar__btn hostly-sala-canvas-toolbar__btn--danger"
        title="Eliminar"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <span aria-hidden>⌫</span>
      </HostlyButton>
      <HostlyButton
        variant="icon"
        size="compact"
        iconOnlyLabel="Bloquear — próximamente"
        className="hostly-sala-canvas-toolbar__btn"
        title="Bloquear — próximamente"
        disabled
      >
        <span aria-hidden>🔒</span>
      </HostlyButton>
      <HostlyButton
        variant="icon"
        size="compact"
        iconOnlyLabel="Más opciones — próximamente"
        className="hostly-sala-canvas-toolbar__btn"
        title="Más — próximamente"
        disabled
      >
        <span aria-hidden>⋯</span>
      </HostlyButton>
    </div>
  );
}
