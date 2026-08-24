"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CatalogMigrationExecuteResult,
  CatalogMigrationPreviewResult,
} from "@/lib/carta/catalog-migration-preview-types";
import {
  legacyPlatosToMigrationInput,
  readLegacyPlatosForRestaurant,
} from "@/lib/carta/legacy-platos-client";
import { requestCatalogMigrationPreview } from "@/lib/carta/request-catalog-migration-preview";
import { requestCatalogMigrateLegacy } from "@/lib/carta/request-catalog-migrate-legacy";
import type { OperationalCatalogSource } from "@/lib/carta/use-central-products-for-carta";
import { ProductOperationStationMigrationPanel } from "@/components/productos/product-operation-station-migration-panel";

type CatalogMigrationPreviewPanelProps = {
  restaurantId: string;
  catalogSource: OperationalCatalogSource | null;
  iceVisual?: boolean;
};

function migrationCompletedStorageKey(restaurantId: string): string {
  return `hostly.catalogMigration.completed.${restaurantId.trim()}`;
}

export function CatalogMigrationPreviewPanel({
  restaurantId,
  catalogSource,
  iceVisual = false,
}: CatalogMigrationPreviewPanelProps) {
  const legacyCount = useMemo(() => {
    const list = readLegacyPlatosForRestaurant(restaurantId);
    return list?.length ?? 0;
  }, [restaurantId]);

  const [preview, setPreview] = useState<CatalogMigrationPreviewResult | null>(null);
  const [migrationResult, setMigrationResult] = useState<CatalogMigrationExecuteResult | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [migrateLoading, setMigrateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !restaurantId.trim()) return;
    try {
      const raw = sessionStorage.getItem(migrationCompletedStorageKey(restaurantId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as CatalogMigrationExecuteResult;
      if (parsed?.migrationConfig?.status === "completed") {
        setMigrationResult(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [restaurantId]);

  const isLegacyCatalogSource =
    catalogSource === "legacy_local" || catalogSource === "legacy_fallback";

  const showLegacyPanel = isLegacyCatalogSource && catalogSource !== null;

  const showCompletedBanner = migrationResult?.migrationConfig.status === "completed";

  const runPreview = useCallback(async () => {
    const list = readLegacyPlatosForRestaurant(restaurantId);
    if (!list?.length) {
      setError("No hay platos legacy en este navegador.");
      return;
    }
    setPreviewLoading(true);
    setError(null);
    const result = await requestCatalogMigrationPreview(
      legacyPlatosToMigrationInput(list),
    );
    setPreviewLoading(false);
    if (!result.ok) {
      setPreview(null);
      setError(result.details ?? result.error);
      return;
    }
    setPreview(result.preview);
  }, [restaurantId]);

  const runMigrate = useCallback(async () => {
    if (!preview) {
      setError("Ejecuta la previsualización antes de migrar.");
      return;
    }
    const list = readLegacyPlatosForRestaurant(restaurantId);
    if (!list?.length) {
      setError("No hay platos legacy en este navegador.");
      return;
    }

    const createCount = preview.totals.toCreate;
    const ok = window.confirm(
      `Se crearán ${createCount} producto${createCount === 1 ? "" : "s"} nuevos en el catálogo central. Los duplicados y bloqueados se omitirán. ¿Continuar?`,
    );
    if (!ok) return;

    setMigrateLoading(true);
    setError(null);
    const result = await requestCatalogMigrateLegacy(
      legacyPlatosToMigrationInput(list),
      String(preview.generatedAt),
    );
    setMigrateLoading(false);

    if (!result.ok) {
      setError(result.details ?? result.error);
      return;
    }

    setMigrationResult(result.result);
    setPreview(result.result.preview);
    try {
      sessionStorage.setItem(
        migrationCompletedStorageKey(restaurantId),
        JSON.stringify(result.result),
      );
    } catch {
      /* ignore */
    }
  }, [preview, restaurantId]);

  if (catalogSource === "central") {
    return (
      <ProductOperationStationMigrationPanel
        restaurantId={restaurantId}
        iceVisual={iceVisual}
      />
    );
  }

  if (!showLegacyPanel && !showCompletedBanner) return null;

  const border = iceVisual
    ? "1px solid rgba(148, 163, 184, 0.22)"
    : "1px solid rgba(251, 191, 36, 0.28)";
  const bg = iceVisual ? "rgba(255, 251, 235, 0.92)" : "rgba(120, 53, 15, 0.1)";
  const ink = iceVisual ? "#92400e" : "#fcd34d";
  const successBorder = iceVisual
    ? "1px solid rgba(34, 197, 94, 0.35)"
    : "1px solid rgba(34, 197, 94, 0.3)";
  const successBg = iceVisual ? "rgba(220, 252, 231, 0.92)" : "rgba(6, 78, 59, 0.18)";
  const successInk = iceVisual ? "#166534" : "#bbf7d0";

  if (showCompletedBanner && !showLegacyPanel) {
    const cfg = migrationResult!.migrationConfig;
    return (
      <div
        style={{
          flexShrink: 0,
          padding: "8px 11px",
          borderRadius: 8,
          border: successBorder,
          background: successBg,
          color: successInk,
          fontSize: 12,
          lineHeight: 1.4,
        }}
        data-catalog-migration-panel="completed"
      >
        <strong style={{ fontWeight: 700 }}>Migración completada</strong>
        <p style={{ margin: "4px 0 0", fontSize: 11, opacity: 0.95 }}>
          {cfg.createdCount} creados · {cfg.skippedCount} omitidos · {cfg.blockedCount}{" "}
          bloqueados en preview · localStorage intacto
        </p>
      </div>
    );
  }

  const busy = previewLoading || migrateLoading;

  return (
    <div
      style={{
        flexShrink: 0,
        padding: "8px 11px",
        borderRadius: 8,
        border: showCompletedBanner ? successBorder : border,
        background: showCompletedBanner ? successBg : bg,
        color: showCompletedBanner ? successInk : ink,
        fontSize: 12,
        lineHeight: 1.4,
      }}
      data-catalog-migration-panel={showCompletedBanner ? "completed" : "legacy"}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {showCompletedBanner ? (
            <>
              <strong style={{ fontWeight: 700 }}>Migración completada</strong>
              <p style={{ margin: "4px 0 0", opacity: 0.9, fontSize: 11 }}>
                {migrationResult!.migrationConfig.createdCount} creados ·{" "}
                {migrationResult!.migrationConfig.skippedCount} omitidos · localStorage
                intacto
              </p>
            </>
          ) : (
            <>
              <strong style={{ fontWeight: 700 }}>Catálogo local legacy</strong>
              <p style={{ margin: "4px 0 0", opacity: 0.9, fontSize: 11 }}>
                Este catálogo vive solo en este navegador. Migra a catálogo central para editarlo
                desde cualquier dispositivo.
                {legacyCount > 0 ? (
                  <>
                    {" "}
                    {legacyCount} plato{legacyCount === 1 ? "" : "s"} en{" "}
                    <code style={{ fontSize: 10 }}>hostly.platos.v1</code>.
                  </>
                ) : null}
              </p>
            </>
          )}
        </div>
        {!showCompletedBanner ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runPreview()}
              style={{
                border: "1px solid rgba(245, 158, 11, 0.45)",
                background: iceVisual ? "#fff" : "rgba(251, 191, 36, 0.15)",
                color: iceVisual ? "#92400e" : "#fde68a",
                padding: "5px 10px",
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 11,
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {previewLoading ? "Analizando…" : "Previsualizar migración"}
            </button>
            <button
              type="button"
              disabled={busy || !preview || preview.totals.toCreate === 0}
              onClick={() => void runMigrate()}
              style={{
                border: "1px solid rgba(34, 197, 94, 0.5)",
                background: iceVisual ? "rgba(220, 252, 231, 0.98)" : "rgba(34, 197, 94, 0.18)",
                color: iceVisual ? "#15803d" : "#bbf7d0",
                padding: "5px 10px",
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 11,
                cursor:
                  busy || !preview || preview.totals.toCreate === 0
                    ? "not-allowed"
                    : "pointer",
                opacity: busy || !preview || preview.totals.toCreate === 0 ? 0.55 : 1,
              }}
            >
              {migrateLoading ? "Migrando…" : "Migrar catálogo"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p
          style={{
            margin: "8px 0 0",
            color: iceVisual ? "#b91c1c" : "#fecaca",
            fontSize: 11,
          }}
        >
          {error}
        </p>
      ) : null}

      {preview && !showCompletedBanner ? (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid rgba(148, 163, 184, 0.2)",
            display: "grid",
            gap: 6,
            fontSize: 11,
            color: iceVisual ? "#78350f" : "#fde68a",
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>{preview.totals.toCreate}</strong> se crearán ·{" "}
            <strong>{preview.totals.duplicates}</strong> duplicados ·{" "}
            <strong>{preview.totals.blocked}</strong> bloqueados
            {preview.totals.missingCategoriesCount > 0 ? (
              <>
                {" "}
                · <strong>{preview.totals.missingCategoriesCount}</strong> categorías sin
                coincidencia
              </>
            ) : null}
          </p>
          {preview.toCreate.length > 0 ? (
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                Ver a crear ({preview.toCreate.length})
              </summary>
              <ul
                style={{ margin: "6px 0 0", paddingLeft: 18, maxHeight: 120, overflow: "auto" }}
              >
                {preview.toCreate.slice(0, 25).map((row) => (
                  <li key={row.legacyPlatoId}>
                    {row.name} — {row.categoryName} — {row.price.toFixed(2)} €
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {migrationResult && showCompletedBanner ? (
        <div style={{ marginTop: 8, fontSize: 11, opacity: 0.95 }}>
          {migrationResult.errors.length > 0 ? (
            <p style={{ margin: 0, color: iceVisual ? "#b45309" : "#fde68a" }}>
              {migrationResult.errors.length} error
              {migrationResult.errors.length === 1 ? "" : "es"} durante la migración (revisa
              consola de red).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
