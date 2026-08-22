"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
} from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import type {
  ProductImageReviewAction,
  ProductImageReviewResolution,
} from "@/lib/productos/product-image-review-contract";
import {
  ProductImageReviewApiError,
  fetchProductImageReviewState,
  generateProductImageForReview,
  submitProductImageReview,
} from "@/lib/productos/product-image-review-api";
import {
  buildProductImageReviewView,
  type ProductImageReviewUiAction,
} from "@/lib/productos/product-image-review-view";

export type ProductAiImageReviewPanelProps = {
  open: boolean;
  productName: string;
  fallbackImageUrl: string | null;
  imageDraftMode: "synced" | "manual_pending" | "not_visible";
  disabled?: boolean;
  onImageUrlChange: (url: string | null) => void;
};

function friendlyError(error: unknown): string {
  if (error instanceof ProductImageReviewApiError) {
    switch (error.code) {
      case "IMAGE_GENERATION_NOT_CONFIGURED":
        return "La generación de imágenes todavía no está configurada en este entorno.";
      case "IMAGE_PROVIDER_TIMEOUT":
        return "La generación ha tardado demasiado. Puedes volver a intentarlo.";
      case "IMAGE_PROVIDER_FAILED":
      case "IMAGE_PROVIDER_INVALID_RESPONSE":
      case "IMAGE_PROVIDER_EMPTY_RESPONSE":
        return "El proveedor de imágenes no pudo completar la generación.";
      case "PRODUCT_IMAGE_PROTECTED":
        return "La imagen actual está protegida y no se puede modificar desde esta revisión.";
      case "PRODUCT_IMAGE_REVIEW_STATE_INVALID":
        return "El estado de la imagen ha cambiado. Actualiza antes de continuar.";
      case "GENERATION_CONFIRMATION_REQUIRED":
        return "Debes confirmar expresamente la generación.";
      default:
        return error.message || error.code;
    }
  }
  return error instanceof Error ? error.message : "No se pudo completar la operación.";
}

function skippedGenerationMessage(reason: string): string {
  switch (reason) {
    case "generation_in_progress":
      return "Ya hay una generación en curso para este producto.";
    case "protected_existing_image":
      return "La imagen quedó protegida antes de terminar la generación y no se sustituyó.";
    case "branded_or_beverage":
      return "Este producto necesita una imagen real de catálogo, no una imagen generada.";
    case "not_food":
      return "La generación está limitada por ahora a platos de comida.";
    case "not_imported":
      return "La generación está habilitada por ahora para platos importados.";
    default:
      return "Hostly no ha generado una imagen para este producto.";
  }
}

function toneStyle(
  tone: "neutral" | "info" | "success" | "warning" | "danger",
) {
  if (tone === "success") {
    return {
      border: "1px solid rgba(34, 197, 94, 0.28)",
      background: "rgba(240, 253, 244, 0.95)",
      color: "#166534",
    };
  }
  if (tone === "warning") {
    return {
      border: "1px solid rgba(245, 158, 11, 0.3)",
      background: "rgba(255, 251, 235, 0.96)",
      color: "#92400e",
    };
  }
  if (tone === "danger") {
    return {
      border: "1px solid rgba(239, 68, 68, 0.25)",
      background: "rgba(254, 242, 242, 0.96)",
      color: "#991b1b",
    };
  }
  if (tone === "info") {
    return {
      border: "1px solid rgba(56, 189, 248, 0.28)",
      background: "rgba(240, 249, 255, 0.96)",
      color: "#075985",
    };
  }
  return {
    border: "1px solid rgba(148, 163, 184, 0.24)",
    background: "rgba(248, 250, 252, 0.9)",
    color: "#475569",
  };
}

export function ProductAiImageReviewPanel({
  open,
  productName,
  fallbackImageUrl,
  imageDraftMode,
  disabled = false,
  onImageUrlChange,
}: ProductAiImageReviewPanelProps) {
  const [state, setState] = useState<ProductImageReviewResolution | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<ProductImageReviewUiAction | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const lastAiAppliedUrlRef = useRef<string | null>(null);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  useEffect(() => {
    lastAiAppliedUrlRef.current = null;
    setState(null);
    setError(null);
    setNotice(null);
  }, [productName, open]);

  useEffect(() => {
    const name = productName.trim();
    if (!open || !name) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchProductImageReviewState(name)
      .then((next) => {
        if (cancelled) return;
        setState(next);
        if (next.resolution === "resolved" && next.imageUrl) {
          if (
            lastAiAppliedUrlRef.current === next.imageUrl ||
            !fallbackImageUrl ||
            fallbackImageUrl === next.imageUrl
          ) {
            onImageUrlChange(next.imageUrl);
          }
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(friendlyError(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    productName,
    refreshToken,
    fallbackImageUrl,
    onImageUrlChange,
  ]);

  const resolved = state?.resolution === "resolved" ? state : null;
  const localImageDraftDirty = Boolean(
    imageDraftMode === "manual_pending" ||
      (imageDraftMode === "not_visible" &&
        resolved?.hasImage &&
        !lastAiAppliedUrlRef.current),
  );
  const view = useMemo(
    () => (resolved ? buildProductImageReviewView(resolved, localImageDraftDirty) : null),
    [resolved, localImageDraftDirty],
  );

  const runGeneration = useCallback(async () => {
    if (!resolved || disabled || busyAction) return;
    const confirmed = window.confirm(
      "Generar una imagen con IA puede tener coste. La imagen quedará pendiente de revisión. ¿Continuar?",
    );
    if (!confirmed) return;

    const action: ProductImageReviewUiAction = resolved.hasImage
      ? "regenerate"
      : "generate";
    setBusyAction(action);
    setError(null);
    setNotice(null);
    try {
      const result = await generateProductImageForReview(resolved.productId);
      if (result.outcome === "generated") {
        lastAiAppliedUrlRef.current = result.imageUrl;
        onImageUrlChange(result.imageUrl);
        setNotice("Imagen generada. Revísala antes de aprobarla.");
      } else {
        setNotice(skippedGenerationMessage(result.reason));
      }
      refresh();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusyAction(null);
    }
  }, [resolved, disabled, busyAction, onImageUrlChange, refresh]);

  const runReview = useCallback(
    async (action: ProductImageReviewAction) => {
      if (!resolved || disabled || busyAction) return;
      setBusyAction(action);
      setError(null);
      setNotice(null);
      try {
        const next = await submitProductImageReview(resolved.productId, action);
        setState(next);
        if (next.imageUrl) {
          lastAiAppliedUrlRef.current = next.imageUrl;
          onImageUrlChange(next.imageUrl);
        }
        setNotice(
          action === "approve"
            ? "Imagen aprobada y protegida."
            : "Imagen rechazada. Puedes generar otra alternativa.",
        );
      } catch (cause) {
        setError(friendlyError(cause));
        refresh();
      } finally {
        setBusyAction(null);
      }
    },
    [resolved, disabled, busyAction, onImageUrlChange, refresh],
  );

  if (!open || !productName.trim()) return null;

  return (
    <section
      aria-label="Imagen generada con IA"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(56, 189, 248, 0.22)",
        background:
          "linear-gradient(180deg, rgba(240,249,255,0.86), rgba(248,250,252,0.72))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              color: "#0f172a",
              fontSize: 13,
              fontWeight: 780,
              letterSpacing: "-0.015em",
            }}
          >
            Imagen con IA
          </h3>
          <p
            style={{
              margin: "3px 0 0",
              color: "#64748b",
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            Generación individual, siempre bajo revisión humana.
          </p>
        </div>
        {loading ? (
          <span style={{ color: "#64748b", fontSize: 11 }} role="status">
            Comprobando…
          </span>
        ) : null}
      </div>

      {!loading && state?.resolution === "not_found" ? (
        <p style={{ margin: 0, color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
          Guarda primero el producto para activar la generación y revisión de imágenes.
        </p>
      ) : null}

      {!loading && state?.resolution === "ambiguous" ? (
        <p
          role="alert"
          style={{
            margin: 0,
            color: "#92400e",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          Hay varios productos con este mismo nombre. Hostly no elegirá uno automáticamente;
          cambia el nombre o revisa el duplicado antes de generar.
        </p>
      ) : null}

      {resolved && view ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 24,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid rgba(148, 163, 184, 0.22)",
                background: "rgba(255,255,255,0.78)",
                color: "#475569",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              Origen: {view.sourceLabel}
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 24,
                padding: "3px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                ...toneStyle(view.statusTone),
              }}
            >
              {view.statusLabel}
            </span>
            {resolved.confidence != null ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  minHeight: 24,
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(255,255,255,0.65)",
                  color: "#64748b",
                  fontSize: 10,
                  fontWeight: 650,
                }}
              >
                Confianza {Math.round(resolved.confidence * 100)} %
              </span>
            ) : null}
          </div>

          {view.guidance ? (
            <p
              style={{ margin: 0, color: "#475569", fontSize: 11, lineHeight: 1.45 }}
            >
              {view.guidance}
            </p>
          ) : null}

          {view.actions.length > 0 ? (
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
            >
              {view.actions.map((action) => {
                const busy = busyAction === action;
                const globallyDisabled = disabled || busyAction != null;
                if (action === "approve") {
                  return (
                    <ConfigBtnPrimary
                      key={action}
                      type="button"
                      disabled={globallyDisabled}
                      onClick={() => void runReview("approve")}
                    >
                      {busy ? "Aprobando…" : "Aprobar imagen"}
                    </ConfigBtnPrimary>
                  );
                }
                if (action === "reject") {
                  return (
                    <button
                      key={action}
                      type="button"
                      disabled={globallyDisabled}
                      onClick={() => void runReview("reject")}
                      style={{
                        minHeight: 34,
                        padding: "6px 11px",
                        borderRadius: 8,
                        border: "1px solid rgba(239, 68, 68, 0.28)",
                        background: "rgba(254, 242, 242, 0.92)",
                        color: "#b91c1c",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: globallyDisabled ? "not-allowed" : "pointer",
                        opacity: globallyDisabled ? 0.55 : 1,
                      }}
                    >
                      {busy ? "Rechazando…" : "Rechazar"}
                    </button>
                  );
                }
                return (
                  <ConfigBtnSecondary
                    key={action}
                    type="button"
                    disabled={globallyDisabled}
                    onClick={() => void runGeneration()}
                  >
                    {busy
                      ? "Generando…"
                      : action === "regenerate"
                        ? "Regenerar"
                        : "Generar imagen con IA"}
                  </ConfigBtnSecondary>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            padding: "7px 9px",
            borderRadius: 8,
            background: "rgba(240, 253, 244, 0.92)",
            border: "1px solid rgba(34, 197, 94, 0.24)",
            color: "#166534",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "7px 9px",
            borderRadius: 8,
            background: "rgba(254, 242, 242, 0.94)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#991b1b",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={refresh}
            disabled={disabled || busyAction != null}
            style={{
              flexShrink: 0,
              border: 0,
              background: "transparent",
              color: "#991b1b",
              font: "inherit",
              fontWeight: 750,
              cursor: "pointer",
            }}
          >
            Actualizar
          </button>
        </div>
      ) : null}
    </section>
  );
}
