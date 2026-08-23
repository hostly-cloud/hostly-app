"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogProductImageCandidate } from "@/lib/productos/catalog-product-image-contract";
import {
  attachCatalogProductImageForReview,
  CatalogProductImageApiError,
  searchCatalogProductImagesForReview,
} from "@/lib/productos/catalog-product-image-api";

function friendlyCatalogError(error: unknown): string {
  if (error instanceof CatalogProductImageApiError) {
    switch (error.code) {
      case "CATALOG_PROVIDER_RATE_LIMITED":
        return "El catálogo ha limitado temporalmente las consultas.";
      case "CATALOG_PROVIDER_TIMEOUT":
        return "El catálogo ha tardado demasiado en responder.";
      case "PRODUCT_IMAGE_PROTECTED":
        return "La imagen actual está protegida y no se puede sustituir.";
      case "CATALOG_BARCODE_MISMATCH":
        return "El código de barras guardado ya no coincide con esta referencia.";
      default:
        return error.message || error.code;
    }
  }
  return error instanceof Error ? error.message : "No se pudo resolver la imagen exacta.";
}

export function ProductExactCatalogImageSuggestion({
  productId,
  barcode,
  disabled = false,
  refreshKey = 0,
  onAttached,
}: {
  productId: string;
  barcode: string;
  disabled?: boolean;
  refreshKey?: number;
  onAttached?: (imageUrl: string) => void;
}) {
  const [candidate, setCandidate] = useState<CatalogProductImageCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    const gtin = barcode.trim();
    if (!productId || !gtin) {
      setCandidate(null);
      setMessage(null);
      return;
    }
    setLoading(true);
    setAttached(false);
    setMessage(null);
    try {
      const result = await searchCatalogProductImagesForReview(productId, "");
      const exact = result.candidates.find(
        (item) => item.externalReference === gtin,
      ) ?? null;
      setCandidate(exact);
      if (!exact) {
        setMessage("No hemos encontrado todavía una imagen exacta para este EAN / GTIN.");
      }
    } catch (error) {
      setCandidate(null);
      setMessage(friendlyCatalogError(error));
    } finally {
      setLoading(false);
    }
  }, [barcode, productId]);

  useEffect(() => {
    void resolve();
  }, [resolve, refreshKey]);

  const attach = useCallback(async () => {
    if (!candidate || attaching) return;
    setAttaching(true);
    setMessage(null);
    try {
      const result = await attachCatalogProductImageForReview(
        productId,
        candidate.externalReference,
      );
      setAttached(true);
      setMessage("Imagen exacta preparada para revisión.");
      onAttached?.(result.imageUrl);
    } catch (error) {
      setMessage(friendlyCatalogError(error));
    } finally {
      setAttaching(false);
    }
  }, [attaching, candidate, onAttached, productId]);

  if (!barcode.trim()) return null;

  return (
    <section
      className="hostly-product-commercial-modal__field"
      aria-label="Imagen exacta por EAN o GTIN"
      style={{
        border: "1px solid rgba(148,163,184,.22)",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <span className="hostly-product-commercial-modal__label">
            Imagen exacta por EAN / GTIN
          </span>
          <p className="hostly-product-commercial-modal__hint" style={{ margin: "3px 0 0" }}>
            Hostly consulta la referencia exacta; nunca la adjunta sin confirmación.
          </p>
        </div>
        <button
          type="button"
          className="hostly-button-secondary hostly-button-compact"
          disabled={disabled || loading || attaching}
          onClick={() => void resolve()}
        >
          {loading ? "Buscando…" : "Reintentar"}
        </button>
      </div>

      {candidate ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "72px minmax(0,1fr) auto",
            gap: 12,
            alignItems: "center",
            marginTop: 10,
          }}
        >
          <img
            src={candidate.thumbnailUrl}
            alt=""
            style={{ width: 72, height: 72, borderRadius: 10, objectFit: "contain", background: "#fff" }}
          />
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 13 }}>{candidate.productName}</strong>
            <span className="hostly-product-commercial-modal__hint">
              {[candidate.brand, candidate.quantity].filter(Boolean).join(" · ") || candidate.externalReference}
            </span>
            {candidate.warnings.length > 0 ? (
              <p className="hostly-product-commercial-modal__hint" style={{ margin: "5px 0 0" }}>
                {candidate.warnings.join(" ")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="hostly-button-primary hostly-button-compact"
            disabled={disabled || attaching || attached}
            onClick={() => void attach()}
          >
            {attached ? "Preparada" : attaching ? "Preparando…" : "Usar esta imagen"}
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="hostly-product-commercial-modal__hint" role="status" style={{ marginBottom: 0 }}>
          {message}
        </p>
      ) : null}
    </section>
  );
}
