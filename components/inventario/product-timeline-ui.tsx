"use client";

import "./product-timeline-ui.css";

import Link from "next/link";
import { type CSSProperties, useState } from "react";
import {
  buildProductTimelineContextLinks,
  formatTimelineRelative,
  PRODUCT_TIMELINE_FILTER_OPTIONS,
  type ProductTimelineDateRange,
  type ProductTimelineEvent,
  type ProductTimelineFilter,
  type ProductTimelineKpiSummary,
} from "@/lib/inventory/product-timeline";

const touchInputStyle: CSSProperties = {
  minHeight: 38,
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const compactButton: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "var(--hostly-surface-card-solid)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  textDecoration: "none",
  color: "var(--hostly-ink-strong)",
  display: "inline-flex",
  alignItems: "center",
};

function formatQty(value: number | null | undefined, unit?: string | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const qty = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 3 }).format(value);
  return unit ? `${qty} ${unit}` : qty;
}

function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} €`;
}

export function ProductTimelineKpiStrip({ kpis, unit }: { kpis: ProductTimelineKpiSummary; unit: string }) {
  const cards = [
    ["Stock actual", formatQty(kpis.currentStock, unit), "#64748b"],
    ["Consumo 14d", formatQty(kpis.consumption14d, unit), "#3b82f6"],
    ["Coste actual", formatEur(kpis.currentUnitCost), "var(--hostly-ink-strong)"],
    ["Último coste", formatEur(kpis.lastUnitCost), "#f59e0b"],
    ["Último proveedor", kpis.lastSupplierName ?? "—", "#64748b"],
    ["Ventas relacionadas", String(kpis.relatedSalesCount), "#10b981"],
    ["Alertas", String(kpis.alertCount), kpis.alertCount > 0 ? "#ef4444" : "#94a3b8"],
  ] as const;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 8,
      }}
    >
      {cards.map(([title, value, color]) => (
        <div
          key={title}
          className="hostly-panel"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(148, 163, 184, 0.16)" }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--hostly-ink-muted)" }}>{title}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color, marginTop: 4, wordBreak: "break-word" }}>
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProductTimelineToolbar({
  filter,
  dateRange,
  onFilterChange,
  onDateRangeChange,
  onExportCsv,
  onExportPdf,
  exportDisabled,
  exportScopeNote,
}: {
  filter: ProductTimelineFilter;
  dateRange: ProductTimelineDateRange;
  onFilterChange: (filter: ProductTimelineFilter) => void;
  onDateRangeChange: (range: ProductTimelineDateRange) => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  exportDisabled?: boolean;
  exportScopeNote?: string | null;
}) {
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const exportButtons = (
    <>
      <button
        type="button"
        style={compactButton}
        disabled={exportDisabled}
        onClick={onExportCsv}
      >
        Exportar CSV
      </button>
      <button
        type="button"
        style={compactButton}
        disabled={exportDisabled}
        onClick={onExportPdf}
      >
        Exportar PDF
      </button>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        className="hostly-product-timeline-sticky hostly-panel"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(148, 163, 184, 0.18)",
          alignItems: "center",
        }}
      >
      <div className="hostly-segmented" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {PRODUCT_TIMELINE_FILTER_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="hostly-tab"
            data-active={filter === option.id ? "true" : undefined}
            onClick={() => onFilterChange(option.id)}
            style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <input
        type="date"
        value={dateRange.fromMs ? new Date(dateRange.fromMs).toISOString().slice(0, 10) : ""}
        onChange={(event) =>
          onDateRangeChange({
            ...dateRange,
            fromMs: event.target.value
              ? new Date(`${event.target.value}T00:00:00`).getTime()
              : null,
          })
        }
        style={{ ...touchInputStyle, width: 150, flex: "0 1 auto" }}
      />
      <input
        type="date"
        value={dateRange.toMs ? new Date(dateRange.toMs).toISOString().slice(0, 10) : ""}
        onChange={(event) =>
          onDateRangeChange({
            ...dateRange,
            toMs: event.target.value
              ? new Date(`${event.target.value}T23:59:59`).getTime()
              : null,
          })
        }
        style={{ ...touchInputStyle, width: 150, flex: "0 1 auto" }}
      />
      <button
        type="button"
        style={compactButton}
        onClick={() => onDateRangeChange({ fromMs: null, toMs: null })}
      >
        Limpiar fechas
      </button>
      <button
        type="button"
        className="hostly-product-timeline-mobile-toggle"
        style={compactButton}
        onClick={() => setMobileActionsOpen((open) => !open)}
        aria-expanded={mobileActionsOpen}
      >
        {mobileActionsOpen ? "Cerrar" : "Exportar"}
      </button>
      <div
        className="hostly-product-timeline-toolbar-actions"
        data-open={mobileActionsOpen ? "true" : undefined}
      >
        {exportButtons}
      </div>
      </div>
      {exportScopeNote ? (
        <p style={{ margin: 0, fontSize: 11, color: "var(--hostly-ink-muted)", paddingLeft: 2 }}>
          {exportScopeNote}
        </p>
      ) : null}
    </div>
  );
}

/** @deprecated Use ProductTimelineToolbar */
export function ProductTimelineFilterBar(props: Omit<
  Parameters<typeof ProductTimelineToolbar>[0],
  "onExportCsv" | "onExportPdf" | "exportDisabled"
> & {
  onExportCsv?: () => void;
  onExportPdf?: () => void;
  exportDisabled?: boolean;
}) {
  return (
    <ProductTimelineToolbar
      {...props}
      onExportCsv={props.onExportCsv ?? (() => {})}
      onExportPdf={props.onExportPdf ?? (() => {})}
      exportDisabled={props.exportDisabled}
    />
  );
}

export function ProductTimelineList({
  events,
  activeEventId,
  onSelect,
}: {
  events: ProductTimelineEvent[];
  activeEventId: string | null;
  onSelect: (event: ProductTimelineEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <div
        className="hostly-panel"
        style={{
          padding: 24,
          textAlign: "center",
          border: "1px dashed rgba(148, 163, 184, 0.28)",
          color: "var(--hostly-ink-muted)",
          fontSize: 13,
        }}
      >
        Sin eventos para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="hostly-product-timeline-line">
      {events.map((event) => {
        const links = buildProductTimelineContextLinks(event);
        return (
          <button
            key={event.id}
            type="button"
            className="hostly-product-timeline-item hostly-panel"
            data-active={activeEventId === event.id ? "true" : undefined}
            onClick={() => onSelect(event)}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 12px 10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(148, 163, 184, 0.16)",
              cursor: "pointer",
              background: "var(--hostly-surface-card-solid)",
            }}
          >
            <span
              className="hostly-product-timeline-dot"
              data-severity={event.severity}
              aria-hidden
            />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
                  {event.title}
                </div>
                {event.subtitle ? (
                  <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", marginTop: 2 }}>
                    {event.subtitle}
                  </div>
                ) : null}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontSize: 11 }}>
                  {event.delta != null ? (
                    <span style={{ fontWeight: 700, color: event.delta >= 0 ? "#047857" : "#0369a1" }}>
                      Δ {formatQty(event.delta, event.unit)}
                    </span>
                  ) : null}
                  {event.stockBefore != null || event.stockAfter != null ? (
                    <span style={{ color: "var(--hostly-ink-muted)" }}>
                      Stock {formatQty(event.stockBefore, event.unit)} → {formatQty(event.stockAfter, event.unit)}
                    </span>
                  ) : null}
                </div>
                {links.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {links.map((link) => (
                      <Link
                        key={link.href + link.label}
                        href={link.href}
                        style={{ ...compactButton, fontSize: 11, padding: "4px 8px" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)", whiteSpace: "nowrap" }}>
                {formatTimelineRelative(event.timestamp)}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function ProductTimelineDetailPanel({
  event,
  onClose,
}: {
  event: ProductTimelineEvent;
  onClose: () => void;
}) {
  const rows: Array<[string, string | null]> = [
    ["Tipo", event.type],
    ["Fuente", event.source ?? "—"],
    ["movementId", event.movementId ?? "—"],
    ["invoiceId", event.invoiceId ?? "—"],
    ["purchaseOrderId", event.purchaseOrderId ?? "—"],
    ["purchaseReceiptId", event.purchaseReceiptId ?? "—"],
    ["orderId", event.orderId ?? "—"],
    ["lineId", event.lineId ?? "—"],
    ["applied", event.applied == null ? "—" : event.applied ? "true" : "false"],
    ["applyError", event.applyError ?? "—"],
    ["sourceDocumentId", event.sourceDocumentId ?? "—"],
    ["Proveedor", event.supplierName ?? "—"],
    ["Coste", `${formatEur(event.costBefore)} → ${formatEur(event.costAfter)}`],
    ["Stock", `${formatQty(event.stockBefore, event.unit)} → ${formatQty(event.stockAfter, event.unit)}`],
    ["Timestamp", new Date(event.timestamp).toLocaleString("es-ES")],
  ];

  return (
    <aside
      className="hostly-product-timeline-side hostly-panel"
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, minWidth: 280 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Detalle operacional</div>
        <button type="button" style={compactButton} onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--hostly-ink-strong)" }}>{event.title}</div>
      {event.subtitle ? (
        <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>{event.subtitle}</div>
      ) : null}
      <div style={{ display: "grid", gap: 6 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ fontSize: 12 }}>
            <div style={{ color: "var(--hostly-ink-muted)", fontWeight: 700 }}>{label}</div>
            <div style={{ color: "var(--hostly-ink-strong)", wordBreak: "break-word" }}>{value ?? "—"}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {buildProductTimelineContextLinks(event).map((link) => (
          <Link key={link.href + link.label} href={link.href} style={compactButton}>
            Abrir {link.label}
          </Link>
        ))}
      </div>
    </aside>
  );
}

export function ProductTimelineLoadingSkeleton() {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="hostly-product-timeline-skeleton"
          style={{ height: 72, borderRadius: 10, border: "1px solid rgba(148, 163, 184, 0.12)" }}
        />
      ))}
    </div>
  );
}

export function ProductTimelinePaginationBar({
  loadedEventCount,
  loadedMovementCount,
  hasMore,
  loading,
  onLoadMore,
}: {
  loadedEventCount: number;
  loadedMovementCount: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
}) {
  return (
    <div
      className="hostly-panel"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>
        Mostrando {loadedEventCount} evento{loadedEventCount === 1 ? "" : "s"}
        {loadedMovementCount > 0
          ? ` · ${loadedMovementCount} movimiento${loadedMovementCount === 1 ? "" : "s"} central`
          : ""}
      </span>
      {hasMore ? (
        <button
          type="button"
          style={compactButton}
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? "Cargando…" : "Cargar más"}
        </button>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>
          No hay más movimientos
        </span>
      )}
    </div>
  );
}
