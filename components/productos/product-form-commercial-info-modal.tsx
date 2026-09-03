"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import Image from "next/image";
import { HostlyButton } from "@/components/ui/hostly";
import { ProductAiImageReviewPanel } from "@/components/productos/product-ai-image-review-panel";
import { ProductCommercialIdentityPanel } from "@/components/productos/product-commercial-identity-panel";
import { PRODUCT_IMAGE_ACCEPT } from "@/lib/firebase/product-image-contract";
import { consumeProductCommercialEdit } from "@/lib/productos/product-commercial-edit-intent";

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
        <HostlyButton variant="secondary" size="compact" disabled={disabled} onClick={onEdit}>
          {editLabel}
        </HostlyButton>
      </div>
      <div className="hostly-product-commercial-summary__body">
        <p className="hostly-product-commercial-summary__description">
          {hasDescription ? descriptionPreview : emptyDescriptionLabel}
        </p>
        <div className="hostly-product-commercial-summary__image">
          {hasImage && imagePreviewUrl ? (
            <Image
              src={imagePreviewUrl}
              alt=""
              width={120}
              height={120}
              unoptimized
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
  productId?: string | null;
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
  productId = null,
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
  doneLabel = "Volver a la ficha",
}: ProductFormCommercialInfoModalProps) {
  const localFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = imageFileInputRef ?? localFileInputRef;
  const [aiResolvedImageUrl, setAiResolvedImageUrl] = useState<string | null>(null);
  const [imageReviewRevision, setImageReviewRevision] = useState(0);
  const [intentOpen, setIntentOpen] = useState(false);
  const effectiveOpen = open || intentOpen;

  useEffect(() => {
    if (open) return;
    if (consumeProductCommercialEdit(productId)) {
      setIntentOpen(true);
    }
  }, [open, productId]);

  const handleClose = useCallback(() => {
    setIntentOpen(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!effectiveOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disabled) {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [effectiveOpen, disabled, handleClose]);

  const handleAiImageUrlChange = useCallback((url: string | null) => {
    setAiResolvedImageUrl(url);
  }, []);

  const handleExactImageAttached = useCallback((url: string) => {
    setAiResolvedImageUrl(url);
    setImageReviewRevision((value) => value + 1);
  }, []);

  if (!effectiveOpen) return null;

  const titleName = productName.trim() || "Producto";
  const effectiveImagePreviewUrl = aiResolvedImageUrl ?? imagePreviewUrl;
  const effectiveShowImagePreview = Boolean(
    aiResolvedImageUrl || (showImagePreview && imagePreviewUrl),
  );
  const imageDraftMode = aiResolvedImageUrl
    ? "synced"
    : imagePreviewUrl?.startsWith("blob:")
      ? "manual_pending"
      : showImagePreview
        ? "synced"
        : "not_visible";

  return (
    <div
      className="hostly-product-commercial-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !disabled) handleClose();
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
          <HostlyButton variant="secondary" size="compact" disabled={disabled} onClick={handleClose}>
            Cerrar
          </HostlyButton>
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
              aria-describedby="product-form-commercial-description-hint"
              className={`hostly-product-commercial-modal__textarea ${drawerInputClass}`}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={5}
              disabled={disabled}
            />
            <p
              id="product-form-commercial-description-hint"
              className="hostly-product-commercial-modal__hint"
            >
              Describe ingredientes y presentación. Hostly usará este texto junto al nombre para proponer una imagen más fiel.
            </p>
          </div>

          {isCentralCatalog ? (
            <>
              <ProductCommercialIdentityPanel
                productId={productId}
                disabled={disabled}
                inputClassName={drawerInputClass}
                onExactImageAttached={handleExactImageAttached}
              />

              <div className="hostly-product-commercial-modal__image-block">
                <span className="hostly-product-commercial-modal__label">{t("carta.fieldFoto")}</span>
                {effectiveShowImagePreview && effectiveImagePreviewUrl ? (
                  <Image
                    src={effectiveImagePreviewUrl}
                    alt=""
                    width={640}
                    height={640}
                    unoptimized
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
                      setAiResolvedImageUrl(null);
                      void onImageFileChange(selected);
                    }}
                  />
                  <HostlyButton
                    variant="tool"
                    size="compact"
                    disabled={disabled}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {effectiveShowImagePreview && effectiveImagePreviewUrl
                      ? t("carta.fieldFotoChange")
                      : t("carta.fieldFotoUpload")}
                  </HostlyButton>
                  {effectiveShowImagePreview && effectiveImagePreviewUrl ? (
                    <HostlyButton
                      variant="secondary"
                      size="compact"
                      disabled={disabled}
                      onClick={() => {
                        setAiResolvedImageUrl(null);
                        onRemoveImage();
                      }}
                    >
                      {t("carta.fieldFotoRemove")}
                    </HostlyButton>
                  ) : null}
                </div>
                <p className="hostly-product-commercial-modal__hint">{t("carta.fieldFotoUploadHint")}</p>
                {imageDraftMode === "manual_pending" ? (
                  <p
                    className="hostly-product-commercial-modal__hint"
                    role="status"
                  >
                    {t("carta.fieldFotoPending")}
                  </p>
                ) : null}

                <ProductAiImageReviewPanel
                  key={`${productId ?? "new"}:${productName}:${imageReviewRevision}`}
                  open={effectiveOpen}
                  productId={productId}
                  productName={productName}
                  productDescription={description}
                  fallbackImageUrl={effectiveImagePreviewUrl}
                  imageDraftMode={imageDraftMode}
                  disabled={disabled}
                  onImageUrlChange={handleAiImageUrlChange}
                />
              </div>
            </>
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
          <HostlyButton variant="primary" size="compact" disabled={disabled} onClick={handleClose}>
            {doneLabel}
          </HostlyButton>
        </div>
      </div>
    </div>
  );
}
