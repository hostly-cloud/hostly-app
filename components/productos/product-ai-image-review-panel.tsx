"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

function badgeTone(
  tone: "neutral" | "info" | "success" | "warning" | "danger",
) {
  if (tone === "success") {
    return { borderColor: "rgba(34,197,94,.3)", background: "#f0fdf4", color: "#166534" };
  }
  if (tone === "warning") {
    return { borderColor: "rgba(245,158,11,.32)", background: "#fffbeb", color: "#92400e" };
  }
  if (tone === "danger") {
    return { borderColor: "rgba(239,68,68,.28)", background: "#fef2f2", color: "#991b1b" };
  }
  if (tone === "info") {
    return { borderColor: "rgba(56,189,248,.3)", background: "#f0f9ff", color: "#075985" };
  }
  return { borderColor: "rgba(148,163,184,.26)", background: "#f8fafc", color: "#475569" };
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
  const [busyAction, setBusyAction] = useState<ProductImageReviewUiAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastAiAppliedUrlRef = useRef<string | null>(null);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    lastAiAppliedUrlRef.current = null;
    setState(null);
    setMessage(null);
    setError(null);
  }, [open, productName]);

  useEffect(() => {
    const name = productName.trim();
    if (!open || !name) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchProductImageReviewState(name)
      .then((next) => {
        if (!cancelled) setState(next);
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
  }, [open, productName, refreshKey]);

  const resolved = state?.resolution === "resolved" ? state : null;
  const fallbackIsLocalBlob = fallbackImageUrl?.startsWith("blob:") === true;
  const localImageDraftDirty = Boolean(
    fallbackIsLocalBlob ||
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
    if (
      !window.confirm(
        "Generar una imagen con IA puede tener coste. La imagen quedará pendiente de revisión. ¿Continuar?",
      )
    ) {
      return;
    }

    const action: ProductImageReviewUiAction = resolved.hasImage
      ? "regenerate"
      : "generate";
    setBusyAction(action);
    setMessage(null);
    setError(null);
    try {
      const result = await generateProductImageForReview(resolved.productId);
      if (result.outcome === "generated") {
        lastAiAppliedUrlRef.current = result.imageUrl;
        onImageUrlChange(result.imageUrl);
        setMessage("Imagen generada. Revísala antes de aprobarla.");
      } else {
        setMessage(skippedGenerationMessage(result.reason));
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
      setMessage(null);
      setError(null);
      try {
        const next = await submitProductImageReview(resolved.productId, action);
        setState(next);
        if (next.imageUrl) {
          lastAiAppliedUrlRef.current = next.imageUrl;
          onImageUrlChange(next.imageUrl);
        }
        setMessage(
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

  const buttonDisabled = disabled || busyAction != null;

  return (
    <section
      aria-label="Imagen generada con IA"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        borderRadius: 12,
        border: "1px solid rgba(56,189,248,.22)",
        background: "linear-gradient(180deg,rgba(240,249,255,.9),rgba(248,250,252,.75))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: "#0f172a", fontSize: 13, fontWeight: 780 }}>
            Imagen con IA
          </h3>
          <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 11 }}>
            Generación individual y siempre bajo revisión humana.
          </p>
        </div>
        {loading ? <span style={{ color: "#64748b", fontSize: 11 }}>Comprobando…</span> : null}
      </div>

      {!loading && state?.resolution === "not_found" ? (
        <p style={{ margin: 0, color: "#64748b", fontSize: 11, lineHeight: 1.45 }}>
          Guarda primero el producto para activar esta función.
        </p>
      ) : null}

      {!loading && state?.resolution === "ambiguous" ? (
        <p role="alert" style={{ margin: 0, color: "#92400e", fontSize: 11, lineHeight: 1.45 }}>
          Hay varios productos con este nombre. Hostly no elegirá uno automáticamente.
        </p>
      ) : null}

      {resolved && view ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,.23)",
                background: "rgba(255,255,255,.8)",
                color: "#475569",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              Origen: {view.sourceLabel}
            </span>
            <span
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid",
                fontSize: 10,
                fontWeight: 700,
                ...badgeTone(view.statusTone),
              }}
            >
              {view.statusLabel}
            </span>
            {resolved.confidence != null ? (
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,.2)",
                  background: "rgba(255,255,255,.7)",
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
            <p style={{ margin: 0, color: "#475569", fontSize: 11, lineHeight: 1.45 }}>
              {view.guidance}
            </p>
          ) : null}

          {view.actions.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {view.actions.map((action) => {
                const busy = busyAction === action;
                if (action === "approve") {
                  return (
                    <ConfigBtnPrimary
                      key={action}
                      type="button"
                      disabled={buttonDisabled}
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
                      disabled={buttonDisabled}
                      onClick={() => void runReview("reject")}
                      style={{
                        minHeight: 34,
                        padding: "6px 11px",
                        borderRadius: 8,
                        border: "1px solid rgba(239,68,68,.3)",
                        background: "#fef2f2",
                        color: "#b91c1c",
                        fontSize: 11,
                        fontWeight: 700,
                        opacity: buttonDisabled ? 0.55 : 1,
                        cursor: buttonDisabled ? "not-allowed" : "pointer",
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
                    disabled={buttonDisabled}
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

      {message ? (
        <p
          role="status"
          style={{
            margin: 0,
            padding: "7px 9px",
            borderRadius: 8,
            border: "1px solid rgba(34,197,94,.25)",
            background: "#f0fdf4",
            color: "#166534",
            fontSize: 11,
          }}
        >
          {message}
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            padding: "7px 9px",
            borderRadius: 8,
            border: "1px solid rgba(239,68,68,.25)",
            background: "#fef2f2",
            color: "#991b1b",
            fontSize: 11,
          }}
        >
          <span>{error}</span>
          <button
            type="button"
            disabled={buttonDisabled}
            onClick={refresh}
            style={{ border: 0, background: "transparent", color: "inherit", fontWeight: 750 }}
          >
            Actualizar
          </button>
        </div>
      ) : null}
    </section>
  );
}
