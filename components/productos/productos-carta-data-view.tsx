"use client";

import type { RefObject } from "react";
import { useMemo } from "react";
import {
  HostlyDataCell,
  HostlyDataGroupBar,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
  HostlyMobileList,
  HostlyMobileListGroup,
  HostlyMobileListItem,
  HostlyStatusBadge,
} from "@/components/ui/hostly/data-table";
import {
  HostlyFilterCard,
  type HostlyFilterCardTone,
} from "@/components/ui/hostly";
import type { Locale, TranslateFn } from "@/lib/i18n";
import type { CartaCategoria, CartaFamilia } from "@/lib/carta-categorias/types";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";
import type { EscandalloMetaMap } from "@/lib/platos-escandallo-bridge";
import { resolvePlatoTieneEscandallo } from "@/lib/carta/operational-catalog-mappers";
import type { ProductDocument } from "@/lib/firestore/products";
import type {
  ProductResolverParitySummary,
  ResolverParityFilterId,
} from "@/lib/productos/product-operational-routing-audit";
import type { PlatoCarta, TipoProductoVenta } from "@/lib/platos-local";
import {
  getPublicationFlags,
  ProductosCartaNameThumb,
  ProductosCartaOperMicrochip,
  ProductosCartaRoutingAuditCell,
  ProductosCartaReorderControls,
  ProductosCartaRowActions,
  PRODUCTOS_CARTA_LEGACY_BLOCKED,
  type OpenProductEditFn,
  formatProductosCartaSectionCellDisplay,
  productOperationalFieldsFromPlato,
} from "./productos-table-cells";
import { ProductosSelectionBar } from "./productos-selection-bar";
import {
  ProductosCartaDragHandle,
  ProductosCartaSortableDesktopRow,
  ProductosCartaSortableDragHandle,
  ProductosCartaSortableFocusItem,
  ProductosCartaSortableMobileItem,
  ProductosCartaSortableRoot,
} from "./productos-carta-sortable";
import {
  ProductosInlineActiveToggle,
  ProductosInlineEditableName,
  ProductosInlineEditablePrice,
  ProductosTableInlineEditProvider,
  type ProductosTableInlineEditConfig,
} from "./productos-table-inline-edit";
import { useProductTableInlinePersist } from "./use-product-table-inline-persist";

const TIPO_VENTA_I18N: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

function labelTipoVenta(t: (key: string) => string, tipo: TipoProductoVenta): string {
  return t(TIPO_VENTA_I18N[tipo]);
}

function formatEuro(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function tieneEscandalloForPlato(
  p: PlatoCarta,
  meta: EscandalloMetaMap,
  centralDoc?: Pick<ProductDocument, "recipe"> | null,
): boolean {
  return resolvePlatoTieneEscandallo(p, meta, centralDoc);
}

/** Microchip Carta: visibilidad en carta (sin mezclar activo/inactivo en el copy corto). */
function compactCartaBadgeCopy(
  p: PlatoCarta,
  t: TranslateFn,
): { short: string; full: string; tone: "success" | "warning" | "muted" } {
  const { status } = getPublicationFlags(p);
  const fullOn = t("productos.pubEnCarta");
  const fullOff = t("productos.pubFueraCarta");
  if (status === "onMenu") {
    return { short: fullOn, full: fullOn, tone: "success" };
  }
  if (status === "offMenu") {
    return { short: t("productos.pubFueraCartaShort"), full: fullOff, tone: "warning" };
  }
  return { short: t("productos.pubFueraCartaShort"), full: fullOff, tone: "muted" };
}

function compactEscBadgeCopy(
  tiene: boolean,
  t: TranslateFn,
): { short: string; full: string; tone: "success" | "muted" } {
  const full = tiene ? t("productos.escCon") : t("productos.escSin");
  const short = tiene ? t("productos.escShortYes") : t("productos.escShortNo");
  return { short, full, tone: tiene ? "success" : "muted" };
}

function ProductosCartaTableCartaBadge({
  p,
  t,
}: {
  p: PlatoCarta;
  t: TranslateFn;
}) {
  const { short, full, tone } = compactCartaBadgeCopy(p, t);
  return (
    <HostlyStatusBadge
      tone={tone}
      title={full}
      aria-label={full}
      dot
      className="hostly-data-table-microchip hostly-data-table-microchip--carta hostly-productos-carta-table-chip"
    >
      {short}
    </HostlyStatusBadge>
  );
}

function ProductosCartaTableEscBadge({
  tiene,
  t,
}: {
  tiene: boolean;
  t: TranslateFn;
}) {
  const { short, full, tone } = compactEscBadgeCopy(tiene, t);
  return (
    <HostlyStatusBadge
      tone={tone}
      title={full}
      aria-label={full}
      dot={false}
      className="hostly-data-table-microchip hostly-data-table-microchip--esc hostly-productos-carta-table-chip"
    >
      {short}
    </HostlyStatusBadge>
  );
}

export type ProductosCartaGroup = {
  categoria: string;
  sectionKey: string;
  items: PlatoCarta[];
};

export type ProductosCartaDataViewProps = {
  displayed: PlatoCarta[];
  groupedByCategoria: ProductosCartaGroup[];
  viewMode: "grouped" | "list";
  selectedIds: Set<string>;
  selectAllRef: RefObject<HTMLInputElement | null>;
  isLegacyReadOnly: boolean;
  meta: EscandalloMetaMap;
  /** Snapshot central; fuente de `recipe.enabled` para la columna ESC. */
  centralDocsById?: ReadonlyMap<string, ProductDocument>;
  escNavId: string | null;
  locale: Locale;
  t: TranslateFn;
  toggleRowSelected: (id: string) => void;
  toggleSelectAllDisplayed: () => void;
  openEdit: OpenProductEditFn;
  toggleActivo: (p: PlatoCarta) => void;
  activateProducto: (p: PlatoCarta) => void;
  goToEscandallo: (p: PlatoCarta) => void;
  deleteProducto: (p: PlatoCarta) => void;
  clearSelection: () => void;
  onAssignPass?: () => void;
  assignPassDisabled?: boolean;
  assignPassDisabledTitle?: string;
  onAssignDestination?: () => void;
  assignDestinationDisabled?: boolean;
  assignDestinationDisabledTitle?: string;
  onAssignCategory?: () => void;
  assignCategoryDisabled?: boolean;
  assignCategoryDisabledTitle?: string;
  onAssignFamily?: () => void;
  assignFamilyDisabled?: boolean;
  assignFamilyDisabledTitle?: string;
  onBulkDelete?: () => void;
  bulkDeleteDisabled?: boolean;
  bulkDeleteDisabledTitle?: string;
  compactBulkBar?: boolean;
  reorderMode?: boolean;
  reorderBusyId?: string | null;
  onMoveProductUp?: (productId: string) => void;
  onMoveProductDown?: (productId: string) => void;
  onReorderProducts?: (orderedIds: string[]) => void;
  /** Lista mínima (handle + nombre + precio) para modo ordenar enfocado. */
  reorderFocusLayout?: boolean;
  /** Etiqueta de categoría activa (concreta); vacío en vista general o sin categorizar. */
  activeCategoryLabel?: string;
  /** Estaciones operativas del tenant (auditoría de coherencia routing). */
  operationStations?: readonly OperationStationDocument[];
  /** Estaciones de producción (paridad resolver; fetch único, sin listener). */
  productionStations?: readonly ProductionStationDocument[];
  /** Categorías de carta (resolver familia menú por categoría). */
  cartaCategorias?: readonly CartaCategoria[];
  /** Familias de menú (`cartaFamilias`; estación producción heredada). */
  cartaFamilias?: readonly CartaFamilia[];
  /** Edición inline nombre / precio / activo (Productos V2 · Fase 4). */
  inlineEdit?: ProductosTableInlineEditConfig;
};

function ResolverParitySummaryPill({
  label,
  value,
  tone = "neutral",
  filterId,
  activeFilter,
  onFilterChange,
}: {
  label: string;
  value: number;
  tone?: HostlyFilterCardTone;
  filterId: ResolverParityFilterId;
  activeFilter: ResolverParityFilterId;
  onFilterChange: (filter: ResolverParityFilterId) => void;
}) {
  const isActive = activeFilter === filterId;
  return (
    <HostlyFilterCard
      label={label}
      value={value}
      tone={tone}
      active={isActive}
      onClick={() => onFilterChange(filterId)}
    />
  );
}

function resolverParityFilterStatusKey(
  filter: ResolverParityFilterId,
): string | null {
  switch (filter) {
    case "all":
      return null;
    case "ok":
      return "productos.resolverParityFilterStatusOk";
    case "divergences":
      return "productos.resolverParityFilterStatusDivergences";
    case "missingStation":
      return "productos.resolverParityFilterStatusMissingStation";
    case "heuristic":
      return "productos.resolverParityFilterStatusHeuristic";
    case "missingOperationStation":
      return "productos.resolverParityFilterStatusNoOpStation";
    default:
      return null;
  }
}

/** Resumen compacto de paridad legacy vs resolver (solo lectura, Config → Carta → Productos). */
export function ProductosResolverParitySummaryStrip({
  summary,
  loading,
  activeFilter,
  onFilterChange,
  filteredCount,
  t,
}: {
  summary: ProductResolverParitySummary;
  loading?: boolean;
  activeFilter: ResolverParityFilterId;
  onFilterChange: (filter: ResolverParityFilterId) => void;
  filteredCount: number;
  t: TranslateFn;
}) {
  if (loading) {
    return (
      <div className="hostly-filter-card-panel" role="status">
        <span className="hostly-filter-card-panel__loading">
          {t("productos.resolverParitySummaryLoading")}
        </span>
      </div>
    );
  }

  const missingStation = summary.byIssue.FALTA_STATION;
  const heuristic = summary.byIssue.FALLBACK_HEURISTICO;
  const noOpStation = summary.byIssue.SIN_OPERATION_STATION;
  const statusKey = resolverParityFilterStatusKey(activeFilter);

  return (
    <div
      className="hostly-filter-card-panel hostly-filter-card-grid hostly-filter-card-grid--metrics"
      role="region"
      aria-label={t("productos.resolverParitySummaryAria")}
    >
      <span className="hostly-filter-card-panel__title">
        {t("productos.resolverParitySummaryTitle")}
      </span>
      <ResolverParitySummaryPill
        label={t("productos.resolverParitySummaryTotal")}
        value={summary.total}
        filterId="all"
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      <ResolverParitySummaryPill
        label={t("productos.resolverParitySummaryOk")}
        value={summary.ok}
        tone="success"
        filterId="ok"
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      <ResolverParitySummaryPill
        label={t("productos.resolverParitySummaryDivergence")}
        value={summary.withDivergence}
        tone={summary.withDivergence > 0 ? "danger" : "neutral"}
        filterId="divergences"
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      <ResolverParitySummaryPill
        label={t("productos.resolverParitySummaryMissingStation")}
        value={missingStation}
        tone={missingStation > 0 ? "warning" : "neutral"}
        filterId="missingStation"
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      <ResolverParitySummaryPill
        label={t("productos.resolverParitySummaryHeuristic")}
        value={heuristic}
        tone={heuristic > 0 ? "warning" : "neutral"}
        filterId="heuristic"
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      <ResolverParitySummaryPill
        label={t("productos.resolverParitySummaryNoOpStation")}
        value={noOpStation}
        tone={noOpStation > 0 ? "warning" : "neutral"}
        filterId="missingOperationStation"
        activeFilter={activeFilter}
        onFilterChange={onFilterChange}
      />
      {statusKey ? (
        <span className="hostly-filter-card-panel__status" role="status">
          {t(statusKey, { count: filteredCount })}
        </span>
      ) : null}
    </div>
  );
}

function SelectionCheckbox({
  checked,
  disabled,
  onChange,
  ariaLabel,
  inputRef,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: () => void;
  ariaLabel: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="hostly-data-table-select">
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={ariaLabel}
        className="hostly-data-table-select__input"
      />
    </label>
  );
}

function ProductPrimaryCell({
  p,
  showDragHandle,
  t,
  operationStations,
  productionStations,
  cartaCategorias,
  cartaFamilias,
  onCorrect,
  correctDisabled,
  correctDisabledTitle,
  inlineEditEnabled,
  onInlineSaveName,
  onInlineEditError,
}: {
  p: PlatoCarta;
  showDragHandle?: boolean;
  t: TranslateFn;
  operationStations?: readonly OperationStationDocument[];
  productionStations?: readonly ProductionStationDocument[];
  cartaCategorias?: readonly CartaCategoria[];
  cartaFamilias?: readonly CartaFamilia[];
  onCorrect?: OpenProductEditFn;
  correctDisabled?: boolean;
  correctDisabledTitle?: string;
  inlineEditEnabled?: boolean;
  onInlineSaveName?: (raw: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onInlineEditError?: (message: string) => void;
}) {
  const ops = productOperationalFieldsFromPlato(p);
  const nameClassName = "hostly-data-table-primary__name";
  return (
    <div className="hostly-data-table-primary hostly-data-table-primary--with-thumb hostly-productos-carta-name-cell">
      {showDragHandle ? <ProductosCartaSortableDragHandle /> : null}
      <ProductosCartaNameThumb p={p} />
      <div className="hostly-data-table-primary__stack">
        {inlineEditEnabled && onInlineSaveName ? (
          <ProductosInlineEditableName
            p={p}
            disabled={correctDisabled}
            className={nameClassName}
            title={p.nombre}
            onSave={onInlineSaveName}
            onError={onInlineEditError}
          />
        ) : (
          <span className={nameClassName} title={p.nombre}>
            {p.nombre}
          </span>
        )}
        {p.origenAlta === "importacion_ia" ? (
          <HostlyStatusBadge
            tone="neutral"
            dot={false}
            className="hostly-data-table-primary__tag hostly-productos-carta-table-chip"
          >
            IA
          </HostlyStatusBadge>
        ) : null}
        <span
          className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only hostly-productos-carta-tablet-meta"
          title={ops.tabletMeta}
        >
          <span className="hostly-productos-carta-tablet-meta__text">{ops.tabletMeta}</span>
          <ProductosCartaRoutingAuditCell
            p={p}
            t={t}
            operationStations={operationStations}
            productionStations={productionStations}
            cartaCategorias={cartaCategorias}
            cartaFamilias={cartaFamilias}
            showRecommendationHint
            onCorrect={onCorrect}
            correctDisabled={correctDisabled}
            correctDisabledTitle={correctDisabledTitle}
            className="hostly-productos-carta-tablet-meta__routing"
          />
        </span>
      </div>
    </div>
  );
}

/** Cabecera y filas comparten este orden de columnas y clases `col`. */
function renderProductosCartaHeaderCells(args: {
  allSelected: boolean;
  displayedCount: number;
  isLegacyReadOnly: boolean;
  selectAllRef: RefObject<HTMLInputElement | null>;
  t: TranslateFn;
  toggleSelectAllDisplayed: () => void;
  reorderMode?: boolean;
  inlineEditEnabled?: boolean;
}) {
  const { allSelected, displayedCount, isLegacyReadOnly, selectAllRef, t, toggleSelectAllDisplayed, reorderMode, inlineEditEnabled } = args;
  return (
    <>
      {reorderMode ? null : (
        <HostlyDataCell align="center" col="select">
          <SelectionCheckbox
            checked={allSelected}
            disabled={displayedCount === 0 || isLegacyReadOnly}
            onChange={toggleSelectAllDisplayed}
            ariaLabel={t("productos.selectAllVisible")}
            inputRef={selectAllRef}
          />
        </HostlyDataCell>
      )}
      <HostlyDataCell col="product">{t("carta.colNombre")}</HostlyDataCell>
      <HostlyDataCell col="tipo">
        <span title={t("carta.colTipoTitle")}>{t("carta.colTipo")}</span>
      </HostlyDataCell>
      <HostlyDataCell col="categoria">
        <span title={t("carta.colCategoriaTitle")}>{t("carta.colCategoria")}</span>
      </HostlyDataCell>
      <HostlyDataCell col="familia">
        <span title={t("productos.colFamiliaTitle")}>{t("productos.colFamilia")}</span>
      </HostlyDataCell>
      <HostlyDataCell align="center" col="pase">
        <span title={t("productos.colPaseTitle")}>{t("productos.colPase")}</span>
      </HostlyDataCell>
      <HostlyDataCell align="center" col="destino">
        <span title={t("productos.colDestinoTitle")}>{t("productos.colDestino")}</span>
      </HostlyDataCell>
      <HostlyDataCell align="center" col="routing">
        <span title={t("productos.colRoutingAuditTitle")}>{t("productos.colRoutingAudit")}</span>
      </HostlyDataCell>
      <HostlyDataCell align="end" col="price">
        {t("carta.colPrecio")}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="carta">
        {inlineEditEnabled ? t("carta.fieldActivo") : t("productos.colCarta")}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="esc">
        <span title={t("productos.colEscandallo")} aria-label={t("productos.colEscandallo")}>
          S.C.
        </span>
      </HostlyDataCell>
      <HostlyDataCell align="end" col="actions">
        {reorderMode ? t("productos.colOrder") : t("carta.colActions")}
      </HostlyDataCell>
    </>
  );
}

function renderProductRowCells(args: {
  p: PlatoCarta;
  meta: EscandalloMetaMap;
  centralDocsById?: ReadonlyMap<string, ProductDocument>;
  escNavId: string | null;
  t: TranslateFn;
  locale: Locale;
  selected: boolean;
  isLegacyReadOnly: boolean;
  toggleRowSelected: (id: string) => void;
  openEdit: OpenProductEditFn;
  toggleActivo: (p: PlatoCarta) => void;
  activateProducto: (p: PlatoCarta) => void;
  goToEscandallo: (p: PlatoCarta) => void;
  deleteProducto: (p: PlatoCarta) => void;
  reorderMode?: boolean;
  reorderBusyId?: string | null;
  rowIndex?: number;
  rowCount?: number;
  onMoveProductUp?: (productId: string) => void;
  onMoveProductDown?: (productId: string) => void;
  showDragHandle?: boolean;
  activeCategoryLabel?: string;
  operationStations?: readonly OperationStationDocument[];
  productionStations?: readonly ProductionStationDocument[];
  cartaCategorias?: readonly CartaCategoria[];
  cartaFamilias?: readonly CartaFamilia[];
  inlineEditEnabled?: boolean;
  onInlineSaveName?: (p: PlatoCarta, raw: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onInlineSavePrice?: (p: PlatoCarta, raw: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onInlineToggleActive?: (p: PlatoCarta) => Promise<{ ok: true } | { ok: false; error: string }>;
  onInlineEditError?: (message: string) => void;
}) {
  const {
    p,
    meta,
    centralDocsById,
    escNavId,
    t,
    locale,
    selected,
    isLegacyReadOnly,
    toggleRowSelected,
    openEdit,
    toggleActivo,
    activateProducto,
    goToEscandallo,
    deleteProducto,
    reorderMode,
    reorderBusyId,
    rowIndex = 0,
    rowCount = 1,
    onMoveProductUp,
    onMoveProductDown,
    showDragHandle,
    activeCategoryLabel,
    operationStations,
    productionStations,
    cartaCategorias,
    cartaFamilias,
    inlineEditEnabled,
    onInlineSaveName,
    onInlineSavePrice,
    onInlineToggleActive,
    onInlineEditError,
  } = args;
  const tiene = tieneEscandalloForPlato(
    p,
    meta,
    centralDocsById?.get(p.id),
  );
  const busyEsc = escNavId === p.id;
  const ops = productOperationalFieldsFromPlato(p);
  const sectionCell = formatProductosCartaSectionCellDisplay(
    p.categoria,
    activeCategoryLabel,
    t("cartaCategories.filterUncat"),
  );

  return (
    <>
      {reorderMode ? null : (
        <HostlyDataCell align="center" col="select">
          <SelectionCheckbox
            checked={selected}
            disabled={isLegacyReadOnly}
            onChange={() => toggleRowSelected(p.id)}
            ariaLabel={t("productos.selectRowAria", { name: p.nombre })}
          />
        </HostlyDataCell>
      )}
      <HostlyDataCell col="product">
        <ProductPrimaryCell
          p={p}
          showDragHandle={showDragHandle}
          t={t}
          operationStations={operationStations}
          productionStations={productionStations}
          cartaCategorias={cartaCategorias}
          cartaFamilias={cartaFamilias}
          onCorrect={openEdit}
          correctDisabled={isLegacyReadOnly}
          correctDisabledTitle={isLegacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : undefined}
          inlineEditEnabled={inlineEditEnabled}
          onInlineSaveName={
            onInlineSaveName ? (raw) => onInlineSaveName(p, raw) : undefined
          }
          onInlineEditError={onInlineEditError}
        />
      </HostlyDataCell>
      <HostlyDataCell col="tipo">
        <HostlyStatusBadge
          tone="neutral"
          dot={false}
          title={labelTipoVenta(t, p.tipoVenta)}
          aria-label={labelTipoVenta(t, p.tipoVenta)}
          className="hostly-data-table-tipo-pill hostly-productos-carta-table-chip"
        >
          {labelTipoVenta(t, p.tipoVenta)}
        </HostlyStatusBadge>
      </HostlyDataCell>
      <HostlyDataCell col="categoria">
        <span
          className={[
            "hostly-data-table-secondary",
            sectionCell.isRedundant ? "hostly-data-table-secondary--muted" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={sectionCell.title}
          aria-label={sectionCell.isRedundant ? sectionCell.title : undefined}
        >
          {sectionCell.display}
        </span>
      </HostlyDataCell>
      <HostlyDataCell col="familia">
        <span className="hostly-data-table-secondary" title={ops.familyFull}>
          {ops.familyShort}
        </span>
      </HostlyDataCell>
      <HostlyDataCell align="center" col="pase">
        <ProductosCartaOperMicrochip
          label={ops.courseShort}
          title={ops.courseFull}
          className="hostly-data-table-microchip--pase"
        />
      </HostlyDataCell>
      <HostlyDataCell align="center" col="destino">
        <ProductosCartaOperMicrochip
          label={ops.destinationShort}
          title={ops.destinationFull}
          className="hostly-data-table-microchip--dest"
        />
      </HostlyDataCell>
      <HostlyDataCell align="center" col="routing">
        <ProductosCartaRoutingAuditCell
          p={p}
          t={t}
          operationStations={operationStations}
          productionStations={productionStations}
          cartaCategorias={cartaCategorias}
          cartaFamilias={cartaFamilias}
          onCorrect={openEdit}
          correctDisabled={isLegacyReadOnly}
          correctDisabledTitle={isLegacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : undefined}
        />
      </HostlyDataCell>
      <HostlyDataCell align="end" col="price">
        {inlineEditEnabled && onInlineSavePrice ? (
          <ProductosInlineEditablePrice
            p={p}
            disabled={isLegacyReadOnly}
            displayValue={formatEuro(p.precioVenta, locale)}
            onSave={(raw) => onInlineSavePrice(p, raw)}
            onError={onInlineEditError}
          />
        ) : (
          <span className="hostly-data-table-price">{formatEuro(p.precioVenta, locale)}</span>
        )}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="carta" className="hostly-productos-carta-active-cell">
        {inlineEditEnabled && onInlineToggleActive ? (
          <span className="hostly-productos-inline-active-cell">
            <ProductosInlineActiveToggle
              p={p}
              disabled={isLegacyReadOnly}
              t={t}
              onToggle={() => onInlineToggleActive(p)}
              onError={onInlineEditError}
            />
          </span>
        ) : (
          <ProductosCartaTableCartaBadge p={p} t={t} />
        )}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="esc">
        <ProductosCartaTableEscBadge tiene={tiene} t={t} />
      </HostlyDataCell>
      <HostlyDataCell align="end" col="actions">
        <div className="hostly-data-table-actions-shell">
          {reorderMode ? (
            <div className="hostly-productos-carta-order-actions">
              <ProductosCartaReorderControls
                canMoveUp={rowIndex > 0}
                canMoveDown={rowIndex < rowCount - 1}
                busy={reorderBusyId === p.id}
                t={t}
                onMoveUp={() => onMoveProductUp?.(p.id)}
                onMoveDown={() => onMoveProductDown?.(p.id)}
              />
            </div>
          ) : (
            <ProductosCartaRowActions
              p={p}
              busyEsc={busyEsc}
              t={t}
              legacyReadOnly={isLegacyReadOnly}
              onEdit={() => openEdit(p)}
              onToggleCarta={() => toggleActivo(p)}
              onActivateProduct={() => activateProducto(p)}
              onEsc={() => void goToEscandallo(p)}
              onDelete={() => deleteProducto(p)}
            />
          )}
        </div>
      </HostlyDataCell>
    </>
  );
}

function MobileProductItem(
  props: ProductosCartaDataViewProps & {
    p: PlatoCarta;
    rowIndex?: number;
    rowCount?: number;
    showDragHandle?: boolean;
  },
) {
  const {
    p,
    meta,
    centralDocsById,
    escNavId,
    t,
    locale,
    selectedIds,
    isLegacyReadOnly,
    toggleRowSelected,
    reorderMode,
    reorderBusyId,
    rowIndex = 0,
    rowCount = 1,
    onMoveProductUp,
    onMoveProductDown,
    showDragHandle = false,
  } = props;
  const tiene = tieneEscandalloForPlato(
    p,
    meta,
    centralDocsById?.get(p.id),
  );
  const busyEsc = escNavId === p.id;
  const selected = selectedIds.has(p.id);
  const ops = productOperationalFieldsFromPlato(p);

  return (
    <HostlyMobileListItem
      selected={reorderMode ? false : selected}
      leading={
        showDragHandle ? (
          <ProductosCartaSortableDragHandle />
        ) : reorderMode ? null : (
          <SelectionCheckbox
            checked={selected}
            disabled={isLegacyReadOnly}
            onChange={() => toggleRowSelected(p.id)}
            ariaLabel={t("productos.selectRowAria", { name: p.nombre })}
          />
        )
      }
      title={
        <span className="hostly-mobile-list-item__name" title={p.nombre}>
          {p.nombre}
          {p.origenAlta === "importacion_ia" ? (
            <HostlyStatusBadge tone="neutral" dot={false} className="hostly-mobile-list-item__tag">
              IA
            </HostlyStatusBadge>
          ) : null}
        </span>
      }
      meta={
        <>
          <span>{labelTipoVenta(t, p.tipoVenta)}</span>
          <span className="hostly-mobile-list-item__dot" aria-hidden>
            ·
          </span>
          <span title={ops.tabletMeta}>{ops.tabletMeta}</span>
          <span className="hostly-mobile-list-item__dot" aria-hidden>
            ·
          </span>
          <ProductosCartaRoutingAuditCell
            p={p}
            t={t}
            operationStations={props.operationStations}
            productionStations={props.productionStations}
            cartaCategorias={props.cartaCategorias}
            cartaFamilias={props.cartaFamilias}
            showRecommendationHint
            onCorrect={props.openEdit}
            correctDisabled={props.isLegacyReadOnly}
            correctDisabledTitle={
              props.isLegacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : undefined
            }
            className="hostly-mobile-list-item__routing-audit"
          />
        </>
      }
      aside={
        <>
          <span className="hostly-mobile-list-item__price">{formatEuro(p.precioVenta, locale)}</span>
          <div className="hostly-mobile-list-item__badges">
            <ProductosCartaTableCartaBadge p={p} t={t} />
            <ProductosCartaTableEscBadge tiene={tiene} t={t} />
          </div>
        </>
      }
      actions={
        reorderMode ? (
          <div className="hostly-productos-carta-order-actions">
            <ProductosCartaReorderControls
              canMoveUp={rowIndex > 0}
              canMoveDown={rowIndex < rowCount - 1}
              busy={reorderBusyId === p.id}
              t={t}
              onMoveUp={() => onMoveProductUp?.(p.id)}
              onMoveDown={() => onMoveProductDown?.(p.id)}
            />
          </div>
        ) : (
          <ProductosCartaRowActions
            p={p}
            busyEsc={busyEsc}
            t={t}
            legacyReadOnly={isLegacyReadOnly}
            onEdit={() => props.openEdit(p)}
            onToggleCarta={() => props.toggleActivo(p)}
            onActivateProduct={() => props.activateProducto(p)}
            onEsc={() => void props.goToEscandallo(p)}
            onDelete={() => props.deleteProducto(p)}
          />
        )
      }
    />
  );
}

export function ProductosCartaDataView(props: ProductosCartaDataViewProps) {
  const {
    displayed,
    groupedByCategoria,
    viewMode,
    selectedIds,
    selectAllRef,
    isLegacyReadOnly,
    t,
    toggleSelectAllDisplayed,
    clearSelection,
    onAssignPass,
    assignPassDisabled,
    assignPassDisabledTitle,
    onAssignDestination,
    assignDestinationDisabled,
    assignDestinationDisabledTitle,
    onAssignCategory,
    assignCategoryDisabled,
    assignCategoryDisabledTitle,
    onAssignFamily,
    assignFamilyDisabled,
    assignFamilyDisabledTitle,
    onBulkDelete,
    bulkDeleteDisabled,
    bulkDeleteDisabledTitle,
    compactBulkBar = false,
    reorderMode = false,
    reorderBusyId = null,
    onReorderProducts,
    reorderFocusLayout = false,
    inlineEdit,
  } = props;

  const inlineEditEnabled = Boolean(
    inlineEdit?.enabled && !reorderMode && !isLegacyReadOnly,
  );

  const inlinePersist = useProductTableInlinePersist({
    restaurantId: inlineEdit?.restaurantId ?? "",
    isCentralCatalog: inlineEdit?.isCentralCatalog ?? false,
    messages: inlineEdit?.messages ?? { errorNombre: "", errorPrecio: "" },
  });

  const inlineRowProps = inlineEditEnabled
    ? {
        inlineEditEnabled: true as const,
        onInlineSaveName: inlinePersist.saveName,
        onInlineSavePrice: inlinePersist.savePrice,
        onInlineToggleActive: inlinePersist.toggleActive,
        onInlineEditError: inlineEdit?.onError,
      }
    : {
        inlineEditEnabled: false as const,
      };

  const inlineTabProductIds = useMemo(() => {
    if (!inlineEditEnabled) return [];
    if (viewMode === "grouped") {
      return groupedByCategoria.flatMap((group) => group.items.map((item) => item.id));
    }
    return displayed.map((item) => item.id);
  }, [inlineEditEnabled, viewMode, groupedByCategoria, displayed]);

  const allSelected = displayed.length > 0 && displayed.every((p) => selectedIds.has(p.id));
  const rowCount = displayed.length;
  const sortableReorderEnabled = reorderMode && viewMode === "list" && Boolean(onReorderProducts);
  const dragHandleLabel = t("productos.dragHandleAria");

  const renderDragPreview = (p: PlatoCarta) => (
    <div
      className={
        reorderFocusLayout
          ? "hostly-reorder-mode__drag-preview"
          : "hostly-productos-carta-drag-preview"
      }
    >
      <ProductosCartaDragHandle disabled label={dragHandleLabel} />
      {reorderFocusLayout ? null : <ProductosCartaNameThumb p={p} />}
      <span
        className={
          reorderFocusLayout
            ? "hostly-reorder-mode__item-name"
            : "hostly-productos-carta-drag-preview__name"
        }
      >
        {p.nombre}
      </span>
    </div>
  );

  const renderFocusRow = (p: PlatoCarta, showDragHandle: boolean) => {
    const content = (
      <>
        {showDragHandle ? <ProductosCartaSortableDragHandle /> : null}
        <span className="hostly-reorder-mode__item-name" title={p.nombre}>
          {p.nombre}
        </span>
      </>
    );
    if (showDragHandle) {
      return (
        <ProductosCartaSortableFocusItem key={p.id} item={p}>
          {content}
        </ProductosCartaSortableFocusItem>
      );
    }
    return (
      <div key={p.id} className="hostly-reorder-mode__item">
        {content}
      </div>
    );
  };

  const focusListContent = (localItems: PlatoCarta[], withDrag: boolean) => (
    <div className="hostly-reorder-mode__list" role="list">
      {localItems.map((p) => renderFocusRow(p, withDrag))}
    </div>
  );

  const renderDesktopRow = (p: PlatoCarta, idx: number, count: number, showDragHandle: boolean) => {
    const cells = renderProductRowCells({
      ...props,
      ...inlineRowProps,
      p,
      selected: selectedIds.has(p.id),
      rowIndex: idx,
      rowCount: count,
      showDragHandle,
    });
    if (showDragHandle) {
      return (
        <ProductosCartaSortableDesktopRow key={p.id} item={p}>
          {cells}
        </ProductosCartaSortableDesktopRow>
      );
    }
    return (
      <HostlyDataRow key={p.id} selected={!reorderMode && selectedIds.has(p.id)}>
        {cells}
      </HostlyDataRow>
    );
  };

  const renderMobileRow = (p: PlatoCarta, idx: number, count: number, showDragHandle: boolean) => {
    const item = (
      <MobileProductItem
        {...props}
        p={p}
        rowIndex={idx}
        rowCount={count}
        showDragHandle={showDragHandle}
      />
    );
    if (showDragHandle) {
      return (
        <ProductosCartaSortableMobileItem key={p.id} item={p}>
          {item}
        </ProductosCartaSortableMobileItem>
      );
    }
    return <div key={p.id}>{item}</div>;
  };

  const tableBodyContent =
    viewMode === "grouped"
      ? groupedByCategoria.map((g, gi) => (
          <div key={`${g.sectionKey}-${gi}`} className="hostly-data-table-group">
            <HostlyDataGroupBar first={gi === 0}>
              <span className="hostly-data-table-group-bar__title">{g.categoria}</span>
              <span className="hostly-data-table-group-bar__count">{g.items.length}</span>
            </HostlyDataGroupBar>
            {g.items.map((p, idx) => renderDesktopRow(p, idx, g.items.length, false))}
          </div>
        ))
      : displayed.map((p, idx) => renderDesktopRow(p, idx, rowCount, false));

  const mobileListContent =
    viewMode === "grouped"
      ? groupedByCategoria.map((g, gi) => (
          <HostlyMobileListGroup key={`m-${g.sectionKey}-${gi}`} title={g.categoria} count={g.items.length}>
            {g.items.map((p, idx) => renderMobileRow(p, idx, g.items.length, false))}
          </HostlyMobileListGroup>
        ))
      : displayed.map((p, idx) => renderMobileRow(p, idx, rowCount, false));

  const listContent = (localItems: PlatoCarta[], isMobile: boolean, withDrag: boolean) => (
    <>
      <HostlyDataTable
        variant="productos-carta"
        className={`hostly-data-table--dense-config${reorderMode ? " hostly-data-table--reorder-mode" : ""}`}
      >
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            {renderProductosCartaHeaderCells({
              allSelected,
              displayedCount: localItems.length,
              isLegacyReadOnly,
              selectAllRef,
              t,
              toggleSelectAllDisplayed,
              reorderMode,
              inlineEditEnabled,
            })}
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {!isMobile
              ? localItems.map((p, idx) => renderDesktopRow(p, idx, localItems.length, withDrag))
              : null}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {isMobile
          ? localItems.map((p, idx) => renderMobileRow(p, idx, localItems.length, withDrag))
          : localItems.map((p, idx) => renderMobileRow(p, idx, localItems.length, false))}
      </HostlyMobileList>
    </>
  );

  if (reorderFocusLayout && sortableReorderEnabled) {
    return (
      <div className="hostly-reorder-mode__viewport flex min-h-0 flex-1 flex-col">
        <ProductosCartaSortableRoot
          items={displayed}
          disabled={Boolean(reorderBusyId)}
          dragHandleLabel={dragHandleLabel}
          onReorder={onReorderProducts!}
          renderDragPreview={renderDragPreview}
        >
          {({ localItems }) => focusListContent(localItems, true)}
        </ProductosCartaSortableRoot>
      </div>
    );
  }

  const tableViewport = (
    <div
      className={`hostly-data-table-viewport${reorderMode ? " hostly-data-table-viewport--reorder-mode" : ""}`}
    >
      {reorderMode ? null : (
      <ProductosSelectionBar
        count={selectedIds.size}
        variant={compactBulkBar ? "compact" : "default"}
        onClear={clearSelection}
        onAssignPass={onAssignPass}
        assignPassDisabled={assignPassDisabled}
        assignPassDisabledTitle={assignPassDisabledTitle}
        onAssignDestination={onAssignDestination}
        assignDestinationDisabled={assignDestinationDisabled}
        assignDestinationDisabledTitle={assignDestinationDisabledTitle}
        onAssignCategory={onAssignCategory}
        assignCategoryDisabled={assignCategoryDisabled}
        assignCategoryDisabledTitle={assignCategoryDisabledTitle}
        onAssignFamily={onAssignFamily}
        assignFamilyDisabled={assignFamilyDisabled}
        assignFamilyDisabledTitle={assignFamilyDisabledTitle}
        onBulkDelete={onBulkDelete}
        bulkDeleteDisabled={bulkDeleteDisabled}
        bulkDeleteDisabledTitle={bulkDeleteDisabledTitle}
        t={t}
      />
      )}

      {sortableReorderEnabled ? (
        <ProductosCartaSortableRoot
          items={displayed}
          disabled={Boolean(reorderBusyId)}
          dragHandleLabel={dragHandleLabel}
          onReorder={onReorderProducts!}
          renderDragPreview={renderDragPreview}
        >
          {({ localItems, isMobile }) => listContent(localItems, isMobile, true)}
        </ProductosCartaSortableRoot>
      ) : (
        <>
          <HostlyDataTable
            variant="productos-carta"
            className={`hostly-data-table--dense-config${reorderMode ? " hostly-data-table--reorder-mode" : ""}${inlineEditEnabled ? " hostly-data-table--inline-edit" : ""}`}
          >
            <HostlyDataTableScroll>
              <HostlyDataTableHead>
                {renderProductosCartaHeaderCells({
                  allSelected,
                  displayedCount: displayed.length,
                  isLegacyReadOnly,
                  selectAllRef,
                  t,
                  toggleSelectAllDisplayed,
                  reorderMode,
                  inlineEditEnabled,
                })}
              </HostlyDataTableHead>
              <HostlyDataTableBody>{tableBodyContent}</HostlyDataTableBody>
            </HostlyDataTableScroll>
          </HostlyDataTable>
          <HostlyMobileList>{mobileListContent}</HostlyMobileList>
        </>
      )}
    </div>
  );

  if (inlineEditEnabled) {
    return (
      <ProductosTableInlineEditProvider productIds={inlineTabProductIds}>
        {tableViewport}
      </ProductosTableInlineEditProvider>
    );
  }

  return tableViewport;
}
