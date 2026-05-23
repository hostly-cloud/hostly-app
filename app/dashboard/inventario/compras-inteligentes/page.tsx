"use client";

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { capabilityDeniedTitle } from "@/components/auth/capability-guard";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyKpiCard, HostlySectionHeader } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { getProductKindDisplayLabel, type ProductKind } from "@/lib/carta/product-kind-options";
import { listenProductsForInventory, type ProductDocument } from "@/lib/firestore/products";
import {
  listenCentralStockMovementsForRestaurant,
  type CentralStockMovementListItem,
} from "@/lib/firestore/stock-movements";
import {
  archivePurchaseDraft,
  createPurchaseDraft,
  listenPurchaseDrafts,
  updatePurchaseDraft,
  type PurchaseDraftDocument,
} from "@/lib/firestore/purchase-drafts";
import {
  createPurchaseOrderFromDraft,
  PurchaseOrderFromDraftError,
} from "@/lib/firestore/purchase-orders";
import { purchaseDraftDocumentToSuggestedDraft } from "@/lib/inventory/purchase-draft-types";
import {
  buildPurchaseIntelligenceRows,
  mapCentralMovementToPurchaseInput,
  matchesPurchaseIntelligenceFilter,
  PURCHASE_INTELLIGENCE_LOOKBACK_DAYS,
  type PurchaseIntelligenceFilter,
  type PurchaseIntelligenceRow,
  type PurchaseRiskLevel,
} from "@/lib/inventory/purchase-intelligence";
import { productTimelineHref } from "@/lib/inventory/product-timeline";
import {
  buildSuggestedPurchaseDraft,
  computeSuggestedDraftTotalEstimatedCost,
  formatSuggestedPurchaseDraftSummary,
  SUGGESTED_DRAFT_COVERAGE_OPTIONS,
  updateSuggestedDraftLineQuantity,
  type SuggestedDraftCoverageDays,
  type SuggestedPurchaseCostInput,
  type SuggestedPurchaseDraft,
  type SuggestedPurchaseDraftSourceLine,
} from "@/lib/inventory/suggested-purchase-draft";

const FILTER_OPTIONS: { id: PurchaseIntelligenceFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "urgent", label: "Urgente" },
  { id: "soon", label: "Comprar pronto" },
  { id: "watch", label: "Vigilar" },
  { id: "unknown", label: "Sin datos" },
];

function formatQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(value);
}

function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

function formatDays(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 }).format(value);
}

function displayUnit(unit: string): string {
  return unit === "unit" ? "ud" : unit;
}

function riskPillStyle(level: PurchaseRiskLevel): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.03em",
    whiteSpace: "nowrap",
  };
  switch (level) {
    case "out":
    case "urgent":
      return { ...base, background: "rgba(239, 68, 68, 0.12)", color: "#b91c1c" };
    case "soon":
      return { ...base, background: "rgba(245, 158, 11, 0.14)", color: "#b45309" };
    case "watch":
      return { ...base, background: "rgba(59, 130, 246, 0.12)", color: "#1d4ed8" };
    case "ok":
      return { ...base, background: "rgba(16, 185, 129, 0.12)", color: "#047857" };
    default:
      return { ...base, background: "rgba(148, 163, 184, 0.16)", color: "#64748b" };
  }
}

function mapProductCostInput(doc: ProductDocument): SuggestedPurchaseCostInput {
  return {
    purchaseCost: doc.inventory.purchaseCost ?? null,
    purchaseQuantity: doc.inventory.purchaseQuantity ?? null,
    purchaseUnit: doc.inventory.purchaseUnit ?? null,
    unitCost: doc.inventory.unitCost ?? null,
    unitCostUnit: doc.inventory.unitCostUnit ?? null,
  };
}

function mapProductToPurchaseInput(doc: ProductDocument) {
  return {
    productId: doc.id,
    name: doc.name,
    currentStock: doc.inventory.currentStock ?? null,
    minStock: doc.inventory.minStock ?? null,
    unit: doc.inventory.unit ?? "ud",
    productFamilyName: doc.productFamilyName ?? null,
    productFamilyType: doc.productFamilyType ?? null,
    productKind: doc.productKind ?? null,
  };
}

function formatDraftDate(ms: number): string {
  return new Date(ms).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function countByRisk(rows: PurchaseIntelligenceRow[], levels: PurchaseRiskLevel[]): number {
  return rows.filter((row) => levels.includes(row.riskLevel)).length;
}

const actionButtonStyle: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "var(--hostly-surface-card-solid)",
  color: "var(--hostly-ink-strong)",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...actionButtonStyle,
  background: "var(--hostly-ink-strong)",
  color: "#fff",
  border: "1px solid var(--hostly-ink-strong)",
};

export default function ComprasInteligentesPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const { can } = useHostlyCapabilities();
  const canManagePurchases = can("purchases.manage");
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [movements, setMovements] = useState<CentralStockMovementListItem[]>([]);
  const [filter, setFilter] = useState<PurchaseIntelligenceFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [targetCoverageDays, setTargetCoverageDays] =
    useState<SuggestedDraftCoverageDays>(7);
  const [draft, setDraft] = useState<SuggestedPurchaseDraft | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraftMeta, setActiveDraftMeta] = useState<Pick<
    PurchaseDraftDocument,
    "createdAt" | "createdBy" | "status" | "notes" | "linkedPurchaseOrderId"
  > | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<PurchaseDraftDocument[]>([]);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [isConvertingToOrder, setIsConvertingToOrder] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [createdPurchaseOrderId, setCreatedPurchaseOrderId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setProducts([]);
      return;
    }
    return listenProductsForInventory(restaurantId, setProducts, () => {
      setLoadError("No se pudo cargar el inventario.");
    });
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setMovements([]);
      return;
    }
    return listenCentralStockMovementsForRestaurant(
      restaurantId,
      setMovements,
      {
        limit: 500,
        onError: () => {
          setLoadError("No se pudieron cargar movimientos de stock.");
        },
      },
    );
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setSavedDrafts([]);
      return;
    }
    return listenPurchaseDrafts(restaurantId, setSavedDrafts, {
      onError: () => {
        setLoadError("No se pudieron cargar borradores guardados.");
      },
    });
  }, [authReady, restaurantId]);

  const activeSavedDrafts = useMemo(
    () =>
      savedDrafts.filter(
        (item) => item.status === "draft" && !item.linkedPurchaseOrderId?.trim(),
      ),
    [savedDrafts],
  );

  const canConvertDraftToOrder = Boolean(
    activeDraftId &&
      draft &&
      draft.lines.some((line) => line.editableQuantity > 0) &&
      !activeDraftMeta?.linkedPurchaseOrderId?.trim() &&
      activeDraftMeta?.status !== "archived",
  );

  const costByProductId = useMemo(() => {
    const map = new Map<string, SuggestedPurchaseCostInput>();
    for (const product of products) {
      map.set(product.id, mapProductCostInput(product));
    }
    return map;
  }, [products]);

  const supplierByProductId = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const product of products) {
      map.set(product.id, product.inventory.supplierName?.trim() || null);
    }
    return map;
  }, [products]);

  const movementInputs = useMemo(
    () =>
      movements
        .map((movement) => mapCentralMovementToPurchaseInput(movement))
        .filter((item): item is NonNullable<typeof item> => item != null),
    [movements],
  );

  const productInputs = useMemo(
    () => products.map(mapProductToPurchaseInput),
    [products],
  );

  const rows = useMemo(
    () =>
      buildPurchaseIntelligenceRows({
        products: productInputs,
        movements: movementInputs,
        lookbackDays: PURCHASE_INTELLIGENCE_LOOKBACK_DAYS,
      }),
    [productInputs, movementInputs],
  );

  const draftSourceRows = useMemo((): SuggestedPurchaseDraftSourceLine[] => {
    return rows.map((row) => {
      const product = products.find((p) => p.id === row.productId);
      const cost = costByProductId.get(row.productId);
      return {
        ...row,
        supplierName: supplierByProductId.get(row.productId) ?? null,
        productFamilyName: product?.productFamilyName ?? null,
        productKind: product?.productKind ?? null,
        purchaseCost: cost?.purchaseCost ?? null,
        purchaseQuantity: cost?.purchaseQuantity ?? null,
        purchaseUnit: cost?.purchaseUnit ?? null,
        unitCost: cost?.unitCost ?? null,
        unitCostUnit: cost?.unitCostUnit ?? null,
      };
    });
  }, [rows, products, costByProductId, supplierByProductId]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesPurchaseIntelligenceFilter(row, filter)),
    [rows, filter],
  );

  const kpis = useMemo(
    () => ({
      urgent: countByRisk(rows, ["out", "urgent"]),
      soon: countByRisk(rows, ["soon"]),
      watch: countByRisk(rows, ["watch"]),
      unknown: countByRisk(rows, ["unknown"]),
    }),
    [rows],
  );

  const draftTotalEstimated = useMemo(
    () => (draft ? computeSuggestedDraftTotalEstimatedCost(draft.lines) : null),
    [draft],
  );

  const handleCreateDraft = useCallback(() => {
    if (!canManagePurchases) return;
    const next = buildSuggestedPurchaseDraft({
      rows: draftSourceRows,
      targetCoverageDays,
    });
    setDraft(next.lines.length > 0 ? next : null);
    setActiveDraftId(null);
    setActiveDraftMeta(null);
    setCopyFeedback(
      next.lines.length > 0
        ? null
        : "No hay productos out/urgent/soon con consumo conocido y cantidad sugerida > 0.",
    );
  }, [canManagePurchases, draftSourceRows, targetCoverageDays]);

  const handleDiscardDraft = useCallback(() => {
    setDraft(null);
    setActiveDraftId(null);
    setActiveDraftMeta(null);
    setCopyFeedback(null);
  }, []);

  const handleSaveDraft = useCallback(async () => {
    if (!draft || !restaurantId || isDraftSaving) return;
    setIsDraftSaving(true);
    setCopyFeedback(null);
    try {
      if (activeDraftId) {
        await updatePurchaseDraft({
          restaurantId,
          draftId: activeDraftId,
          draft,
          notes: activeDraftMeta?.notes ?? null,
          existing: activeDraftMeta ?? undefined,
        });
        setCopyFeedback("Borrador actualizado.");
      } else {
        const id = await createPurchaseDraft({
          restaurantId,
          draft,
        });
        setActiveDraftId(id);
        setActiveDraftMeta({
          createdAt: draft.createdAt,
          status: "draft",
        });
        setCopyFeedback("Borrador guardado.");
      }
    } catch {
      setCopyFeedback("No se pudo guardar el borrador.");
    } finally {
      setIsDraftSaving(false);
    }
  }, [activeDraftId, activeDraftMeta, draft, isDraftSaving, restaurantId]);

  const handleOpenSavedDraft = useCallback((doc: PurchaseDraftDocument) => {
    setDraft(purchaseDraftDocumentToSuggestedDraft(doc));
    setActiveDraftId(doc.id);
    setActiveDraftMeta({
      createdAt: doc.createdAt,
      createdBy: doc.createdBy,
      status: doc.status,
      notes: doc.notes ?? null,
      linkedPurchaseOrderId: doc.linkedPurchaseOrderId,
    });
    const coverage = SUGGESTED_DRAFT_COVERAGE_OPTIONS.includes(
      doc.targetCoverageDays as SuggestedDraftCoverageDays,
    )
      ? (doc.targetCoverageDays as SuggestedDraftCoverageDays)
      : 7;
    setTargetCoverageDays(coverage);
    setCopyFeedback(`Borrador abierto · ${doc.lines.length} líneas.`);
  }, []);

  const handleArchiveSavedDraft = useCallback(
    async (draftId: string) => {
      if (!restaurantId || isDraftSaving) return;
      setIsDraftSaving(true);
      setCopyFeedback(null);
      try {
        await archivePurchaseDraft(restaurantId, draftId);
        if (activeDraftId === draftId) {
          setDraft(null);
          setActiveDraftId(null);
          setActiveDraftMeta(null);
        }
        setCopyFeedback("Borrador archivado.");
      } catch {
        setCopyFeedback("No se pudo archivar el borrador.");
      } finally {
        setIsDraftSaving(false);
      }
    },
    [activeDraftId, isDraftSaving, restaurantId],
  );

  const handleCopySummary = useCallback(async () => {
    if (!draft) return;
    const text = formatSuggestedPurchaseDraftSummary(draft);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback("Resumen copiado al portapapeles.");
    } catch {
      setCopyFeedback("No se pudo copiar el resumen.");
    }
  }, [draft]);

  const handleDraftQuantityChange = useCallback(
    (productId: string, rawValue: string) => {
      if (!draft) return;
      const parsed = Number(rawValue.replace(",", "."));
      const qty = Number.isFinite(parsed) ? parsed : 0;
      setDraft(
        updateSuggestedDraftLineQuantity(
          draft,
          productId,
          qty,
          costByProductId.get(productId),
        ),
      );
    },
    [draft, costByProductId],
  );

  const handleOpenConvertModal = useCallback(() => {
    if (!canManagePurchases || !canConvertDraftToOrder) return;
    setConvertModalOpen(true);
    setCreatedPurchaseOrderId(null);
  }, [canConvertDraftToOrder, canManagePurchases]);

  const handleCloseConvertModal = useCallback(() => {
    if (isConvertingToOrder) return;
    setConvertModalOpen(false);
  }, [isConvertingToOrder]);

  const handleConfirmConvertToOrder = useCallback(async () => {
    if (
      !canManagePurchases ||
      !restaurantId ||
      !activeDraftId ||
      !canConvertDraftToOrder ||
      isConvertingToOrder
    ) {
      return;
    }
    setIsConvertingToOrder(true);
    setCopyFeedback(null);
    try {
      if (draft) {
        await updatePurchaseDraft({
          restaurantId,
          draftId: activeDraftId,
          draft,
          notes: activeDraftMeta?.notes ?? null,
          existing: activeDraftMeta ?? undefined,
        });
      }
      const { purchaseOrderId } = await createPurchaseOrderFromDraft({
        restaurantId,
        draftId: activeDraftId,
      });
      setCreatedPurchaseOrderId(purchaseOrderId);
      setCopyFeedback("Pedido creado.");
      setDraft(null);
      setActiveDraftId(null);
      setActiveDraftMeta(null);
    } catch (error) {
      if (
        error instanceof PurchaseOrderFromDraftError &&
        error.code === "draft_already_linked"
      ) {
        setCopyFeedback("Este borrador ya tiene un pedido vinculado.");
      } else {
        setCopyFeedback("No se pudo crear el pedido.");
      }
      setConvertModalOpen(false);
    } finally {
      setIsConvertingToOrder(false);
    }
  }, [
    activeDraftId,
    activeDraftMeta,
    canConvertDraftToOrder,
    canManagePurchases,
    draft,
    isConvertingToOrder,
    restaurantId,
  ]);

  return (
    <ModulePageShell
      title="Compras sugeridas"
      subtitle={`Consumo estimado últimos ${PURCHASE_INTELLIGENCE_LOOKBACK_DAYS} días · solo sugerencias`}
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <HostlySectionHeader
          title="Riesgo de rotura"
          description="Basado en stock actual y movimientos TPV (modifier/recipe sale). No modifica stock ni crea pedidos."
        />

        {loadError ? (
          <div className="hostly-panel p-4" style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>
            {loadError}
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          <HostlyKpiCard title="Urgente" value={kpis.urgent} helper="Sin stock o ≤1 día" />
          <HostlyKpiCard title="Comprar pronto" value={kpis.soon} helper="≤3 días" />
          <HostlyKpiCard title="Vigilar" value={kpis.watch} helper="≤7 días" />
          <HostlyKpiCard title="Sin datos" value={kpis.unknown} helper="Sin consumo reciente" />
        </div>

        <div
          className="hostly-panel p-3"
          style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--hostly-ink-muted)",
            }}
          >
            Cobertura objetivo
          </span>
          <div role="tablist" aria-label="Días de cobertura" className="hostly-segmented">
            {SUGGESTED_DRAFT_COVERAGE_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                role="tab"
                aria-selected={targetCoverageDays === days}
                className="hostly-tab"
                onClick={() => setTargetCoverageDays(days)}
                style={{ minWidth: 64, padding: "6px 12px", cursor: "pointer" }}
              >
                {days} días
              </button>
            ))}
          </div>
          <button
            type="button"
            style={primaryButtonStyle}
            onClick={handleCreateDraft}
            disabled={!canManagePurchases}
            title={capabilityDeniedTitle(canManagePurchases)}
          >
            Crear borrador de pedido
          </button>
          {copyFeedback ? (
            <span style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>{copyFeedback}</span>
          ) : null}
        </div>

        {draft ? (
          <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: "var(--hostly-ink-strong)",
                  }}
                >
                  Borrador de pedido
                </div>
                <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", marginTop: 2 }}>
                  {draft.lines.length} líneas · cobertura {draft.targetCoverageDays} días · total{" "}
                  {formatEur(draftTotalEstimated)}
                  {activeDraftId ? " · guardado" : " · sin guardar"}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  style={primaryButtonStyle}
                  onClick={() => void handleSaveDraft()}
                  disabled={isDraftSaving || isConvertingToOrder}
                >
                  {activeDraftId ? "Guardar cambios" : "Guardar borrador"}
                </button>
                {canConvertDraftToOrder ? (
                  <button
                    type="button"
                    style={{
                      ...primaryButtonStyle,
                      background: "#1d4ed8",
                      borderColor: "#1d4ed8",
                    }}
                    onClick={handleOpenConvertModal}
                    disabled={
                      isDraftSaving || isConvertingToOrder || !canManagePurchases
                    }
                    title={capabilityDeniedTitle(canManagePurchases)}
                  >
                    Convertir en pedido
                  </button>
                ) : null}
                <button type="button" style={actionButtonStyle} onClick={handleCopySummary}>
                  Copiar resumen
                </button>
                {activeDraftId && !activeDraftMeta?.linkedPurchaseOrderId ? (
                  <button
                    type="button"
                    style={actionButtonStyle}
                    onClick={() => void handleArchiveSavedDraft(activeDraftId)}
                    disabled={isDraftSaving || isConvertingToOrder}
                  >
                    Archivar
                  </button>
                ) : null}
                <button
                  type="button"
                  style={actionButtonStyle}
                  onClick={handleDiscardDraft}
                  disabled={isConvertingToOrder}
                >
                  Descartar
                </button>
              </div>
            </div>

            <div style={{ overflow: "auto" }}>
              <table className="hostly-inv-native-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Proveedor</th>
                    <th className="hostly-inv-th-num">Stock</th>
                    <th className="hostly-inv-th-num">Consumo/día</th>
                    <th className="hostly-inv-th-num">Sugerido</th>
                    <th className="hostly-inv-th-num">Cantidad</th>
                    <th className="hostly-inv-th-num">Coste est.</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.map((line) => (
                    <tr key={line.productId}>
                      <td className="hostly-inv-td-primary">{line.productName}</td>
                      <td className="hostly-inv-td-muted">
                        {line.supplierName?.trim() || "—"}
                      </td>
                      <td className="hostly-inv-td-amount">
                        {formatQty(line.currentStock)} {displayUnit(line.unit)}
                      </td>
                      <td className="hostly-inv-td-amount">
                        {formatQty(line.averageDailyConsumption)} {displayUnit(line.unit)}
                      </td>
                      <td className="hostly-inv-td-muted">
                        {formatQty(line.suggestedQuantity)} {displayUnit(line.unit)}
                      </td>
                      <td className="hostly-inv-td-amount">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={line.editableQuantity}
                          onChange={(e) =>
                            handleDraftQuantityChange(line.productId, e.target.value)
                          }
                          aria-label={`Cantidad para ${line.productName}`}
                          style={{
                            width: 88,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid rgba(148, 163, 184, 0.28)",
                            fontSize: 13,
                            fontWeight: 600,
                            textAlign: "right",
                          }}
                        />
                        <span style={{ marginLeft: 4, fontSize: 11, color: "var(--hostly-ink-muted)" }}>
                          {displayUnit(line.unit)}
                        </span>
                      </td>
                      <td className="hostly-inv-td-amount">{formatEur(line.estimatedCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="hostly-panel p-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "var(--hostly-ink-strong)",
            }}
          >
            Borradores guardados
          </div>
          {activeSavedDrafts.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>
              No hay borradores activos. Crea uno y pulsa «Guardar borrador».
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeSavedDrafts.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    background:
                      activeDraftId === item.id
                        ? "rgba(59, 130, 246, 0.06)"
                        : "transparent",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>
                      {item.lines.length} productos · {item.targetCoverageDays} días
                    </div>
                    <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>
                      {formatDraftDate(item.updatedAt)} · total {formatEur(item.totalEstimatedCost)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={actionButtonStyle}
                      onClick={() => handleOpenSavedDraft(item)}
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      style={actionButtonStyle}
                      onClick={() => void handleArchiveSavedDraft(item.id)}
                      disabled={isDraftSaving}
                    >
                      Archivar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div role="tablist" aria-label="Filtrar sugerencias" className="hostly-segmented">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              className="hostly-tab"
              onClick={() => setFilter(option.id)}
              style={{ minWidth: 88, padding: "6px 12px", cursor: "pointer" }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="hostly-panel p-3" style={{ overflow: "auto", minHeight: 0 }}>
          {filteredRows.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)", padding: "8px 4px" }}>
              No hay productos para este filtro.
            </div>
          ) : (
            <table className="hostly-inv-native-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="hostly-inv-th-num">Stock</th>
                  <th className="hostly-inv-th-num">Consumo/día</th>
                  <th className="hostly-inv-th-num">Días rest.</th>
                  <th>Estado</th>
                  <th>Familia / tipo</th>
                  <th aria-label="Timeline" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.productId}>
                    <td className="hostly-inv-td-primary">{row.productName}</td>
                    <td className="hostly-inv-td-amount">
                      {formatQty(row.currentStock)} {displayUnit(row.unit)}
                    </td>
                    <td className="hostly-inv-td-amount">
                      {row.dailyConsumption != null
                        ? `${formatQty(row.dailyConsumption)} ${displayUnit(row.unit)}`
                        : "—"}
                    </td>
                    <td className="hostly-inv-td-muted">{formatDays(row.daysRemaining)}</td>
                    <td>
                      <span style={riskPillStyle(row.riskLevel)}>{row.riskLabel}</span>
                    </td>
                    <td className="hostly-inv-td-muted">
                      {row.familyLabel}
                      {" · "}
                      {row.kindLabel === "—"
                        ? "Sin clasificar"
                        : getProductKindDisplayLabel(row.kindLabel as ProductKind)}
                    </td>
                    <td>
                      <Link
                        href={productTimelineHref(row.productId)}
                        style={{
                          ...actionButtonStyle,
                          padding: "4px 8px",
                          fontSize: 11,
                        }}
                        prefetch
                      >
                        Timeline
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {convertModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Convertir borrador en pedido"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            background: "rgba(2, 6, 23, 0.62)",
            backdropFilter: "blur(6px)",
          }}
          onMouseDown={(e) => {
            if (e.currentTarget === e.target && !isConvertingToOrder) {
              handleCloseConvertModal();
            }
          }}
        >
          <div
            className="hostly-panel"
            style={{
              width: "min(560px, 100%)",
              maxHeight: "min(85vh, 720px)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              padding: 16,
              overflow: "hidden",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {createdPurchaseOrderId ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                  Pedido creado
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)" }}>
                  Se ha registrado el pedido interno para seguimiento. No se ha enviado nada al
                  proveedor ni se ha modificado el stock.
                </p>
                <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>
                  ID pedido: {createdPurchaseOrderId}
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    onClick={() => setConvertModalOpen(false)}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                  Convertir borrador en pedido
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)" }}>
                  Se creará un pedido interno con {draft?.lines.length ?? 0} productos · total
                  estimado {formatEur(draftTotalEstimated)}.
                </p>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    background: "rgba(245, 158, 11, 0.08)",
                    fontSize: 12,
                    color: "#b45309",
                    fontWeight: 600,
                  }}
                >
                  No se enviará automáticamente al proveedor.
                </div>
                <div style={{ overflow: "auto", minHeight: 0, flex: 1 }}>
                  <table className="hostly-inv-native-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Proveedor</th>
                        <th className="hostly-inv-th-num">Cantidad</th>
                        <th className="hostly-inv-th-num">Coste est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(draft?.lines ?? [])
                        .filter((line) => line.editableQuantity > 0)
                        .map((line) => (
                          <tr key={line.productId}>
                            <td className="hostly-inv-td-primary">{line.productName}</td>
                            <td className="hostly-inv-td-muted">
                              {line.supplierName?.trim() || "—"}
                            </td>
                            <td className="hostly-inv-td-amount">
                              {formatQty(line.editableQuantity)} {displayUnit(line.unit)}
                            </td>
                            <td className="hostly-inv-td-amount">{formatEur(line.estimatedCost)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    style={actionButtonStyle}
                    onClick={handleCloseConvertModal}
                    disabled={isConvertingToOrder}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    style={primaryButtonStyle}
                    onClick={() => void handleConfirmConvertToOrder()}
                    disabled={isConvertingToOrder || !canManagePurchases}
                    title={capabilityDeniedTitle(canManagePurchases)}
                  >
                    {isConvertingToOrder ? "Creando pedido…" : "Confirmar pedido"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </ModulePageShell>
  );
}
