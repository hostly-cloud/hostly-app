"use client";

import Link from "next/link";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-context";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import {
  AliasConfirmModal,
  AliasDetailPanel,
  AliasesBulkToolbar,
  AliasesFilterToolbar,
  AliasesLoadingSkeleton,
  AliasesTable,
} from "@/components/inventario/supplier-product-aliases-ui";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyKpiCard, HostlyOperationalEmptyState, HostlySectionHeader } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { listenProductsForInventory, type ProductDocument } from "@/lib/firestore/products";
import {
  bulkUpdateSupplierProductAliases,
  listenSupplierProductAliases,
  resetSupplierProductAliasUsageCount,
  setSupplierProductAliasActive,
  softDeleteSupplierProductAlias,
  updateSupplierProductAlias,
} from "@/lib/firestore/supplier-product-aliases";
import type { SupplierProductAliasDocument } from "@/lib/inventory/supplier-product-alias-types";
import {
  countActiveAliases,
  filterSupplierProductAliases,
  findSimilarSupplierProductAliases,
  getAliasOperationalStatus,
  listUniqueSupplierNames,
  type SupplierAliasListFilters,
} from "@/lib/inventory/supplier-product-alias-management";

type ConfirmState =
  | {
      kind: "product_change";
      aliasId: string;
      productId: string;
      productName: string;
    }
  | { kind: "bulk_product"; productId: string; productName: string }
  | null;

const defaultFilters: SupplierAliasListFilters = {
  query: "",
  supplierName: "",
  status: "all",
  sort: "recent",
};

export default function AliasesProveedorPage() {
  const { restaurantId, ready: authReady } = useAuth();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [aliases, setAliases] = useState<SupplierProductAliasDocument[]>([]);
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filters, setFilters] = useState<SupplierAliasListFilters>(defaultFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [flashingRowIds, setFlashingRowIds] = useState<Set<string>>(() => new Set());
  const [detailAliasId, setDetailAliasId] = useState<string | null>(null);
  const [draftProductId, setDraftProductId] = useState("");
  const [bulkProductId, setBulkProductId] = useState("");
  const [showSaveFlash, setShowSaveFlash] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setAliases([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return listenSupplierProductAliases(restaurantId, (items) => {
      setAliases(items);
      setLoading(false);
    }, {
      onError: () => {
        setLoadError("No se pudieron cargar los nombres aprendidos.");
        setLoading(false);
      },
    });
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setProducts([]);
      return;
    }
    return listenProductsForInventory(restaurantId, setProducts);
  }, [authReady, restaurantId]);

  const filteredRows = useMemo(
    () => filterSupplierProductAliases(aliases, filters),
    [aliases, filters],
  );

  const supplierOptions = useMemo(() => listUniqueSupplierNames(aliases), [aliases]);

  const detailAlias = useMemo(
    () => aliases.find((alias) => alias.id === detailAliasId) ?? null,
    [aliases, detailAliasId],
  );

  const similarMatches = useMemo(() => {
    if (!detailAlias) return [];
    return findSimilarSupplierProductAliases(detailAlias, aliases);
  }, [aliases, detailAlias]);

  const activeCount = useMemo(() => countActiveAliases(aliases), [aliases]);

  const triggerFlash = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setFlashingRowIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setFlashingRowIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }, 500);
  }, []);

  const openDetail = useCallback((alias: SupplierProductAliasDocument) => {
    setDetailAliasId(alias.id);
    setActiveRowId(alias.id);
    setDraftProductId(alias.inventoryProductId);
    setShowSaveFlash(false);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailAliasId(null);
  }, []);

  const runToggleActive = useCallback(
    async (alias: SupplierProductAliasDocument) => {
      if (!restaurantId) return;
      const status = getAliasOperationalStatus(alias);
      const nextActive = status !== "active";
      try {
        await setSupplierProductAliasActive({
          restaurantId,
          aliasId: alias.id,
          active: nextActive,
        });
        setFeedback(
          nextActive
            ? "Vinculación activada."
            : "Vinculación desactivada. No afecta a las facturas anteriores.",
        );
        triggerFlash([alias.id]);
      } catch {
        setFeedback("No se pudo cambiar el estado de la vinculación.");
      }
    },
    [restaurantId, triggerFlash],
  );

  const runDelete = useCallback(
    async (alias: SupplierProductAliasDocument) => {
      if (!restaurantId) return;
      try {
        await softDeleteSupplierProductAlias({ restaurantId, aliasId: alias.id });
        setFeedback("Vinculación eliminada.");
        if (detailAliasId === alias.id) closeDetail();
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(alias.id);
          return next;
        });
        triggerFlash([alias.id]);
      } catch {
        setFeedback("No se pudo eliminar la vinculación.");
      }
    },
    [closeDetail, detailAliasId, restaurantId, triggerFlash],
  );

  const runResetUsage = useCallback(
    async (alias: SupplierProductAliasDocument) => {
      if (!restaurantId) return;
      try {
        await resetSupplierProductAliasUsageCount({ restaurantId, aliasId: alias.id });
        setFeedback("Contador de uso reiniciado.");
        triggerFlash([alias.id]);
      } catch {
        setFeedback("No se pudo reiniciar el contador.");
      }
    },
    [restaurantId, triggerFlash],
  );

  const applyProductChange = useCallback(
    async (aliasId: string, productId: string, productName: string) => {
      if (!restaurantId) return;
      setIsBusy(true);
      try {
        await updateSupplierProductAlias({
          restaurantId,
          aliasId,
          patch: {
            inventoryProductId: productId,
            inventoryProductName: productName,
            matchSource: "manual",
          },
        });
        setFeedback("Producto enlazado actualizado.");
        setShowSaveFlash(true);
        window.setTimeout(() => setShowSaveFlash(false), 520);
        triggerFlash([aliasId]);
      } catch {
        setFeedback("No se pudo guardar el producto enlazado.");
      } finally {
        setIsBusy(false);
        setConfirmState(null);
      }
    },
    [restaurantId, triggerFlash],
  );

  const handleSaveProduct = useCallback(() => {
    if (!detailAlias || !draftProductId) return;
    const product = products.find((item) => item.id === draftProductId);
    if (!product) return;
    if (draftProductId === detailAlias.inventoryProductId) return;

    setConfirmState({
      kind: "product_change",
      aliasId: detailAlias.id,
      productId: product.id,
      productName: product.name,
    });
  }, [detailAlias, draftProductId, products]);

  const handleBulkActivate = useCallback(async (active: boolean) => {
    if (!restaurantId || selectedIds.size === 0) return;
    setIsBusy(true);
    try {
      const { failed } = await bulkUpdateSupplierProductAliases({
        restaurantId,
        updates: [...selectedIds].map((aliasId) => ({
          aliasId,
          patch: { active, ...(active ? { deletedAt: null } : {}) },
        })),
      });
      setFeedback(
        active
          ? `Vinculaciones activadas${failed > 0 ? ` (${failed} fallidas)` : ""}.`
          : `Vinculaciones desactivadas${failed > 0 ? ` (${failed} fallidas)` : ""}.`,
      );
      triggerFlash([...selectedIds]);
    } catch {
      setFeedback("No se pudo actualizar la selección.");
    } finally {
      setIsBusy(false);
    }
  }, [restaurantId, selectedIds, triggerFlash]);

  const handleBulkDelete = useCallback(async () => {
    if (!restaurantId || selectedIds.size === 0) return;
    setIsBusy(true);
    try {
      const now = Date.now();
      const { failed } = await bulkUpdateSupplierProductAliases({
        restaurantId,
        updates: [...selectedIds].map((aliasId) => ({
          aliasId,
          patch: { active: false, deletedAt: now },
        })),
      });
      setFeedback(`Vinculaciones eliminadas${failed > 0 ? ` (${failed} fallidas)` : ""}.`);
      triggerFlash([...selectedIds]);
      setSelectedIds(new Set());
      closeDetail();
    } catch {
      setFeedback("No se pudo eliminar la selección.");
    } finally {
      setIsBusy(false);
    }
  }, [closeDetail, restaurantId, selectedIds, triggerFlash]);

  const handleBulkResetUsage = useCallback(async () => {
    if (!restaurantId || selectedIds.size === 0) return;
    setIsBusy(true);
    try {
      const { failed } = await bulkUpdateSupplierProductAliases({
        restaurantId,
        updates: [...selectedIds].map((aliasId) => ({
          aliasId,
          patch: { usageCount: 0 },
        })),
      });
      setFeedback(`Contadores reiniciados${failed > 0 ? ` (${failed} fallidos)` : ""}.`);
      triggerFlash([...selectedIds]);
    } catch {
      setFeedback("No se pudo reiniciar los contadores.");
    } finally {
      setIsBusy(false);
    }
  }, [restaurantId, selectedIds, triggerFlash]);

  const handleBulkApplyProduct = useCallback(() => {
    if (!bulkProductId) return;
    const product = products.find((item) => item.id === bulkProductId);
    if (!product) return;
    setConfirmState({
      kind: "bulk_product",
      productId: product.id,
      productName: product.name,
    });
  }, [bulkProductId, products]);

  const confirmBulkProductChange = useCallback(async () => {
    if (!restaurantId || !confirmState || confirmState.kind !== "bulk_product") return;
    setIsBusy(true);
    try {
      const ids = [...selectedIds];
      const { failed } = await bulkUpdateSupplierProductAliases({
        restaurantId,
        updates: ids.map((aliasId) => ({
          aliasId,
          patch: {
            inventoryProductId: confirmState.productId,
            inventoryProductName: confirmState.productName,
            matchSource: "manual",
          },
        })),
      });
      setFeedback(`Producto aplicado a selección${failed > 0 ? ` (${failed} fallidos)` : ""}.`);
      triggerFlash(ids);
    } catch {
      setFeedback("No se pudo aplicar el producto.");
    } finally {
      setIsBusy(false);
      setConfirmState(null);
    }
  }, [confirmState, restaurantId, selectedIds, triggerFlash]);

  const navigateRow = useCallback(
    (direction: "up" | "down") => {
      if (filteredRows.length === 0) return;
      const currentIndex = activeRowId
        ? filteredRows.findIndex((row) => row.id === activeRowId)
        : -1;
      const nextIndex =
        direction === "down"
          ? Math.min(currentIndex + 1, filteredRows.length - 1)
          : Math.max(currentIndex <= 0 ? 0 : currentIndex - 1, 0);
      const next = filteredRows[nextIndex];
      if (next) openDetail(next);
    },
    [activeRowId, filteredRows, openDetail],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (confirmState || isEditable) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        navigateRow("down");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        navigateRow("up");
      } else if (event.key === " " && activeRowId) {
        event.preventDefault();
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(activeRowId)) next.delete(activeRowId);
          else next.add(activeRowId);
          return next;
        });
      } else if (event.key === "Escape" && detailAliasId) {
        event.preventDefault();
        closeDetail();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeRowId, closeDetail, confirmState, detailAliasId, navigateRow]);

  return (
    <ModulePageShell
      title="Nombres aprendidos de proveedor"
      subtitle="Revisa cómo se relacionan los textos de las facturas con tus productos"
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div className="hostly-mobile-op-page-stack">
        <Link
          href="/dashboard/inventario/facturas-proveedor"
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "var(--hostly-surface-card-solid)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            color: "var(--hostly-ink-strong)",
            alignSelf: "flex-start",
          }}
          prefetch
        >
          ← Volver a facturas
        </Link>

        <HostlySectionHeader
          title="Vinculaciones aprendidas"
          description="Controla qué nombres detectados en las facturas se enlazan con tus productos. Desactivar una vinculación no modifica facturas ya registradas."
        />

        <div className="hostly-mobile-op-kpi-grid">
          <HostlyKpiCard title="Total" value={aliases.length} accentColor="#64748b" />
          <HostlyKpiCard title="Activos" value={activeCount} accentColor="#10b981" />
          <HostlyKpiCard
            title="Filtrados"
            value={filteredRows.length}
            accentColor="var(--hostly-ink-strong)"
          />
          <HostlyKpiCard title="Selección" value={selectedIds.size} accentColor="#3b82f6" />
        </div>

        {loadError ? (
          <div className="hostly-panel p-3" style={{ fontSize: 13, color: "#b91c1c" }}>
            {loadError}
          </div>
        ) : null}

        {feedback ? (
          <div className="hostly-panel p-3" style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>
            {feedback}
          </div>
        ) : null}

        <AliasesFilterToolbar
          filters={filters}
          supplierOptions={supplierOptions}
          onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
          searchInputRef={searchInputRef}
        />

        <AliasesBulkToolbar
          selectedCount={selectedIds.size}
          bulkProductId={bulkProductId}
          products={products}
          onBulkProductChange={setBulkProductId}
          onActivate={() => void handleBulkActivate(true)}
          onDeactivate={() => void handleBulkActivate(false)}
          onApplyProduct={handleBulkApplyProduct}
          onDelete={() => void handleBulkDelete()}
          onResetUsage={() => void handleBulkResetUsage()}
          onClearSelection={() => setSelectedIds(new Set())}
        />

        {loading ? (
          <AliasesLoadingSkeleton />
        ) : filteredRows.length === 0 ? (
          aliases.length === 0 ? (
            <HostlyOperationalEmptyState
              title="Sin nombres aprendidos todavía"
              text="Cuando vincules nombres detectados en las facturas con productos o proveedores, Hostly aprenderá esas relaciones aquí."
              secondaryAction={{
                label: "Volver a facturas",
                href: "/dashboard/inventario/facturas-proveedor",
                variant: "secondary",
              }}
              hints={[
                "Aprendizaje controlado",
                "Sin modificar facturas antiguas",
                "Mejora futuras revisiones",
              ]}
            />
          ) : (
            <div className="hostly-panel p-3" style={{ fontSize: 13, color: "var(--hostly-ink-muted)" }}>
              Ningún alias coincide con los filtros actuales.
            </div>
          )
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: detailAlias ? "minmax(0, 1fr) minmax(280px, 360px)" : "1fr",
              gap: 12,
              alignItems: "start",
            }}
          >
            <AliasesTable
              rows={filteredRows}
              selectedIds={selectedIds}
              activeRowId={activeRowId}
              flashingRowIds={flashingRowIds}
              onToggleSelected={(id, selected) =>
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (selected) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
              onToggleAll={(selected) =>
                setSelectedIds(selected ? new Set(filteredRows.map((row) => row.id)) : new Set())
              }
              onOpenRow={openDetail}
              onToggleActive={(alias) => void runToggleActive(alias)}
              onDeleteRow={(alias) => void runDelete(alias)}
              onResetUsageRow={(alias) => void runResetUsage(alias)}
            />

            {detailAlias ? (
              <AliasDetailPanel
                alias={detailAlias}
                similarMatches={similarMatches}
                products={products}
                draftProductId={draftProductId}
                showSaveFlash={showSaveFlash}
                onDraftProductChange={setDraftProductId}
                onSaveProduct={handleSaveProduct}
                onToggleActive={() => void runToggleActive(detailAlias)}
                onResetUsage={() => void runResetUsage(detailAlias)}
                onDelete={() => void runDelete(detailAlias)}
                onClose={closeDetail}
              />
            ) : null}
          </div>
        )}

        <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)" }}>
          Atajos: ↑↓ navegar · Espacio seleccionar · Ctrl/Cmd+F buscar · Escape cerrar panel
        </div>
      </div>

      {confirmState?.kind === "product_change" ? (
        <AliasConfirmModal
          title="Confirmar cambio de producto"
          message="Cambiar esta vinculación afectará a las próximas asociaciones automáticas. Las facturas ya registradas no se modifican."
          confirmLabel="Confirmar cambio"
          isBusy={isBusy}
          onCancel={() => setConfirmState(null)}
          onConfirm={() =>
            void applyProductChange(
              confirmState.aliasId,
              confirmState.productId,
              confirmState.productName,
            )
          }
        />
      ) : null}

      {confirmState?.kind === "bulk_product" ? (
        <AliasConfirmModal
          title="Confirmar cambio masivo"
          message={`Aplicar "${confirmState.productName}" a ${selectedIds.size} vinculaciones afectará a las próximas asociaciones automáticas.`}
          confirmLabel="Aplicar producto"
          isBusy={isBusy}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => void confirmBulkProductChange()}
        />
      ) : null}
    </ModulePageShell>
  );
}
