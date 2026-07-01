"use client";

import type { ReactNode } from "react";

export type SalaEditorEmptyStateProps = {
  title: string;
  hint?: string;
  glyph?: string;
  action?: ReactNode;
};

export function SalaEditorEmptyState({
  title,
  hint,
  glyph = "◫",
  action,
}: SalaEditorEmptyStateProps) {
  return (
    <div className="hostly-sala-editor-empty hostly-sala-editor-canvas-frame">
      <span className="hostly-sala-editor-empty__glyph" aria-hidden>
        {glyph}
      </span>
      <p className="hostly-sala-editor-empty__title">{title}</p>
      {hint ? <p className="hostly-sala-editor-empty__hint">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
