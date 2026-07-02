"use client";

export type SalaEditorHistoryControlsProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

export function SalaEditorHistoryControls({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: SalaEditorHistoryControlsProps) {
  return (
    <div
      className="hostly-sala-editor-workbench__history-controls"
      role="group"
      aria-label="Historial de edición"
    >
      <button
        type="button"
        className="hostly-sala-editor-workbench__history-btn"
        disabled={!canUndo}
        aria-label="Deshacer"
        title="Deshacer"
        onClick={onUndo}
      >
        <span className="hostly-sala-editor-workbench__history-btn-icon" aria-hidden>
          ↶
        </span>
        <span className="hostly-sala-editor-workbench__history-btn-label">Deshacer</span>
      </button>
      <button
        type="button"
        className="hostly-sala-editor-workbench__history-btn"
        disabled={!canRedo}
        aria-label="Rehacer"
        title="Rehacer"
        onClick={onRedo}
      >
        <span className="hostly-sala-editor-workbench__history-btn-icon" aria-hidden>
          ↷
        </span>
        <span className="hostly-sala-editor-workbench__history-btn-label">Rehacer</span>
      </button>
    </div>
  );
}
