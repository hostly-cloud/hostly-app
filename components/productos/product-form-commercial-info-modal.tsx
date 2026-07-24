"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
} from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import { PRODUCT_IMAGE_ACCEPT } from "@/lib/firebase/product-image-contract";

const DESCRIPTION_PREVIEW_MAX = 140;

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
