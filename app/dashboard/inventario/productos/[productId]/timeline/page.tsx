"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import {
  ProductTimelineDetailPanel,
  ProductTimelineKpiStrip,
  ProductTimelineList,
  ProductTimelineLoadingSkeleton,
  ProductTimelinePaginationBar,
  ProductTimelineToolbar,
} from "@/components/inventario/product-timeline-ui";
import { inventoryHubShellLayout } from "@/components/inventario/inventory-hub-shell-layout";
import { InventarioRouteTabs } from "@/components/inventario/inventario-route-tabs";
import ModulePageShell from "@/components/module-page-shell";
import { HostlySectionHeader } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  listenLatestStockMovements,
  listenProductsForInventory,
  type ProductDocument,
  type StockMovementListItem,
} from "@/lib/firestore/products";
import { listenPurchaseOrders, type PurchaseOrderDocument } from "@/lib/firestore/purchase-orders";
import {
  fetchCentralStockMovementsForProductPage,
  listenCentralStockMovementsForProduct,
  type CentralStockMovementListItem,
} from "@/lib/firestore/stock-movements";
import {
  listenSupplierInvoices,
  type SupplierInvoiceDocument,
} from "@/lib/firestore/supplier-invoices";
import {
  buildProductTimelineEvents,
  computeProductTimelineKpis,
  filterProductTimelineEvents,
  mergeCentralStockMovementsDeduped,
  PRODUCT_TIMELINE_MOVEMENTS_PAGE_SIZE,
  PRODUCT_TIMELINE_MOVEMENTS_REALTIME_LIMIT,
  type ProductTimelineDateRange,
  type ProductTimelineEvent,
  type ProductTimelineFilter,
  type ProductTimelineProductInput,
} from "@/lib/inventory/product-timeline";
import {
  exportProductTimelineCsv,
  exportProductTimelinePdf,
} from "@/lib/inventory/product-timeline-export";

function displayUnit(unit: string): string {
  return unit === "unit" ? "ud" : unit;
}

function mapProductToTimelineInput(doc: ProductDocument): ProductTimelineProductInput {
  return {
    productId: doc.id,
    productName: doc.name,
    unit: doc.inventory.unit ?? "ud",
    currentStock: doc.inventory.currentStock ?? null,
    minStock: doc.inventory.minStock ?? null,
    unitCost: doc.inventory.unitCost ?? null,
    supplierName: doc.inventory.supplierName?.trim() ?? null,
  };
}

function invoicesForProduct(
  invoices: readonly SupplierInvoiceDocument[],
  productId: string,
): SupplierInvoiceDocument[] {
  const pid = productId.trim();
  return invoices.filter((invoice) =>
    invoice.lines.some((line) => line.productId.trim() === pid),
  );
}

function purchaseOrdersForProduct(
  orders: readonly PurchaseOrderDocument[],
  productId: string,
): PurchaseOrderDocument[] {
  const pid = productId.trim();
  return orders.filter((order) => order.lines.some((line) => line.productId.trim() === pid));
}

export default function ProductTimelinePage() {
  const params = useParams<{ productId: string }>();
  const productId = decodeURIComponent(params.productId ?? "").trim();
  const { restaurantId, ready: authReady } = useAuth();

  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [liveMovements, setLiveMovements] = useState<CentralStockMovementListItem[]>([]);
  const [pagedMovements, setPagedMovements] = useState<CentralStockMovementListItem[]>([]);
  const [paginationCursor, setPaginationCursor] =
    useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMoreMovements, setHasMoreMovements] = useState(true);
  const [loadingMoreMovements, setLoadingMoreMovements] = useState(false);
  const [legacyMovements, setLegacyMovements] = useState<StockMovementListItem[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoiceDocument[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderDocument[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dataReady, setDataReady] = useState(false);

  const [filter, setFilter] = useState<ProductTimelineFilter>("all");
  const [dateRange, setDateRange] = useState<ProductTimelineDateRange>({
    fromMs: null,
    toMs: null,
  });
  const [selectedEvent, setSelectedEvent] = useState<ProductTimelineEvent | null>(null);
  const hasPaginatedMovementsRef = useRef(false);

  const product = useMemo(
    () => products.find((item) => item.id === productId) ?? null,
    [products, productId],
  );

  const movements = useMemo(
    () => mergeCentralStockMovementsDeduped(liveMovements, pagedMovements),
    [liveMovements, pagedMovements],
  );

  useEffect(() => {
    setPagedMovements([]);
    setPaginationCursor(null);
    setHasMoreMovements(true);
    setLiveMovements([]);
    hasPaginatedMovementsRef.current = false;
  }, [productId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setProducts([]);
      return;
    }
    return listenProductsForInventory(restaurantId, setProducts, () => {
      setLoadError("No se pudo cargar el producto.");
    });
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId || !productId) {
      setLiveMovements([]);
      setDataReady(false);
      return;
    }
    setDataReady(false);
    return listenCentralStockMovementsForProduct(
      restaurantId,
      productId,
      (items) => {
        setLiveMovements(items);
        setDataReady(true);
        if (!hasPaginatedMovementsRef.current) {
          setHasMoreMovements(items.length >= PRODUCT_TIMELINE_MOVEMENTS_REALTIME_LIMIT);
        }
      },
      {
        limit: PRODUCT_TIMELINE_MOVEMENTS_REALTIME_LIMIT,
        onError: () => setLoadError("No se pudieron cargar los movimientos."),
      },
    );
  }, [authReady, productId, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId || !productId) {
      setLegacyMovements([]);
      return;
    }
    return listenLatestStockMovements(restaurantId, productId, setLegacyMovements, {
      limit: 20,
    });
  }, [authReady, productId, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setInvoices([]);
      return;
    }
    return listenSupplierInvoices(restaurantId, setInvoices, {
      limit: 100,
      onError: () => setLoadError("No se pudieron cargar las facturas."),
    });
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) {
      setPurchaseOrders([]);
      return;
    }
    return listenPurchaseOrders(restaurantId, setPurchaseOrders, {
      limit: 100,
      onError: () => setLoadError("No se pudieron cargar los pedidos."),
    });
  }, [authReady, restaurantId]);

  const productInput = useMemo(
    () => (product ? mapProductToTimelineInput(product) : null),
    [product],
  );

  const scopedInvoices = useMemo(
    () => (productId ? invoicesForProduct(invoices, productId) : []),
    [invoices, productId],
  );

  const scopedOrders = useMemo(
    () => (productId ? purchaseOrdersForProduct(purchaseOrders, productId) : []),
    [productId, purchaseOrders],
  );

  const allEvents = useMemo(() => {
    if (!productInput) return [];
    return buildProductTimelineEvents({
      product: productInput,
      movements,
      legacyMovements,
      invoices: scopedInvoices,
      purchaseOrders: scopedOrders,
    });
  }, [legacyMovements, movements, productInput, scopedInvoices, scopedOrders]);

  const filteredEvents = useMemo(
    () => filterProductTimelineEvents(allEvents, filter, dateRange),
    [allEvents, dateRange, filter],
  );

  const kpis = useMemo(() => {
    if (!productInput) {
      return {
        currentStock: null,
        consumption14d: 0,
        currentUnitCost: null,
        lastUnitCost: null,
        lastSupplierName: null,
        relatedSalesCount: 0,
        alertCount: 0,
      };
    }
    return computeProductTimelineKpis({
      product: productInput,
      events: allEvents,
      movements,
    });
  }, [allEvents, movements, productInput]);

  const handleLoadMoreMovements = useCallback(async () => {
    if (!restaurantId || !productId || loadingMoreMovements || !hasMoreMovements) return;

    setLoadingMoreMovements(true);
    hasPaginatedMovementsRef.current = true;
    try {
      const merged = mergeCentralStockMovementsDeduped(liveMovements, pagedMovements);
      const oldest = merged[merged.length - 1];

      const result = await fetchCentralStockMovementsForProductPage({
        restaurantId,
        productId,
        pageSize: PRODUCT_TIMELINE_MOVEMENTS_PAGE_SIZE,
        cursor: paginationCursor,
        cursorMovementId: paginationCursor ? null : oldest?.id ?? null,
        excludeIds: merged.map((item) => item.id),
      });

      if (result.items.length === 0) {
        setHasMoreMovements(false);
        return;
      }

      setPagedMovements((prev) => mergeCentralStockMovementsDeduped(prev, result.items));
      setPaginationCursor(result.lastDoc);
      setHasMoreMovements(result.hasMore);
    } catch {
      setLoadError("No se pudo cargar más movimientos.");
    } finally {
      setLoadingMoreMovements(false);
    }
  }, [
    hasMoreMovements,
    liveMovements,
    loadingMoreMovements,
    pagedMovements,
    paginationCursor,
    productId,
    restaurantId,
  ]);

  const unitLabel = productInput ? displayUnit(productInput.unit) : "ud";
  const productName = product?.name?.trim() || "Producto";
  const exportScopeNote = "Exporta los eventos cargados actualmente (filtros aplicados).";

  const handleExportCsv = useCallback(() => {
    if (!productInput) return;
    exportProductTimelineCsv({
      productId: productInput.productId,
      productName: productInput.productName,
      unit: unitLabel,
      events: filteredEvents,
      filter,
      dateRange,
      kpis,
      loadedMovementCount: movements.length,
    });
  }, [dateRange, filter, filteredEvents, kpis, movements.length, productInput, unitLabel]);

  const handleExportPdf = useCallback(() => {
    if (!productInput) return;
    exportProductTimelinePdf({
      productId: productInput.productId,
      productName: productInput.productName,
      unit: unitLabel,
      events: filteredEvents,
      filter,
      dateRange,
      kpis,
      loadedMovementCount: movements.length,
    });
  }, [dateRange, filter, filteredEvents, kpis, movements.length, productInput, unitLabel]);

  return (
    <ModulePageShell
      title="Historial de movimientos"
      subtitle={productName}
      {...inventoryHubShellLayout}
      headerBelow={<InventarioRouteTabs />}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          flex: 1,
        }}
      >
        <HostlySectionHeader
          title="Historial unificado"
          description="Compras, recepciones, consumos, costes y alertas en tiempo real."
        >
          <Link
            href="/dashboard/inventario"
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(148, 163, 184, 0.28)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              color: "var(--hostly-ink-strong)",
            }}
          >
            ← Inventario
          </Link>
        </HostlySectionHeader>

        {loadError ? (
          <div role="alert" style={{ fontSize: 13, color: "#b91c1c" }}>
            {loadError}
          </div>
        ) : null}

        {!product && dataReady ? (
          <div className="hostly-panel" style={{ padding: 16, fontSize: 13 }}>
            Producto no encontrado o sin inventario activo.{" "}
            <Link href="/dashboard/inventario">Volver al inventario</Link>
          </div>
        ) : null}

        {productInput ? (
          <ProductTimelineKpiStrip kpis={kpis} unit={unitLabel} />
        ) : null}

        <ProductTimelineToolbar
          filter={filter}
          dateRange={dateRange}
          onFilterChange={setFilter}
          onDateRangeChange={setDateRange}
          onExportCsv={handleExportCsv}
          onExportPdf={handleExportPdf}
          exportDisabled={!productInput || !dataReady}
          exportScopeNote={exportScopeNote}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: selectedEvent ? "minmax(0, 1fr) minmax(260px, 340px)" : "1fr",
            gap: 12,
            minHeight: 0,
            flex: 1,
            alignItems: "start",
          }}
        >
          <div style={{ minWidth: 0, overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
            {!dataReady || !productInput ? (
              <ProductTimelineLoadingSkeleton />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <ProductTimelineList
                  events={filteredEvents}
                  activeEventId={selectedEvent?.id ?? null}
                  onSelect={setSelectedEvent}
                />
                <ProductTimelinePaginationBar
                  loadedEventCount={filteredEvents.length}
                  loadedMovementCount={movements.length}
                  hasMore={hasMoreMovements}
                  loading={loadingMoreMovements}
                  onLoadMore={() => void handleLoadMoreMovements()}
                />
              </div>
            )}
          </div>

          {selectedEvent ? (
            <ProductTimelineDetailPanel
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
            />
          ) : null}
        </div>
      </div>
    </ModulePageShell>
  );
}
