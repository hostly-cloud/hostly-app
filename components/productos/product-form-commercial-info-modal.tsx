"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
} from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import { PRODUCT_IMAGE_ACCEPT } from "@/lib/firebase/product-image-contract";

const DESCRIPTION_PREVIEW_MAX = 140;

const commercialMobileStyles = `
@media (max-width: 767px) {
  .hostly-product-commercial-summary__body {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) 72px !important;
    align-items: stretch !important;
    gap: 8px !important;
    margin-top: 7px !important;
  }

  .hostly-product-commercial-summary__description {
    min-width: 0;
    margin: 0 !important;
    padding: 8px 9px !important;
    border-radius: 9px !important;
    background: var(--hostly-surface-page-soft) !important;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    font-size: 10.5px !important;
    line-height: 1.3 !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-product-commercial-summary__image {
    width: 72px !important;
    min-width: 72px !important;
    min-height: 64px !important;
    border-radius: 9px !important;
    overflow: hidden;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-product-commercial-summary__thumb {
    display: block;
    width: 100% !important;
    height: 100% !important;
    min-height: 64px !important;
    object-fit: cover !important;
  }

  .hostly-product-commercial-summary__image-empty {
    display: flex !important;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 64px;
    padding: 5px;
    text-align: center;
    font-size: 9px !important;
    line-height: 1.15 !important;
    color: var(--hostly-ink-faint) !important;
  }

  .hostly-product-commercial-modal-backdrop {
    padding: 0 !important;
    align-items: stretch !important;
  }

  .hostly-product-commercial-modal {
    width: 100vw !important;
    max-width: none !important;
    height: 100dvh !important;
    max-height: 100dvh !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }

  .hostly-product-commercial-modal__header {
    align-items: center !important;
    gap: 8px !important;
    padding: max(8px, env(safe-area-inset-top)) 10px 7px !important;
    background: rgba(255, 255, 255, 0.98) !important;
  }

  .hostly-product-commercial-modal__title {
    margin: 0 !important;
    font-size: 17px !important;
    line-height: 1.12 !important;
    letter-spacing: -0.02em !important;
  }

  .hostly-product-commercial-modal__subtitle {
    margin-top: 1px !important;
    max-width: 64vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px !important;
    line-height: 1.15 !important;
  }

  .hostly-product-commercial-modal__header > button {
    flex: 0 0 auto;
    min-height: 36px !important;
    padding: 6px 9px !important;
    border-radius: 9px !important;
    background: transparent !important;
    box-shadow: none !important;
    font-size: 11px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-commercial-modal__body {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    padding: 8px 10px 12px !important;
    overflow-y: auto !important;
    background: var(--hostly-surface-page-soft) !important;
  }

  .hostly-product-commercial-modal__field,
  .hostly-product-commercial-modal__image-block {
    padding: 9px 10px !important;
    border: 1px solid rgba(148, 163, 184, 0.16) !important;
    border-radius: 10px !important;
    background: #ffffff !important;
    box-shadow: none !important;
  }

  .hostly-product-commercial-modal__label {
    display: block !important;
    margin-bottom: 5px !important;
    font-size: 10.5px !important;
    font-weight: 720 !important;
    line-height: 1.15 !important;
    color: var(--hostly-ink-strong) !important;
  }

  .hostly-product-commercial-modal__textarea {
    min-height: 122px !important;
    padding: 9px 10px !important;
    border-radius: 10px !important;
    font-size: 13px !important;
    line-height: 1.4 !important;
    resize: vertical !important;
  }

  .hostly-product-commercial-modal__input {
    min-height: 42px !important;
    padding: 8px 10px !important;
    border-radius: 10px !important;
    font-size: 12px !important;
  }

  .hostly-product-commercial-modal__image-preview,
  .hostly-product-commercial-modal__image-placeholder {
    width: 100% !important;
    height: 164px !important;
    max-height: 164px !important;
    border-radius: 10px !important;
    object-fit: cover !important;
    overflow: hidden !important;
  }

  .hostly-product-commercial-modal__image-placeholder {
    display: flex !important;
    align-items: center;
    justify-content: center;
    padding: 12px !important;
    text-align: center;
    background: var(--hostly-surface-page-soft) !important;
    color: var(--hostly-ink-faint) !important;
    font-size: 10.5px !important;
    line-height: 1.25 !important;
  }

  .hostly-product-commercial-modal__image-actions {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
    margin-top: 7px !important;
  }

  .hostly-product-commercial-modal__image-actions > button {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    min-height: 38px !important;
    padding: 6px 8px !important;
    border-radius: 9px !important;
    box-shadow: none !important;
    font-size: 10.5px !important;
    line-height: 1.1 !important;
  }

  .hostly-product-commercial-modal__image-actions > button:last-child:not(:first-child) {
    flex: 0 0 auto !important;
    background: transparent !important;
    color: var(--hostly-ink-muted) !important;
  }

  .hostly-product-commercial-modal__hint {
    margin: 5px 0 0 !important;
    font-size: 9.5px !important;
    line-height: 1.25 !important;
    color: var(--hostly-ink-faint) !important;
  }

  .hostly-product-commercial-modal__footer {
    padding: 7px 10px max(8px, env(safe-area-inset-bottom)) !important;
    background: rgba(255, 255, 255, 0.98) !important;
    box-shadow: 0 -8px 24px rgba(15, 23, 42, 0.035) !important;
  }

  .hostly-product-commercial-modal__footer > button {
    width: 100% !important;
    min-height: 44px !important;
    border-radius: 11px !important;
    font-size: 12px !important;
    line-height: 1.1 !important;
  }
}
`;

function truncateDescription(text: string, max = DESCRIPTION_PREVIEW_MAX): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export type ProductFormCommercialInfoSummaryCardProps = {
  description: string;
  hasImage: boolean;
  imagePreviewUrl: string | null;
  onEdit: () => void;
  disabled?: boolean;
  editLabel?: string;
  emptyDescriptionLabel?: string;
  emptyImageLabel?: string;
};

export function ProductFormCommercialInfoSummaryCard({
  description,
  hasImage,
  imagePreviewUrl,
  onEdit,
  disabled = false,
  editLabel = "Editar información",
  emptyDescriptionLabel = "Sin descripción",
  emptyImageLabel = "Sin imagen",
}: ProductFormCommercialInfoSummaryCardProps) {
  const descriptionPreview = useMemo(() => truncateDescription(description), [description]);
  const hasDescription = Boolean(description.trim());

  return (
    <section className="hostly-product-escandallo-summary" aria-label="Información comercial">
      <style>{commercialMobileStyles}</style>
      <div className="hostly-product-escandallo-summary__head">
        <h3 className="hostly-product-escandallo-summary__title">Información comercial</h3>
        <ConfigBtnSecondary type="button" disabled={disabled} onClick={onEdit}>
          {editLabel}
        </ConfigBtnSecondary>
      </div>
      <div className="hostly-product-commercial-summary__body">
        <p className="hostly-product-commercial-summary__description">
          {hasDescription ? descriptionPreview : emptyDescriptionLabel}
        </p>
        <div className="hostly-product-commercial-summary__image">
          {hasImage && imagePreviewUrl ? (
            <img
              src={imagePreviewUrl}
              alt=""
              className="hostly-product-commercial-summary__thumb"
            />
          ) : (
            <span className="hostly-product-commercial-summary__image-empty">{emptyImageLabel}</span>
          )}
        </div>
      </div>
    </section>
  );
}

export type ProductFormCommercialInfoModalProps = {
  open: boolean;
  productName: string;
  isCentralCatalog: boolean;
  description: string;
  onDescriptionChange: (value: string) => void;
  fotoUrl: string;
  onFotoUrlChange: (value: string) => void;
  imagePreviewUrl: string | null;
  imageFileInputRef: RefObject<HTMLInputElement | null>;
  onImageFileChange: (file: File | null) => void | Promise<void>;
  onRemoveImage: () => void;
  showImagePreview: boolean;
  disabled?: boolean;
  drawerInputClass: string;
  t: (key: string) => string;
  onClose: () => void;
  doneLabel?: string;
};

export function ProductFormCommercialInfoModal({
  open,
  productName,
  isCentralCatalog,
  description,
  onDescriptionChange,
  fotoUrl,
  onFotoUrlChange,
  imagePreviewUrl,
  imageFileInputRef,
  onImageFileChange,
  onRemoveImage,
  showImagePreview,
  disabled = false,
  drawerInputClass,
  t,
  onClose,
  doneLabel = "Listo",
}: ProductFormCommercialInfoModalProps) {
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = imageFileInputRef ?? localFileInputRef;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, disabled, onClose]);

  if (!open) return null;

  const titleName = productName.trim() || "Producto";

  return (
    <div
      className="hostly-product-commercial-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !disabled) onClose();
      }}
    >
      <style>{commercialMobileStyles}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-commercial-info-modal-title"
        className="hostly-product-commercial-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="hostly-product-commercial-modal__header">
          <div className="hostly-product-commercial-modal__header-text">
            <h2
              id="product-form-commercial-info-modal-title"
              className="hostly-product-commercial-modal__title"
            >
              Información comercial
            </h2>
            <p className="hostly-product-commercial-modal__subtitle">{titleName}</p>
          </div>
          <ConfigBtnSecondary type="button" disabled={disabled} onClick={onClose}>
            Cerrar
          </ConfigBtnSecondary>
        </div>

        <div className="hostly-product-commercial-modal__body">
          <div className="hostly-product-commercial-modal__field">
            <label
              className="hostly-product-commercial-modal__label"
              htmlFor="product-form-commercial-description"
            >
              {t("carta.fieldDescripcion")}
            </label>
            <textarea
              id="product-form-commercial-description"
              className={`hostly-product-commercial-modal__textarea ${drawerInputClass}`}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={5}
              disabled={disabled}
            />
          </div>

          {isCentralCatalog ? (
            <div className="hostly-product-commercial-modal__image-block">
              <span className="hostly-product-commercial-modal__label">{t("carta.fieldFoto")}</span>
              {showImagePreview && imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt=""
                  className="hostly-product-commercial-modal__image-preview"
                />
              ) : (
                <div className="hostly-product-commercial-modal__image-placeholder" aria-hidden>
                  {t("carta.fieldFotoEmpty")}
                </div>
              )}
              <div className="hostly-product-commercial-modal__image-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={PRODUCT_IMAGE_ACCEPT}
                  className="hostly-product-commercial-modal__file-input"
                  disabled={disabled}
                  onChange={(e) => {
                    const selected = e.target.files?.[0] ?? null;
                    void onImageFileChange(selected);
                  }}
                />
                <ConfigBtnSecondary
                  type="button"
                  disabled={disabled}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {showImagePreview && imagePreviewUrl
                    ? t("carta.fieldFotoChange")
                    : t("carta.fieldFotoUpload")}
                </ConfigBtnSecondary>
                {showImagePreview && imagePreviewUrl ? (
                  <ConfigBtnSecondary type="button" disabled={disabled} onClick={onRemoveImage}>
                    {t("carta.fieldFotoRemove")}
                  </ConfigBtnSecondary>
                ) : null}
              </div>
              <p className="hostly-product-commercial-modal__hint">{t("carta.fieldFotoUploadHint")}</p>
            </div>
          ) : (
            <div className="hostly-product-commercial-modal__field">
              <label
                className="hostly-product-commercial-modal__label"
                htmlFor="product-form-commercial-foto-url"
              >
                {t("carta.fieldFoto")}
              </label>
              <input
                id="product-form-commercial-foto-url"
                className={`hostly-product-commercial-modal__input ${drawerInputClass}`}
                value={fotoUrl}
                onChange={(e) => onFotoUrlChange(e.target.value)}
                placeholder="https://…"
                disabled={disabled}
              />
              <p className="hostly-product-commercial-modal__hint">{t("carta.fieldFotoHint")}</p>
            </div>
          )}
        </div>

        <div className="hostly-product-commercial-modal__footer">
          <ConfigBtnPrimary type="button" disabled={disabled} onClick={onClose}>
            {doneLabel}
          </ConfigBtnPrimary>
        </div>
      </div>
    </div>
  );
}
