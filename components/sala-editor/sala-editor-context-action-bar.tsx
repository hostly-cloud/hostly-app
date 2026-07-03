"use client";

export type SalaEditorContextActionTargetKind =
  | "surface"
  | "wall"
  | "door"
  | "glass"
  | "operational";

export type SalaEditorContextActionTarget = {
  kind: SalaEditorContextActionTargetKind;
  label: string;
  icon: string;
  onDelete: () => void;
};

export type SalaEditorContextActionBarProps = {
  target: SalaEditorContextActionTarget | null;
};

const UPCOMING_ACTIONS = [
  "Duplicar",
  "Bloquear",
  "Traer delante",
  "Enviar detrás",
] as const;

export function SalaEditorContextActionBar({
  target,
}: SalaEditorContextActionBarProps) {
  if (!target) return null;

  return (
    <div className="hostly-sala-context-action-bar" role="toolbar" aria-label="Acciones del objeto seleccionado">
      <div className="hostly-sala-context-action-bar__target">
        <span className="hostly-sala-context-action-bar__icon" aria-hidden>
          {target.icon}
        </span>
        <span className="hostly-sala-context-action-bar__label">{target.label}</span>
      </div>

      <div className="hostly-sala-context-action-bar__actions">
        <button
          type="button"
          className="hostly-sala-context-action-bar__action hostly-sala-context-action-bar__action--danger"
          onClick={target.onDelete}
        >
          <span aria-hidden>🗑</span>
          Eliminar
        </button>
        {UPCOMING_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className="hostly-sala-context-action-bar__action"
            disabled
            aria-disabled="true"
            title="Próximamente"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
