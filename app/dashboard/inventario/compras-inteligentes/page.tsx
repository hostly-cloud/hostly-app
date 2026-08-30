"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { capabilityDeniedTitle } from "@/components/auth/capability-guard";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import {
  HostlySectionHeader,
  HostlySegmentedControl,
  hostlySegmentTabClassName,
} from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
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
} from "@/lib/inventory/purchase-intelligence";
import {
  buildSuggestedPurchaseDraft,
  calculateSuggestedPurchaseQuantity,
  computeSuggestedDraftTotalEstimatedCost,
  estimatePurchaseLineCost,
  formatSuggestedPurchaseDraftSummary,
  SUGGESTED_DRAFT_COVERAGE_OPTIONS,
  updateSuggestedDraftLineQuantity,
  type SuggestedDraftCoverageDays,
  type SuggestedPurchaseCostInput,
  type SuggestedPurchaseDraft,
  type SuggestedPurchaseDraftSourceLine,
} from "@/lib/inventory/suggested-purchase-draft";
import { ComprasDraftLinesDataView, ComprasDraftSummaryLines } from "@/components/inventario/procurement/compras-draft-lines-data-view";
import { ComprasInteligentesDataView } from "@/components/inventario/procurement/compras-inteligentes-data-view";

const FILTER_OPTIONS: { id: PurchaseIntelligenceFilter; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "urgent", label: "Urgente" },
  { id: "soon", label: "Comprar pronto" },
  { id: "watch", label: "Vigilar" },
  { id: "unknown", label: "Sin datos" },
];

function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
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

function countByRisk(
  rows: PurchaseIntelligenceRow[],
  levels: PurchaseIntelligenceRow["riskLevel"][],
): number {
  return rows.filter((row) => levels.includes(row.riskLevel)).length;
}

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

  const { suggestedQtyByProductId, estimatedCostByProductId } = useMemo(() => {
    const qtyMap = new Map<string, number>();
    const costMap = new Map<string, number | null>();
    for (const row of rows) {
      if (row.dailyConsumption == null || row.dailyConsumption <= 0) {
        qtyMap.set(row.productId, 0);
        costMap.set(row.productId, null);
        continue;
      }
      const suggested = calculateSuggestedPurchaseQuantity({
        averageDailyConsumption: row.dailyConsumption,
        targetCoverageDays,
        currentStock: row.currentStock,
      });
      qtyMap.set(row.productId, suggested);
      costMap.set(
        row.productId,
        estimatePurchaseLineCost({
          quantity: suggested,
          productUnit: row.unit,
          cost: costByProductId.get(row.productId),
        }),
      );
    }
    return { suggestedQtyByProductId: qtyMap, estimatedCostByProductId: costMap };
  }, [rows, targetCoverageDays, costByProductId]);

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
      <div className="hostly-mobile-op-page-stack">
        <HostlySectionHeader
          title="Riesgo de rotura"
          description="Basado en el stock actual y en el consumo registrado por el TPV. Estas sugerencias no modifican el stock ni crean pedidos."
        />

        {loadError ? (
          <div className="hostly-panel p-4" style={{ color: "var(--hostly-ink-muted)", fontSize: 13 }}>
            {loadError}
          </div>
        ) : null}

        <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense hostly-carta-config-kpi-strip--mobile-op">
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--danger">
            <span className="hostly-carta-config-kpi-pill__label">Urgente</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.urgent}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill hostly-carta-config-kpi-pill--warning">
            <span className="hostly-carta-config-kpi-pill__label">Comprar pronto</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.soon}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Vigilar</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.watch}</span>
          </div>
          <div className="hostly-carta-config-kpi-pill">
            <span className="hostly-carta-config-kpi-pill__label">Sin datos</span>
            <span className="hostly-carta-config-kpi-pill__value">{kpis.unknown}</span>
          </div>
        </div>

        <div className="hostly-panel p-3 hostly-procurement-toolbar">
          <span className="hostly-procurement-toolbar__label">Cobertura objetivo</span>
          <div role="tablist" aria-label="Días de cobertura" className="hostly-segmented">
            {SUGGESTED_DRAFT_COVERAGE_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                role="tab"
                aria-selected={targetCoverageDays === days}
                className="hostly-tab hostly-button-compact"
                onClick={() => setTargetCoverageDays(days)}
              >
                {days} días
              </button>
            ))}
          </div>
          <button
            type="button"
            className="hostly-button-primary hostly-button-compact"
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
          <div className="hostly-panel p-3 hostly-procurement-draft-panel">
            <div className="hostly-procurement-draft-panel__head">
              <div>
                <div className="hostly-procurement-draft-panel__title">Borrador de pedido</div>
                <div className="hostly-procurement-draft-panel__meta">
                  {draft.lines.length} líneas · cobertura {draft.targetCoverageDays} días · total{" "}
                  {formatEur(draftTotalEstimated)}
                  {activeDraftId ? " · guardado" : " · sin guardar"}
                </div>
              </div>
              <div className="hostly-procurement-draft-panel__actions">
                <button
                  type="button"
                  className="hostly-button-primary hostly-button-compact"
                  onClick={() => void handleSaveDraft()}
                  disabled={isDraftSaving || isConvertingToOrder}
                >
                  {activeDraftId ? "Guardar cambios" : "Guardar borrador"}
                </button>
                {canConvertDraftToOrder ? (
                  <button
                    type="button"
                    className="hostly-button-primary hostly-button-compact"
                    onClick={handleOpenConvertModal}
                    disabled={isDraftSaving || isConvertingToOrder || !canManagePurchases}
                    title={capabilityDeniedTitle(canManagePurchases)}
                  >
                    Convertir en pedido
                  </button>
                ) : null}
                <button type="button" className="hostly-button-secondary hostly-button-compact" onClick={handleCopySummary}>
                  Copiar resumen
                </button>
                {activeDraftId && !activeDraftMeta?.linkedPurchaseOrderId ? (
                  <button
                    type="button"
                    className="hostly-button-secondary hostly-button-compact"
                    onClick={() => void handleArchiveSavedDraft(activeDraftId)}
                    disabled={isDraftSaving || isConvertingToOrder}
                  >
                    Archivar
                  </button>
                ) : null}
                <button
                  type="button"
                  className="hostly-button-secondary hostly-button-compact"
                  onClick={handleDiscardDraft}
                  disabled={isConvertingToOrder}
                >
                  Descartar
                </button>
              </div>
            </div>

            <ComprasDraftLinesDataView
              lines={draft.lines}
              onQuantityChange={handleDraftQuantityChange}
              disabled={isDraftSaving || isConvertingToOrder}
            />
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
                  className={
                    "hostly-procurement-saved-draft" + (activeDraftId === item.id ? " is-active" : "")
                  }
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
                      className="hostly-button-secondary hostly-button-compact"
                      onClick={() => handleOpenSavedDraft(item)}
                    >
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="hostly-button-secondary hostly-button-compact"
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

        <HostlySegmentedControl aria-label="Filtrar sugerencias">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              className={hostlySegmentTabClassName("min-w-[88px]")}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </HostlySegmentedControl>

        <div className="hostly-panel p-3" style={{ minHeight: 0 }}>
          <ComprasInteligentesDataView
            rows={filteredRows}
            suggestedQtyByProductId={suggestedQtyByProductId}
            estimatedCostByProductId={estimatedCostByProductId}
          />
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
                    className="hostly-button-primary hostly-button-compact"
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
                  <ComprasDraftSummaryLines lines={draft?.lines ?? []} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
                  <button
                    type="button"
                    className="hostly-button-secondary hostly-button-compact"
                    onClick={handleCloseConvertModal}
                    disabled={isConvertingToOrder}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="hostly-button-primary hostly-button-compact"
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
