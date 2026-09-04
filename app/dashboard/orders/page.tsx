"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import ModulePageShell from "@/components/module-page-shell";
import {
  HostlyAlert,
  HostlyButton,
  HostlyInput,
  HostlySectionHeader,
  HostlySelect,
  HostlySurface,
} from "@/components/ui/hostly";
import { HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import { db } from "@/lib/firebase/client";

type OrderRow = Record<string, unknown> & { id: string };
type HistoryStatusFilter = "all" | "open" | "closed" | "other";

const ORDERS_PER_PAGE = 24;
const EUR_FORMATTER = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function readTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const date = toDate.call(value) as unknown;
      if (date instanceof Date) return date.getTime();
    }
  }
  return null;
}

function formatOrderDate(order: OrderRow): string {
  const ms = readTimestampMs(order.updatedAt) ?? readTimestampMs(order.createdAt);
  if (ms == null) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(ms));
}

function orderStatus(order: OrderRow): { label: string; tone: "success" | "info" | "neutral" } {
  const status = typeof order.status === "string" ? order.status.trim().toLowerCase() : "";
  if (status === "paid" || status === "closed") return { label: "Cerrada", tone: "success" };
  if (status === "open" || status === "active") return { label: "Abierta", tone: "info" };
  return { label: "Guardada", tone: "neutral" };
}

function orderStatusFilter(order: OrderRow): Exclude<HistoryStatusFilter, "all"> {
  const status = typeof order.status === "string" ? order.status.trim().toLowerCase() : "";
  if (status === "paid" || status === "closed") return "closed";
  if (status === "open" || status === "active") return "open";
  return "other";
}

function searchableOrderText(order: OrderRow): string {
  const itemNames = Array.isArray(order.items)
    ? order.items.map((item) => {
        if (!item || typeof item !== "object") return "";
        const row = item as { nombre?: unknown; name?: unknown };
        return typeof row.nombre === "string"
          ? row.nombre
          : typeof row.name === "string"
            ? row.name
            : "";
      })
    : [];
  return [order.id, order.tableName, order.table, ...itemNames]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase("es");
}

export default function OrdersPage() {
  const { restaurantId } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const load = async () => {
      if (!restaurantId) {
        setOrders([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const ordersQuery = query(
          collection(db, "orders"),
          where("restaurantId", "==", restaurantId),
        );
        const snap = await getDocs(ordersQuery);
        const data: OrderRow[] = snap.docs
          .map((orderDoc) => ({ id: orderDoc.id, ...orderDoc.data() }) as OrderRow)
          .sort((a, b) => {
            const aMs = readTimestampMs(a.updatedAt) ?? readTimestampMs(a.createdAt) ?? 0;
            const bMs = readTimestampMs(b.updatedAt) ?? readTimestampMs(b.createdAt) ?? 0;
            return bMs - aMs;
          });
        setOrders(data);
      } catch {
        setOrders([]);
        setLoadError("No se pudo cargar el historial de comandas.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [restaurantId]);

  useEffect(() => {
    setPage(1);
  }, [restaurantId, search, statusFilter]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    return orders.filter((order) => {
      if (statusFilter !== "all" && orderStatusFilter(order) !== statusFilter) {
        return false;
      }
      return !normalizedSearch || searchableOrderText(order).includes(normalizedSearch);
    });
  }, [orders, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const visibleOrders = useMemo(
    () =>
      filteredOrders.slice(
        (currentPage - 1) * ORDERS_PER_PAGE,
        currentPage * ORDERS_PER_PAGE,
      ),
    [currentPage, filteredOrders],
  );

  return (
    <ModulePageShell title="Historial de comandas" subtitle="Comandas guardadas" maxWidth={1180} compactLayout>
      <div className="hostly-order-history">
        <HostlySectionHeader
          title="Comandas recientes"
          description={
            loading
              ? "Cargando historial…"
              : `${filteredOrders.length} de ${orders.length} comandas`
          }
        />
        {!loading && orders.length > 0 ? (
          <div className="hostly-order-history__toolbar" role="search">
            <HostlyInput
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar mesa, producto o identificador"
              aria-label="Buscar comandas"
            />
            <HostlySelect
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as HistoryStatusFilter)
              }
              aria-label="Filtrar comandas por estado"
            >
              <option value="all">Todos los estados</option>
              <option value="open">Abiertas</option>
              <option value="closed">Cerradas</option>
              <option value="other">Otros estados</option>
            </HostlySelect>
          </div>
        ) : null}
        {loadError ? <HostlyAlert tone="danger">{loadError}</HostlyAlert> : null}
        {!loading && !loadError && orders.length === 0 ? (
          <HostlySurface variant="ice" className="hostly-order-history__empty">
            <strong>Todavía no hay comandas guardadas</strong>
            <span>Las comandas del restaurante aparecerán aquí.</span>
          </HostlySurface>
        ) : null}
        {!loading && !loadError && orders.length > 0 && filteredOrders.length === 0 ? (
          <HostlySurface variant="ice" className="hostly-order-history__empty">
            <strong>No hay comandas con estos filtros</strong>
            <span>Prueba otra búsqueda o estado.</span>
          </HostlySurface>
        ) : null}
        {visibleOrders.length > 0 ? (
          <div className="hostly-order-history__list">
            {visibleOrders.map((order) => {
              const total = typeof order.total === "number" ? order.total : null;
              const items = Array.isArray(order.items) ? (order.items as unknown[]) : [];
              const tableName = typeof order.tableName === "string" && order.tableName.trim()
                ? order.tableName.trim() : "Comanda";
              const status = orderStatus(order);
              return (
                <HostlySurface key={order.id} variant="flat" className="hostly-order-history__card">
                  <div className="hostly-order-history__card-header">
                    <div>
                      <strong>{tableName}</strong>
                      <span>{formatOrderDate(order)}</span>
                    </div>
                    <div className="hostly-order-history__summary">
                      <HostlyStatusBadge tone={status.tone}>{status.label}</HostlyStatusBadge>
                      <strong>{total != null ? EUR_FORMATTER.format(total) : "—"}</strong>
                    </div>
                  </div>
                  <div className="hostly-order-history__items">
                    {items.length > 0 ? items.map((item, index) => {
                      const row = item as { nombre?: unknown; name?: unknown; quantity?: unknown; qty?: unknown };
                      const name = typeof row.nombre === "string" ? row.nombre
                        : typeof row.name === "string" ? row.name : "Producto";
                      const quantity = typeof row.quantity === "number" ? row.quantity
                        : typeof row.qty === "number" ? row.qty : null;
                      return (
                        <div key={`${order.id}-${index}`} className="hostly-order-history__item">
                          <span>{name}</span>
                          <strong>{quantity != null ? `× ${quantity}` : "—"}</strong>
                        </div>
                      );
                    }) : <span className="hostly-order-history__no-items">Sin detalle de productos</span>}
                  </div>
                </HostlySurface>
              );
            })}
          </div>
        ) : null}
        {filteredOrders.length > ORDERS_PER_PAGE ? (
          <nav className="hostly-order-history__pagination" aria-label="Paginación de comandas">
            <HostlyButton
              type="button"
              variant="secondary"
              size="compact"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Anterior
            </HostlyButton>
            <span>
              Página {currentPage} de {pageCount}
            </span>
            <HostlyButton
              type="button"
              variant="secondary"
              size="compact"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Siguiente
            </HostlyButton>
          </nav>
        ) : null}
      </div>
    </ModulePageShell>
  );
}
