"use client";

const DEFAULT_MESSAGE =
  "Selecciona un espacio o un elemento para ajustar sus detalles.";

export function SalaEditorInspectorEmpty({
  message = DEFAULT_MESSAGE,
}: {
  message?: string;
}) {
  return (
    <div className="hostly-sala-editor-inspector">
      <div className="hostly-sala-editor-empty py-6">
        <span className="hostly-sala-editor-empty__glyph" aria-hidden>
          ◧
        </span>
        <p className="hostly-sala-editor-empty__title">{message}</p>
      </div>
    </div>
  );
}
