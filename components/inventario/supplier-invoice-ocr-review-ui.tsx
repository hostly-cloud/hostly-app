"use client";

import "./supplier-invoice-ocr-review.css";

import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HostlyKpiCard } from "@/components/ui/hostly/HostlyKpiCard";
import { HostlySegmentedControl, hostlySegmentTabClassName } from "@/components/ui/hostly";
import type { ExtractedInvoiceLineDraft } from "@/lib/inventory/extracted-invoice-to-supplier-invoice";
import type { ExtractedInvoiceValidationSummary } from "@/lib/inventory/extracted-invoice-to-supplier-invoice";
import type { ExtractedSupplierInvoiceDraft } from "@/lib/inventory/extracted-supplier-invoice-types";
import type { ProductDocument } from "@/lib/firestore/products";
import {
  type ExtractionStatusBadge,
  type InvoiceOcrFieldId,
  type LineVisualContext,
  type LineVisualState,
  type ReviewKpiSummary,
  type SessionLearningEntry,
  resolveLineVisualState,
} from "@/lib/inventory/invoice-ocr-review-ux";

export type DraftLineRow = ExtractedInvoiceLineDraft & { rowKey: string };

const touchInputStyle: CSSProperties = {
  minHeight: 40,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  fontSize: 13,
  width: "100%",
  boxSizing: "border-box",
};

const pillStyles: Record<
  LineVisualState["kind"],
  { bg: string; border: string; color: string }
> = {
  learned: {
    bg: "rgba(59, 130, 246, 0.1)",
    border: "rgba(59, 130, 246, 0.28)",
    color: "#1d4ed8",
  },
  high_match: {
    bg: "rgba(16, 185, 129, 0.1)",
    border: "rgba(16, 185, 129, 0.28)",
    color: "#047857",
  },
  manual_review: {
    bg: "rgba(14, 165, 233, 0.1)",
    border: "rgba(14, 165, 233, 0.28)",
    color: "#0369a1",
  },
  pending: {
    bg: "rgba(245, 158, 11, 0.1)",
    border: "rgba(245, 158, 11, 0.32)",
    color: "#b45309",
  },
  no_product: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.28)",
    color: "#b91c1c",
  },
  excluded: {
    bg: "rgba(148, 163, 184, 0.1)",
    border: "rgba(148, 163, 184, 0.24)",
    color: "var(--hostly-ink-muted)",
  },
  ready: {
    bg: "rgba(16, 185, 129, 0.1)",
    border: "rgba(16, 185, 129, 0.28)",
    color: "#047857",
  },
};

export function LineStatusPill({ state }: { state: LineVisualState }) {
  const tone = pillStyles[state.kind];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.color,
      }}
    >
      {state.label}
    </span>
  );
}

export function SessionLearningPanel({ entries }: { entries: SessionLearningEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div
      className="hostly-panel"
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(59, 130, 246, 0.22)",
        background: "rgba(59, 130, 246, 0.04)",
        minWidth: 240,
        maxWidth: 320,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>
        Hostly ha aprendido automáticamente
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map((entry) => (
          <div key={entry.id} style={{ fontSize: 11, color: "var(--hostly-ink-muted)", lineHeight: 1.35 }}>
            <span style={{ color: "var(--hostly-ink-strong)", fontWeight: 600 }}>{entry.rawText}</span>
            <span> → </span>
            <span style={{ color: "#1d4ed8", fontWeight: 600 }}>{entry.productName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExtractionStatusBar({ badge }: { badge: ExtractionStatusBadge | null }) {
  if (!badge) return null;

  const toneColor =
    badge.tone === "success"
      ? "#047857"
      : badge.tone === "warning"
        ? "#b45309"
        : badge.tone === "demo"
          ? "#b45309"
          : "var(--hostly-ink-muted)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          border: `1px solid ${toneColor}33`,
          background: `${toneColor}12`,
          color: toneColor,
        }}
      >
        {badge.label}
        {badge.sublabel ? (
          <span style={{ fontWeight: 600, opacity: 0.85 }}>· {badge.sublabel}</span>
        ) : null}
      </span>
      {badge.warnings.length > 0 ? (
        <span style={{ fontSize: 11, color: "var(--hostly-ink-muted)", fontWeight: 600 }}>
          {badge.warnings.length} aviso{badge.warnings.length === 1 ? "" : "s"} OCR
        </span>
      ) : null}
    </div>
  );
}

export function ReviewKpiStrip({
  kpis,
  formatEur,
}: {
  kpis: ReviewKpiSummary;
  formatEur: (value: number) => string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
        gap: 8,
      }}
    >
      <HostlyKpiCard title="Líneas" value={kpis.totalLines} accentColor="#64748b" />
      <HostlyKpiCard title="Listas" value={kpis.readyCount} accentColor="#10b981" />
      <HostlyKpiCard title="Pendientes" value={kpis.pendingCount} accentColor="#f59e0b" />
      <HostlyKpiCard title="Excluidas" value={kpis.excludedCount} accentColor="#94a3b8" />
      <HostlyKpiCard
        title="Total factura"
        value={formatEur(kpis.totalAmount)}
        accentColor="var(--hostly-ink-strong)"
        valueClassName="!text-[15px]"
      />
    </div>
  );
}

export function BulkActionsToolbar({
  selectedCount,
  inventoryProducts,
  bulkProductId,
  bulkUnit,
  onBulkProductChange,
  onBulkUnitChange,
  onExcludeSelected,
  onIncludeSelected,
  onApplyProduct,
  onApplyUnit,
  onClearSelection,
}: {
  selectedCount: number;
  inventoryProducts: ProductDocument[];
  bulkProductId: string;
  bulkUnit: string;
  onBulkProductChange: (productId: string) => void;
  onBulkUnitChange: (unit: string) => void;
  onExcludeSelected: () => void;
  onIncludeSelected: () => void;
  onApplyProduct: () => void;
  onApplyUnit: () => void;
  onClearSelection: () => void;
}) {
  if (selectedCount <= 0) return null;

  const compactButton: CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid rgba(148, 163, 184, 0.28)",
    background: "var(--hostly-surface-card-solid)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="hostly-ocr-bulk-toolbar hostly-panel"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(59, 130, 246, 0.22)",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, color: "var(--hostly-ink-strong)" }}>
        {selectedCount} seleccionada{selectedCount === 1 ? "" : "s"}
      </span>
      <button type="button" style={compactButton} onClick={onExcludeSelected}>
        Excluir
      </button>
      <button type="button" style={compactButton} onClick={onIncludeSelected}>
        Incluir
      </button>
      <select
        value={bulkProductId}
        onChange={(event) => onBulkProductChange(event.target.value)}
        style={{ ...touchInputStyle, width: 180, minHeight: 34, padding: "6px 8px" }}
      >
        <option value="">Producto Hostly…</option>
        {inventoryProducts.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
      <button type="button" style={compactButton} disabled={!bulkProductId} onClick={onApplyProduct}>
        Aplicar producto
      </button>
      <input
        value={bulkUnit}
        onChange={(event) => onBulkUnitChange(event.target.value)}
        placeholder="Unidad"
        style={{ ...touchInputStyle, width: 72, minHeight: 34, padding: "6px 8px" }}
      />
      <button type="button" style={compactButton} disabled={!bulkUnit.trim()} onClick={onApplyUnit}>
        Aplicar unidad
      </button>
      <button type="button" style={compactButton} onClick={onClearSelection}>
        Limpiar
      </button>
    </div>
  );
}

export function ApplySimilarLinesBanner({
  count,
  productName,
  onApply,
  onDismiss,
}: {
  count: number;
  productName: string;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (count <= 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(59, 130, 246, 0.28)",
        background: "rgba(59, 130, 246, 0.06)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--hostly-ink-strong)" }}>
        Enlazaste <strong>{productName}</strong>. ¿Aplicar a {count} línea
        {count === 1 ? "" : "s"} similar{count === 1 ? "" : "es"} pendiente{count === 1 ? "" : "s"}?
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "var(--hostly-surface-card-solid)",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          No
        </button>
        <button
          type="button"
          onClick={onApply}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(59, 130, 246, 0.35)",
            background: "rgba(59, 130, 246, 0.12)",
            color: "#1d4ed8",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Aplicar a {count} similar{count === 1 ? "" : "es"}
        </button>
      </div>
    </div>
  );
}

type SearchableProductSelectProps = {
  value: string;
  products: ProductDocument[];
  onChange: (productId: string) => void;
  registerInputRef?: (element: HTMLInputElement | null) => void;
  highlighted?: boolean;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onTabFromField?: (event: KeyboardEvent<HTMLInputElement>) => void;
};

export function SearchableProductSelect({
  value,
  products,
  onChange,
  registerInputRef,
  highlighted = false,
  onKeyDown,
  onTabFromField,
}: SearchableProductSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = products.find((product) => product.id === value);

  useEffect(() => {
    if (!selected) {
      setQuery("");
      return;
    }
    setQuery(selected.name);
  }, [selected?.id, selected?.name]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 80);
    return products.filter((product) => product.name.toLowerCase().includes(q)).slice(0, 80);
  }, [products, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const pickProduct = (product: ProductDocument) => {
    onChange(product.id);
    setQuery(product.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        ref={registerInputRef}
        data-field="product"
        data-dropdown-open={open ? "true" : "false"}
        value={query}
        placeholder="Buscar producto Hostly…"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
          if (!event.target.value.trim()) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey) {
            onTabFromField?.(event);
            if (event.defaultPrevented) return;
          }
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            if (event.key === "ArrowDown") {
              setActiveIndex((prev) => Math.min(prev + 1, Math.max(filtered.length - 1, 0)));
            } else {
              setActiveIndex((prev) => Math.max(prev - 1, 0));
            }
            return;
          }
          if (event.key === "Enter" && open && filtered[activeIndex]) {
            event.preventDefault();
            pickProduct(filtered[activeIndex]!);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        style={{
          ...touchInputStyle,
          borderColor: highlighted ? "rgba(245, 158, 11, 0.55)" : "rgba(148, 163, 184, 0.28)",
          background: highlighted ? "rgba(245, 158, 11, 0.04)" : "#fff",
        }}
      />
      {open && filtered.length > 0 ? (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            maxHeight: 220,
            overflow: "auto",
            borderRadius: 10,
            border: "1px solid rgba(148, 163, 184, 0.24)",
            background: "var(--hostly-surface-card-solid)",
            boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
          }}
        >
          {filtered.map((product, index) => (
            <button
              key={product.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pickProduct(product)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                border: 0,
                borderBottom:
                  index < filtered.length - 1 ? "1px solid rgba(148, 163, 184, 0.12)" : undefined,
                background:
                  index === activeIndex ? "rgba(59, 130, 246, 0.08)" : "transparent",
                fontSize: 13,
                cursor: "pointer",
                color: "var(--hostly-ink-strong)",
              }}
            >
              {product.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DocumentPreviewPanel({
  previewUrl,
  isPdfPreview,
  isDemoInvoice,
  isLoading = false,
  sticky = true,
}: {
  previewUrl: string | null;
  isPdfPreview: boolean;
  isDemoInvoice: boolean;
  isLoading?: boolean;
  sticky?: boolean;
}) {
  return (
    <div
      style={{
        position: sticky ? "sticky" : "relative",
        top: sticky ? 12 : undefined,
        alignSelf: "start",
      }}
    >
      {isLoading ? (
        <div
          className="hostly-ocr-doc-skeleton"
          style={{
            minHeight: 320,
            borderRadius: 12,
            border: "1px solid rgba(148, 163, 184, 0.18)",
            display: "grid",
            placeItems: "center",
            color: "var(--hostly-ink-muted)",
            fontSize: 13,
          }}
        >
          Extrayendo documento…
        </div>
      ) : previewUrl ? (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(148, 163, 184, 0.18)",
            overflow: "hidden",
            background: "linear-gradient(180deg, #1e293b 0%, #111827 100%)",
            padding: 12,
          }}
        >
          <div
            style={{
              borderRadius: 8,
              overflow: "auto",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "#fff",
              minHeight: 320,
              height: "min(72vh, 640px)",
              maxHeight: "min(72vh, 640px)",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "center",
            }}
          >
            {isPdfPreview ? (
              <iframe
                title="Vista previa PDF"
                src={previewUrl}
                style={{ width: "100%", height: "100%", minHeight: 320, border: 0, display: "block" }}
              />
            ) : (
              <img
                src={previewUrl}
                alt={isDemoInvoice ? "Vista previa factura demo" : "Vista previa factura"}
                style={{
                  width: "100%",
                  height: "auto",
                  maxHeight: "min(72vh, 640px)",
                  objectFit: "contain",
                  display: "block",
                  background: "#fff",
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            minHeight: 220,
            borderRadius: 12,
            border: "1px dashed rgba(148, 163, 184, 0.28)",
            display: "grid",
            placeItems: "center",
            color: "var(--hostly-ink-muted)",
            fontSize: 13,
            padding: 16,
            textAlign: "center",
            background: "rgba(148, 163, 184, 0.04)",
          }}
        >
          Sube una imagen o PDF para ver la vista previa.
        </div>
      )}
    </div>
  );
}

export function MobileViewTabs({
  active,
  onChange,
}: {
  active: "document" | "review";
  onChange: (tab: "document" | "review") => void;
}) {
  return (
    <HostlySegmentedControl aria-label="Vista móvil factura" scrollable={false} className="w-full">
      {(
        [
          ["document", "Documento"],
          ["review", "Revisión"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          data-active={active === id ? "true" : undefined}
          className={hostlySegmentTabClassName("flex-1")}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </HostlySegmentedControl>
  );
}

export type ReviewLinesTableProps = {
  lineRows: DraftLineRow[];
  lineValidation: ExtractedInvoiceValidationSummary;
  inventoryProducts: ProductDocument[];
  productInputRefs: RefObject<Map<string, HTMLInputElement>>;
  fieldInputRefs: RefObject<Map<string, HTMLInputElement>>;
  onToggleIncluded: (rowKey: string, included: boolean) => void;
  onUpdateLine: (rowKey: string, patch: Partial<DraftLineRow>) => void;
  onProductChange: (rowKey: string, productId: string) => void;
  formatEur: (value: number | null | undefined) => string;
  compact?: boolean;
  selectedRowKeys: ReadonlySet<string>;
  onToggleSelected: (rowKey: string, selected: boolean) => void;
  onToggleAllSelected: (selected: boolean) => void;
  activeRowKey: string | null;
  flashingRowKeys: ReadonlySet<string>;
  cascadeRowKeys: ReadonlySet<string>;
  manualProductRows: ReadonlySet<string>;
  learnedAliasRows: ReadonlySet<string>;
  onFieldTab: (rowKey: string, field: InvoiceOcrFieldId, event: KeyboardEvent<HTMLInputElement>) => void;
  onRowFieldKeyDown: (
    rowKey: string,
    field: InvoiceOcrFieldId,
    event: KeyboardEvent<HTMLInputElement>,
  ) => void;
};

function buildFieldRefKey(rowKey: string, field: InvoiceOcrFieldId): string {
  return `${rowKey}:${field}`;
}

export function ReviewLinesTable({
  lineRows,
  lineValidation,
  inventoryProducts,
  productInputRefs,
  fieldInputRefs,
  onToggleIncluded,
  onUpdateLine,
  onProductChange,
  formatEur,
  compact = false,
  selectedRowKeys,
  onToggleSelected,
  onToggleAllSelected,
  activeRowKey,
  flashingRowKeys,
  cascadeRowKeys,
  manualProductRows,
  learnedAliasRows,
  onFieldTab,
  onRowFieldKeyDown,
}: ReviewLinesTableProps) {
  const allSelected = lineRows.length > 0 && lineRows.every((line) => selectedRowKeys.has(line.rowKey));

  return (
    <div
      style={{
        overflow: "auto",
        maxHeight: compact ? undefined : "min(62vh, 720px)",
        borderRadius: 10,
        border: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      <table className="hostly-inv-native-table" style={{ minWidth: compact ? 760 : 980 }}>
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onToggleAllSelected(event.target.checked)}
                aria-label="Seleccionar todas"
              />
            </th>
            <th style={{ width: 36 }}>Incl.</th>
            {!compact ? <th>Texto OCR</th> : null}
            <th style={{ minWidth: compact ? 200 : 280 }}>Producto Hostly</th>
            <th>Estado</th>
            <th className="hostly-inv-th-num">Cant.</th>
            <th>Unidad</th>
            <th className="hostly-inv-th-num">P. unit.</th>
            <th className="hostly-inv-th-num">Total</th>
          </tr>
        </thead>
        <tbody>
          {lineRows.map((line, index) => {
            const validation = lineValidation.lineResults[index];
            const visualContext: LineVisualContext = {
              manuallyEditedProduct: manualProductRows.has(line.rowKey),
              matchedViaLearnedAlias: learnedAliasRows.has(line.rowKey),
            };
            const visual = resolveLineVisualState(line, validation, visualContext);
            const pending = validation?.pending ?? false;
            const cascadeIndex = [...cascadeRowKeys].indexOf(line.rowKey);
            const rowClass = [
              pending ? "hostly-ocr-row-pending" : "",
              activeRowKey === line.rowKey ? "hostly-ocr-row-active" : "",
              flashingRowKeys.has(line.rowKey) ? "hostly-ocr-row-flash-validated" : "",
              cascadeIndex >= 0 ? "hostly-ocr-row-cascade" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <tr
                key={line.rowKey}
                data-row-key={line.rowKey}
                className={rowClass || undefined}
                style={{
                  opacity: line.included ? 1 : 0.6,
                  background:
                    visual.kind === "excluded" ? "rgba(148, 163, 184, 0.04)" : undefined,
                  ...(cascadeIndex >= 0
                    ? ({ "--hostly-cascade-index": cascadeIndex } as CSSProperties)
                    : {}),
                }}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selectedRowKeys.has(line.rowKey)}
                    onChange={(event) => onToggleSelected(line.rowKey, event.target.checked)}
                    aria-label="Seleccionar línea"
                    style={{ width: 16, height: 16 }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={line.included}
                    onChange={(event) => onToggleIncluded(line.rowKey, event.target.checked)}
                    aria-label="Incluir línea"
                    style={{ width: 16, height: 16 }}
                  />
                </td>
                {!compact ? (
                  <td className="hostly-inv-td-muted" style={{ maxWidth: 180, fontSize: 12 }}>
                    {line.rawText ?? line.detectedProductName ?? "—"}
                  </td>
                ) : null}
                <td style={{ minWidth: 220 }}>
                  {!compact && line.rawText ? (
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--hostly-ink-muted)",
                        marginBottom: 4,
                        lineHeight: 1.3,
                      }}
                    >
                      {line.rawText}
                    </div>
                  ) : null}
                  <SearchableProductSelect
                    value={line.matchedInventoryProductId ?? ""}
                    products={inventoryProducts}
                    onChange={(productId) => onProductChange(line.rowKey, productId)}
                    registerInputRef={(element) => {
                      const map = productInputRefs.current;
                      if (element) map.set(line.rowKey, element);
                      else map.delete(line.rowKey);
                    }}
                    highlighted={pending}
                    onTabFromField={(event) => onFieldTab(line.rowKey, "product", event)}
                    onKeyDown={(event) => onRowFieldKeyDown(line.rowKey, "product", event)}
                  />
                </td>
                <td>
                  <LineStatusPill state={visual} />
                </td>
                <td className="hostly-inv-td-amount">
                  <input
                    data-field="quantity"
                    ref={(element) => {
                      const key = buildFieldRefKey(line.rowKey, "quantity");
                      const map = fieldInputRefs.current;
                      if (element) map.set(key, element);
                      else map.delete(key);
                    }}
                    type="number"
                    min={0}
                    step="any"
                    value={line.quantity ?? 0}
                    onChange={(event) =>
                      onUpdateLine(line.rowKey, { quantity: Number(event.target.value) || 0 })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && !event.shiftKey) {
                        onFieldTab(line.rowKey, "quantity", event);
                      }
                      onRowFieldKeyDown(line.rowKey, "quantity", event);
                    }}
                    style={{ ...touchInputStyle, width: 72, textAlign: "right" }}
                  />
                </td>
                <td className="hostly-inv-td-muted">
                  <input
                    data-field="unit"
                    ref={(element) => {
                      const key = buildFieldRefKey(line.rowKey, "unit");
                      const map = fieldInputRefs.current;
                      if (element) map.set(key, element);
                      else map.delete(key);
                    }}
                    value={line.unit ?? "ud"}
                    onChange={(event) => onUpdateLine(line.rowKey, { unit: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && !event.shiftKey) {
                        onFieldTab(line.rowKey, "unit", event);
                      }
                      onRowFieldKeyDown(line.rowKey, "unit", event);
                    }}
                    style={{ ...touchInputStyle, width: 64 }}
                  />
                </td>
                <td className="hostly-inv-td-amount">
                  <input
                    data-field="unitPrice"
                    ref={(element) => {
                      const key = buildFieldRefKey(line.rowKey, "unitPrice");
                      const map = fieldInputRefs.current;
                      if (element) map.set(key, element);
                      else map.delete(key);
                    }}
                    type="number"
                    min={0}
                    step="any"
                    value={line.unitPrice ?? 0}
                    onChange={(event) =>
                      onUpdateLine(line.rowKey, { unitPrice: Number(event.target.value) || 0 })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && !event.shiftKey) {
                        onFieldTab(line.rowKey, "unitPrice", event);
                      }
                      onRowFieldKeyDown(line.rowKey, "unitPrice", event);
                    }}
                    style={{ ...touchInputStyle, width: 84, textAlign: "right" }}
                  />
                </td>
                <td className="hostly-inv-td-amount" style={{ fontWeight: 700 }}>
                  {formatEur(line.totalPrice)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceHeaderFields({
  draft,
  onUpdate,
}: {
  draft: ExtractedSupplierInvoiceDraft;
  onUpdate: (
    field: keyof Pick<ExtractedSupplierInvoiceDraft, "supplierName" | "invoiceNumber" | "invoiceDate">,
    value: string,
  ) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
      }}
    >
      {(
        [
          ["supplierName", "Proveedor", "text"],
          ["invoiceNumber", "Nº factura", "text"],
          ["invoiceDate", "Fecha", "date"],
        ] as const
      ).map(([field, label, type]) => (
        <label key={field} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          <span style={{ fontWeight: 700 }}>{label}</span>
          <input
            type={type}
            value={(draft[field] as string | undefined) ?? ""}
            onChange={(event) => onUpdate(field, event.target.value)}
            style={touchInputStyle}
          />
        </label>
      ))}
    </div>
  );
}

export function RegistrationFooter({
  canRegister,
  isRegistering,
  registered,
  showSuccess = false,
  onRegister,
}: {
  canRegister: boolean;
  isRegistering: boolean;
  registered: boolean;
  showSuccess?: boolean;
  onRegister: () => void;
}) {
  return (
    <div
      className={showSuccess ? "hostly-ocr-register-success" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 14px",
        borderRadius: 12,
        border: canRegister
          ? "1px solid rgba(16, 185, 129, 0.32)"
          : "1px solid rgba(148, 163, 184, 0.2)",
        background: canRegister ? "rgba(16, 185, 129, 0.06)" : "rgba(148, 163, 184, 0.04)",
      }}
    >
      <button
        type="button"
        disabled={!canRegister || isRegistering || registered}
        onClick={onRegister}
        style={{
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid var(--hostly-ink-strong)",
          background: "var(--hostly-ink-strong)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 800,
          cursor: canRegister && !isRegistering && !registered ? "pointer" : "not-allowed",
          opacity: canRegister && !isRegistering && !registered ? 1 : 0.55,
          minHeight: 44,
        }}
      >
        Registrar factura
      </button>
      <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)", textAlign: "center" }}>
        Actualizará costes futuros de inventario
      </div>
      <div style={{ fontSize: 11, color: "var(--hostly-ink-muted)", textAlign: "center" }}>
        Atajo: Ctrl/Cmd + Enter
      </div>
    </div>
  );
}
