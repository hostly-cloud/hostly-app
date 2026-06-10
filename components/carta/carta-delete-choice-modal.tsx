"use client";

import type { ReactNode } from "react";

export type CartaDeleteChoiceModalProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  deactivateLabel: string;
  deletePermanentLabel: string;
  deletePermanentHint?: string;
  cancelLabel: string;
  busy?: boolean;
  onDeactivate: () => void;
  onDeletePermanent: () => void;
  onCancel: () => void;
};

export function CartaDeleteChoiceModal({
  open,
  title,
  message,
  deactivateLabel,
  deletePermanentLabel,
  deletePermanentHint,
  cancelLabel,
  busy,
  onDeactivate,
  onDeletePermanent,
  onCancel,
}: CartaDeleteChoiceModalProps) {
  if (!open) return null;

  return (
    <div
      className="hostly-carta-delete-choice-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hostly-carta-delete-choice-title"
        className="hostly-carta-delete-choice-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="hostly-carta-delete-choice-title" className="hostly-carta-delete-choice-modal__title">
          {title}
        </h2>
        <div className="hostly-carta-delete-choice-modal__message">{message}</div>
        {deletePermanentHint ? (
          <p className="hostly-carta-delete-choice-modal__hint">{deletePermanentHint}</p>
        ) : null}
        <div className="hostly-carta-delete-choice-modal__actions">
          <button
            type="button"
            className="hostly-button-secondary hostly-button-compact"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="hostly-button-secondary hostly-button-compact"
            disabled={busy}
            onClick={onDeactivate}
          >
            {deactivateLabel}
          </button>
          <button
            type="button"
            className="hostly-button-danger hostly-button-compact"
            disabled={busy}
            onClick={onDeletePermanent}
          >
            {deletePermanentLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
