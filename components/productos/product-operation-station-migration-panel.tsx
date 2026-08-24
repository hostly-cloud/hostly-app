"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCartaCategorias, fetchCartaFamilias } from "@/lib/carta-categorias/api-client";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import {
  listenCentralProducts,
  type ProductDocument,
} from "@/lib/firestore/products";
import { listenOperationStations } from "@/lib/firestore/operation-stations";
import { applyProductOperationStationMigration } from "@/lib/firestore/product-operation-station-migration";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import {
  buildProductOperationStationMigrationPlan,
  summarizeProductOperationStationMigrationPlan,
} from "@/lib/productos/product-operation-station-migration";

export function ProductOperationStationMigrationPanel({
  restaurantId,
  iceVisual = false,
}: {
  restaurantId: string;
  iceVisual?: boolean;
}) {
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [operationStations, setOperationStations] = useState<OperationStationDocument[]>([]);
  const [cartaCategorias, setCartaCategorias] = useState<CartaCategoria[]>([]);
  const [cartaFamilias, setCartaFamilias] = useState<CartaFamilia[]>([]);
  const [catalogsReady, setCatalogsReady] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const rid = restaurantId.trim();
    if (!rid) return;
    setCatalogsReady(false);
    let alive = true;
    void Promise.all([fetchCartaCategorias(rid), fetchCartaFamilias(rid)])
      .then(([categories, families]) => {
        if (!alive) return;
        setCartaCategorias(categories);
        setCartaFamilias(families);
        setCatalogsReady(true);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "No se pudo cargar la jerarquía de carta.");
        setCatalogsReady(true);
      });
    return () => {
      alive = false;
    };
  }, [restaurantId]);

  useEffect(() => {
    const rid = restaurantId.trim();
    if (!rid) return;
    return listenCentralProducts(
      rid,
      setProducts,
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [restaurantId]);

  useEffect(() => {
    const rid = restaurantId.trim();
    if (!rid) return;
    return listenOperationStations(
      rid,
      setOperationStations,
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [restaurantId]);

  const plan = useMemo(
    () =>
      buildProductOperationStationMigrationPlan(
        products,
        cartaCategorias,
        cartaFamilias,
        operationStations,
      ),
    [products, cartaCategorias, cartaFamilias, operationStations],
  );
  const summary = useMemo(
    () => summarizeProductOperationStationMigrationPlan(plan),
    [plan],
  );
  const suggested = useMemo(
    () => plan.filter((item) => item.status === "suggested"),
    [plan],
  );
  const review = useMemo(
    () => plan.filter((item) => item.status === "unknown_preserved"),
    [plan],
  );

  const applySuggested = useCallback(async () => {
    if (suggested.length === 0 || applying) return;
    const ok = window.confirm(
      `Hostly corregirá ${suggested.length} producto${suggested.length === 1 ? "" : "s"} que están sin estación concreta o en un destino genérico. Las estaciones específicas existentes no se tocarán. ¿Continuar?`,
    );
    if (!ok) return;

    setApplying(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await applyProductOperationStationMigration(
        restaurantId,
        suggested,
        operationStations,
      );
      setSuccess(
        `${result.updated} producto${result.updated === 1 ? "" : "s"} actualizado${result.updated === 1 ? "" : "s"}${result.skipped > 0 ? ` · ${result.skipped} omitidos por seguridad` : ""}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar la corrección de routing.");
    } finally {
      setApplying(false);
    }
  }, [applying, operationStations, restaurantId, suggested]);

  if (!restaurantId.trim()) return null;

  const border = iceVisual
    ? "1px solid rgba(125, 211, 252, 0.34)"
    : "1px solid rgba(56, 189, 248, 0.3)";
  const background = iceVisual ? "rgba(240, 249, 255, 0.82)" : "rgba(8, 47, 73, 0.16)";
  const ink = iceVisual ? "#0c4a6e" : "#bae6fd";

  return (
    <section
      style={{
        flexShrink: 0,
        padding: "8px 11px",
        borderRadius: 8,
        border,
        background,
        color: ink,
        fontSize: 12,
        lineHeight: 1.4,
        minWidth: 0,
      }}
      aria-label="Revisión de routing de estaciones"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <strong style={{ fontWeight: 750 }}>Routing de estaciones</strong>
          <p style={{ margin: "3px 0 0", fontSize: 11, opacity: 0.88 }}>
            Revisa productos antiguos y sustituye solo destinos genéricos por la estación concreta heredada de su familia.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            disabled={!catalogsReady}
            onClick={() => {
              setPreviewOpen((open) => !open);
              setError(null);
            }}
            className="hostly-button-secondary hostly-button-compact"
            style={{ minHeight: 36, whiteSpace: "nowrap" }}
          >
            {!catalogsReady
              ? "Analizando…"
              : previewOpen
                ? "Ocultar revisión"
                : `Revisar routing${summary.suggested > 0 ? ` (${summary.suggested})` : ""}`}
          </button>
          <button
            type="button"
            disabled={!catalogsReady || applying || suggested.length === 0}
            onClick={() => void applySuggested()}
            className="hostly-button-primary hostly-button-compact"
            style={{ minHeight: 36, whiteSpace: "nowrap" }}
          >
            {applying ? "Corrigiendo…" : "Aplicar sugeridos"}
          </button>
        </div>
      </div>

      {success ? (
        <p role="status" style={{ margin: "7px 0 0", color: iceVisual ? "#166534" : "#bbf7d0", fontSize: 11 }}>
          {success}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: "7px 0 0", color: iceVisual ? "#b91c1c" : "#fecaca", fontSize: 11 }}>
          {error}
        </p>
      ) : null}

      {previewOpen && catalogsReady ? (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid rgba(148, 163, 184, 0.22)",
            display: "grid",
            gap: 7,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span><strong>{summary.suggested}</strong> sugeridos</span>
            <span>· <strong>{summary.upToDate}</strong> correctos</span>
            <span>· <strong>{summary.specificPreserved}</strong> específicos preservados</span>
            {summary.unknownPreserved > 0 ? (
              <span>· <strong>{summary.unknownPreserved}</strong> requieren revisión</span>
            ) : null}
          </div>

          {suggested.length > 0 ? (
            <details open={suggested.length <= 12}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                Cambios propuestos ({suggested.length})
              </summary>
              <div style={{ marginTop: 6, maxHeight: 220, overflow: "auto", display: "grid", gap: 4 }}>
                {suggested.map((item) => (
                  <div
                    key={item.productId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(120px, 1fr) minmax(90px, auto) 18px minmax(100px, auto)",
                      gap: 6,
                      alignItems: "center",
                      minWidth: 0,
                      padding: "5px 7px",
                      borderRadius: 6,
                      background: iceVisual ? "rgba(255,255,255,0.7)" : "rgba(15,23,42,0.24)",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 650 }}>
                      {item.productName}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.76 }}>
                      {item.currentOperationStationName ?? "Sin estación"}
                    </span>
                    <span aria-hidden>→</span>
                    <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.suggestedOperationStationName}
                    </strong>
                  </div>
                ))}
              </div>
            </details>
          ) : (
            <p style={{ margin: 0, fontSize: 11, opacity: 0.82 }}>
              No hay productos con una corrección segura pendiente.
            </p>
          )}

          {review.length > 0 ? (
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 650 }}>
                Revisión manual ({review.length})
              </summary>
              <ul style={{ margin: "5px 0 0", paddingLeft: 18, maxHeight: 120, overflow: "auto" }}>
                {review.map((item) => (
                  <li key={item.productId}>
                    {item.productName} — {item.currentOperationStationName ?? item.currentOperationStationId ?? "estación desconocida"}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <style>{`
        @media (max-width: 640px) {
          [aria-label="Revisión de routing de estaciones"] button {
            min-height: 40px !important;
          }
          [aria-label="Revisión de routing de estaciones"] details div[style*="grid-template-columns"] {
            grid-template-columns: minmax(0, 1fr) auto !important;
          }
          [aria-label="Revisión de routing de estaciones"] details div[style*="grid-template-columns"] > span:nth-child(2) {
            display: none;
          }
          [aria-label="Revisión de routing de estaciones"] details div[style*="grid-template-columns"] > span:nth-child(3) {
            display: none;
          }
        }
      `}</style>
    </section>
  );
}
