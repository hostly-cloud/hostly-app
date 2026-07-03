"use client";

import type { CSSProperties } from "react";

export type SalaEditorCanvasToolHintProps = {
  icon?: string;
  swatch?: string;
  text: string;
  visible?: boolean;
};

export function SalaEditorCanvasToolHint({
  icon,
  swatch,
  text,
  visible = true,
}: SalaEditorCanvasToolHintProps) {
  if (!visible || text.trim() === "") return null;

  return (
    <div
      className="hostly-sala-editor-tool-hint"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {swatch ? (
        <span
          className="hostly-sala-editor-tool-hint__swatch"
          style={{ background: swatch } as CSSProperties}
          aria-hidden
        />
      ) : icon ? (
        <span className="hostly-sala-editor-tool-hint__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="hostly-sala-editor-tool-hint__text">{text}</span>
    </div>
  );
}
