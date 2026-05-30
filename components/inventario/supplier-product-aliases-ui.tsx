"use client";

import "./supplier-product-aliases.css";

import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useMemo,
} from "react";
import type { ProductDocument } from "@/lib/firestore/products";
import type { SupplierProductAliasDocument } from "@/lib/inventory/supplier-product-alias-types";
import {
  formatAliasDateTime,
  formatAliasRelative,
  getAliasMatchTypeLabel,
  getAliasOperationalStatus,
  type SimilarAliasMatch,
  type SupplierAliasListFilters,
  type SupplierAliasSortFilter,
  type SupplierAliasStatusFilter,
} from "@/lib/inventory/supplier-product-alias-management";

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
};

function statusPill(status: "active" | "inactive"): CSSProperties {
  return status === "active"
    ? {
        display: "inline-flex",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: "rgba(16, 185, 129, 0.1)",
        border: "1px solid rgba(16, 185, 129, 0.28)",
        color: "#047857",
      }
    : {
        display: "inline-flex",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: "rgba(148, 163, 184, 0.1)",
        border: "1px solid rgba(148, 163, 184, 0.24)",
        color: "var(--hostly-ink-muted)",
      };
}

function matchTypePill(manual: boolean): CSSProperties {
  return manual
    ? {
        display: "inline-flex",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: "rgba(14, 165, 233, 0.1)",
        border: "1px solid rgba(14, 165, 233, 0.28)",
        color: "#0369a1",
      }
    : {
        display: "inline-flex",
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: "rgba(59, 130, 246, 0.1)",
        border: "1px solid rgba(59, 130, 246, 0.28)",
        color: "#1d4ed8",
      };
}

export function AliasesEmptyState() {
  return (
    <div
      className="hostly-panel"
      style={{
        padding: 24,
        textAlign: "center",
        border: "1px dashed rgba(148, 163, 184, 0.28)",
        background: "rgba(148, 163, 184, 0.04)",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--hostly-ink-strong)", marginBottom: 6 }}>
        Sin aliases OCR todavía
      </div>
      <div style={{ fontSize: 13, color: "var(--hostly-ink-muted)", lineHeight: 1.45 }}>
        Hostly aprende aliases al revisar facturas proveedor. Enlaza un producto en la revisión OCR
        y aparecerá aquí.
      </div>
    </div>
  );
}

export function AliasesLoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="hostly-alias-skeleton"
          style={{ height: 44, borderRadius: 10, border: "1px solid rgba(148, 163, 184, 0.12)" }}
        />
      ))}
    </div>
  );
}

export function AliasesFilterToolbar({
  filters,
  supplierOptions,
  onChange,
  searchInputRef,
}: {
  filters: SupplierAliasListFilters;
  supplierOptions: string[];
  onChange: (patch: Partial<SupplierAliasListFilters>) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div
      className="hostly-alias-sticky-toolbar hostly-mobile-op-toolbar hostly-panel"
      style={{
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(148, 163, 184, 0.18)",
      }}
    >
      <input
        ref={searchInputRef}
        className="hostly-mobile-op-toolbar__search hostly-input"
        value={filters.query}
        onChange={(event) => onChange({ query: event.target.value })}
        placeholder="Buscar alias, producto o proveedor…"
        style={{ ...touchInputStyle, flex: "1 1 200px", minWidth: 180 }}
      />
      <div className="hostly-mobile-op-toolbar__filters">
      <select
        value={filters.supplierName}
        onChange={(event) => onChange({ supplierName: event.target.value })}
        style={{ ...touchInputStyle, width: 160, flex: "0 1 auto" }}
      >
        <option value="">Todos los proveedores</option>
        {supplierOptions.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <select
        value={filters.status}
        onChange={(event) =>
          onChange({ status: event.target.value as SupplierAliasStatusFilter })
        }
        style={{ ...touchInputStyle, width: 130, flex: "0 1 auto" }}
      >
        <option value="all">Todos estados</option>
        <option value="active">Activos</option>
        <option value="inactive">Desactivados</option>
      </select>
      <select
        value={filters.sort}
        onChange={(event) => onChange({ sort: event.target.value as SupplierAliasSortFilter })}
        style={{ ...touchInputStyle, width: 170, flex: "0 1 auto" }}
      >
        <option value="recent">Más recientes</option>
        <option value="most_used">Más usados</option>
        <option value="stale">Sin usar recientemente</option>
      </select>
      </div>
    </div>
  );
}

export function AliasesBulkToolbar({
  selectedCount,
  bulkProductId,
  products,
  onBulkProductChange,
  onActivate,
  onDeactivate,
  onApplyProduct,
  onDelete,
  onResetUsage,
  onClearSelection,
}: {
  selectedCount: number;
  bulkProductId: string;
  products: ProductDocument[];
  onBulkProductChange: (productId: string) => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onApplyProduct: () => void;
  onDelete: () => void;
  onResetUsage: () => void;
  onClearSelection: () => void;
}) {
  if (selectedCount <= 0) return null;

  return (
    <div
      className="hostly-alias-sticky-toolbar hostly-panel"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: 10,
        border: "1px solid rgba(59, 130, 246, 0.22)",
        top: 52,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800 }}>{selectedCount} seleccionados</span>
      <button type="button" style={compactButton} onClick={onActivate}>
        Activar
      </button>
      <button type="button" style={compactButton} onClick={onDeactivate}>
        Desactivar
      </button>
      <select
        value={bulkProductId}
        onChange={(event) => onBulkProductChange(event.target.value)}
        style={{ ...touchInputStyle, width: 180, minHeight: 34, padding: "6px 8px" }}
      >
        <option value="">Producto Hostly…</option>
        {products.map((product) => (
          <option key={product.id} value={product.id}>
            {product.name}
          </option>
        ))}
      </select>
      <button type="button" style={compactButton} disabled={!bulkProductId} onClick={onApplyProduct}>
        Cambiar producto
      </button>
      <button type="button" style={compactButton} onClick={onResetUsage}>
        Reset contador
      </button>
      <button type="button" style={compactButton} onClick={onDelete}>
        Eliminar
      </button>
      <button type="button" style={compactButton} onClick={onClearSelection}>
        Limpiar
      </button>
    </div>
  );
}

export function AliasesTable({
  rows,
  selectedIds,
  activeRowId,
  flashingRowIds,
  onToggleSelected,
  onToggleAll,
  onOpenRow,
  onToggleActive,
  onDeleteRow,
  onResetUsageRow,
}: {
  rows: SupplierProductAliasDocument[];
  selectedIds: ReadonlySet<string>;
  activeRowId: string | null;
  flashingRowIds: ReadonlySet<string>;
  onToggleSelected: (id: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
  onOpenRow: (alias: SupplierProductAliasDocument) => void;
  onToggleActive: (alias: SupplierProductAliasDocument) => void;
  onDeleteRow: (alias: SupplierProductAliasDocument) => void;
  onResetUsageRow: (alias: SupplierProductAliasDocument) => void;
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  return (
    <div
      style={{
        overflow: "auto",
        borderRadius: 10,
        border: "1px solid rgba(148, 163, 184, 0.16)",
        maxHeight: "min(68vh, 720px)",
      }}
    >
      <table className="hostly-inv-native-table" style={{ minWidth: 980 }}>
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => onToggleAll(event.target.checked)}
                aria-label="Seleccionar todos"
              />
            </th>
            <th>Alias OCR</th>
            <th>Producto Hostly</th>
            <th>Proveedor</th>
            <th className="hostly-inv-th-num">Uso</th>
            <th>Último uso</th>
            <th>Estado</th>
            <th>Tipo match</th>
            <th style={{ width: 180 }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((alias) => {
            const status = getAliasOperationalStatus(alias);
            const manual = alias.matchSource === "manual";
            const rowClass = [
              "hostly-alias-table-row",
              flashingRowIds.has(alias.id) ? "hostly-alias-row-flash" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <tr
                key={alias.id}
                data-alias-id={alias.id}
                data-active={activeRowId === alias.id ? "true" : undefined}
                className={rowClass || undefined}
                onClick={() => onOpenRow(alias)}
                style={{ cursor: "pointer" }}
              >
                <td onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(alias.id)}
                    onChange={(event) => onToggleSelected(alias.id, event.target.checked)}
                    aria-label="Seleccionar alias"
                  />
                </td>
                <td style={{ fontWeight: 600, maxWidth: 200 }}>{alias.rawText}</td>
                <td style={{ maxWidth: 180 }}>{alias.inventoryProductName}</td>
                <td className="hostly-inv-td-muted">{alias.supplierName?.trim() || "—"}</td>
                <td className="hostly-inv-td-amount">{alias.usageCount}</td>
                <td className="hostly-inv-td-muted">
                  {formatAliasRelative(alias.lastUsedAt ?? alias.updatedAt)}
                </td>
                <td>
                  <span style={statusPill(status)}>{status === "active" ? "Activo" : "Desactivado"}</span>
                </td>
                <td>
                  <span style={matchTypePill(manual)}>{getAliasMatchTypeLabel(alias)}</span>
                </td>
                <td onClick={(event) => event.stopPropagation()}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    <button type="button" style={compactButton} onClick={() => onOpenRow(alias)}>
                      Editar
                    </button>
                    <button type="button" style={compactButton} onClick={() => onToggleActive(alias)}>
                      {status === "active" ? "Desactivar" : "Activar"}
                    </button>
                    <button type="button" style={compactButton} onClick={() => onResetUsageRow(alias)}>
                      Reset
                    </button>
                    <button type="button" style={compactButton} onClick={() => onDeleteRow(alias)}>
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AliasDetailPanel({
  alias,
  similarMatches,
  products,
  draftProductId,
  showSaveFlash,
  onDraftProductChange,
  onSaveProduct,
  onToggleActive,
  onResetUsage,
  onDelete,
  onClose,
}: {
  alias: SupplierProductAliasDocument;
  similarMatches: SimilarAliasMatch[];
  products: ProductDocument[];
  draftProductId: string;
  showSaveFlash: boolean;
  onDraftProductChange: (productId: string) => void;
  onSaveProduct: () => void;
  onToggleActive: () => void;
  onResetUsage: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const status = getAliasOperationalStatus(alias);
  const productChanged = draftProductId !== alias.inventoryProductId;

  const detailRows = useMemo(
    () =>
      [
        ["rawText", "Texto OCR", alias.rawText],
        ["normalizedText", "Normalizado", alias.normalizedText],
        ["supplierName", "Proveedor", alias.supplierName?.trim() || "—"],
        ["usageCount", "Uso", String(alias.usageCount)],
        ["createdAt", "Creado", formatAliasDateTime(alias.createdAt)],
        ["updatedAt", "Actualizado", formatAliasDateTime(alias.updatedAt)],
        ["lastUsedAt", "Último uso", formatAliasDateTime(alias.lastUsedAt ?? alias.updatedAt)],
        ["learnedFromInvoiceId", "Factura origen", alias.learnedFromInvoiceId?.trim() || "—"],
      ] as const,
    [alias],
  );

  return (
    <aside
      className={["hostly-alias-side-panel", "hostly-panel", showSaveFlash ? "hostly-alias-panel-save-flash" : ""]
        .filter(Boolean)
        .join(" ")}
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, minWidth: 300 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Detalle alias</div>
        <button type="button" style={compactButton} onClick={onClose}>
          Cerrar
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <span style={statusPill(status)}>{status === "active" ? "Activo" : "Desactivado"}</span>
        <span style={matchTypePill(alias.matchSource === "manual")}>{getAliasMatchTypeLabel(alias)}</span>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {detailRows.map(([key, label, value]) => (
          <div key={key} style={{ fontSize: 12 }}>
            <div style={{ color: "var(--hostly-ink-muted)", fontWeight: 700 }}>{label}</div>
            <div style={{ color: "var(--hostly-ink-strong)", wordBreak: "break-word" }}>{value}</div>
          </div>
        ))}
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
        <span style={{ fontWeight: 700 }}>Producto Hostly enlazado</span>
        <select
          value={draftProductId}
          onChange={(event) => onDraftProductChange(event.target.value)}
          style={touchInputStyle}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </label>

      {productChanged ? (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(245, 158, 11, 0.35)",
            background: "rgba(245, 158, 11, 0.08)",
            fontSize: 12,
            color: "#b45309",
          }}
        >
          Cambiar este alias afectará futuros matches automáticos.
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <button
          type="button"
          style={{ ...compactButton, opacity: productChanged ? 1 : 0.5 }}
          disabled={!productChanged}
          onClick={onSaveProduct}
        >
          Guardar producto
        </button>
        <button type="button" style={compactButton} onClick={onToggleActive}>
          {status === "active" ? "Desactivar" : "Activar"}
        </button>
        <button type="button" style={compactButton} onClick={onResetUsage}>
          Reset uso
        </button>
        <button type="button" style={compactButton} onClick={onDelete}>
          Eliminar
        </button>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Coincidencias similares</div>
        {similarMatches.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--hostly-ink-muted)" }}>Sin similares activos detectados.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {similarMatches.map(({ alias: match, confidence }) => (
              <div
                key={match.id}
                style={{
                  fontSize: 11,
                  padding: "6px 8px",
                  borderRadius: 8,
                  border: "1px solid rgba(148, 163, 184, 0.16)",
                  background: "rgba(148, 163, 184, 0.04)",
                }}
              >
                <div style={{ fontWeight: 700, color: "var(--hostly-ink-strong)" }}>{match.rawText}</div>
                <div style={{ color: "var(--hostly-ink-muted)" }}>
                  → {match.inventoryProductName} · similitud {Math.round(confidence * 100)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export function AliasConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  isBusy,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy?: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(2, 6, 23, 0.62)",
        backdropFilter: "blur(6px)",
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isBusy) onCancel();
      }}
    >
      <div className="hostly-panel" style={{ width: "min(460px, 100%)", padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--hostly-ink-muted)", lineHeight: 1.45 }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" style={compactButton} onClick={onCancel} disabled={isBusy}>
            Cancelar
          </button>
          <button
            type="button"
            style={{ ...compactButton, background: "var(--hostly-ink-strong)", color: "#fff" }}
            onClick={onConfirm}
            disabled={isBusy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function handleAliasTableRowKeyDown(
  event: KeyboardEvent,
  rowId: string,
  selectedIds: ReadonlySet<string>,
  onToggleSelected: (id: string, selected: boolean) => void,
): void {
  if (event.key !== " " || event.defaultPrevented) return;
  const target = event.target as HTMLElement;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
    return;
  }
  event.preventDefault();
  onToggleSelected(rowId, !selectedIds.has(rowId));
}
