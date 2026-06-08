"use client";

import type { RefObject } from "react";
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
import type { Locale, TranslateFn } from "@/lib/i18n";
import type { EscandalloMetaMap } from "@/lib/platos-escandallo-bridge";
import type { PlatoCarta, TipoProductoVenta } from "@/lib/platos-local";
import {
  getPublicationFlags,
  ProductosCartaNameThumb,
  ProductosCartaOperMicrochip,
  ProductosCartaReorderControls,
  ProductosCartaRowActions,
  PRODUCTOS_CARTA_LEGACY_BLOCKED,
  productOperationalFieldsFromPlato,
} from "./productos-table-cells";
import { ProductosSelectionBar } from "./productos-selection-bar";

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

function tieneEscandalloForPlato(p: PlatoCarta, meta: EscandalloMetaMap): boolean {
  if (typeof p.tieneEscandallo === "boolean") return p.tieneEscandallo;
  const sid = p.escandalloSupabaseId;
  if (sid == null) return false;
  return meta.get(sid)?.tieneEscandallo === true;
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
  locale,
}: {
  p: PlatoCarta;
  t: TranslateFn;
  locale: Locale;
}) {
  const { short, full, tone } = compactCartaBadgeCopy(p, t);
  return (
    <HostlyStatusBadge
      tone={tone}
      title={full}
      aria-label={full}
      dot
      className="hostly-data-table-microchip hostly-data-table-microchip--carta"
    >
      {short}
    </HostlyStatusBadge>
  );
}

function ProductosCartaTableEscBadge({
  tiene,
  t,
  locale,
}: {
  tiene: boolean;
  t: TranslateFn;
  locale: Locale;
}) {
  const { short, full, tone } = compactEscBadgeCopy(tiene, t);
  return (
    <HostlyStatusBadge
      tone={tone}
      title={full}
      aria-label={full}
      dot={false}
      className="hostly-data-table-microchip hostly-data-table-microchip--esc"
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
  escNavId: string | null;
  locale: Locale;
  t: TranslateFn;
  toggleRowSelected: (id: string) => void;
  toggleSelectAllDisplayed: () => void;
  openEdit: (p: PlatoCarta) => void;
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
};

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

function ProductPrimaryCell({ p }: { p: PlatoCarta }) {
  const ops = productOperationalFieldsFromPlato(p);
  return (
    <div className="hostly-data-table-primary hostly-data-table-primary--with-thumb">
      <ProductosCartaNameThumb p={p} />
      <div className="hostly-data-table-primary__stack">
        <span className="hostly-data-table-primary__name" title={p.nombre}>
          {p.nombre}
        </span>
        {p.origenAlta === "importacion_ia" ? (
          <HostlyStatusBadge tone="neutral" dot={false} className="hostly-data-table-primary__tag">
            IA
          </HostlyStatusBadge>
        ) : null}
        <span
          className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only"
          title={ops.tabletMeta}
        >
          {ops.tabletMeta}
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
}) {
  const { allSelected, displayedCount, isLegacyReadOnly, selectAllRef, t, toggleSelectAllDisplayed, reorderMode } = args;
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
      <HostlyDataCell align="end" col="price">
        {t("carta.colPrecio")}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="carta">
        {t("productos.colCarta")}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="esc">
        <span title={t("productos.colEscandallo")} aria-label={t("productos.colEscandallo")}>
          Esc.
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
  escNavId: string | null;
  t: TranslateFn;
  locale: Locale;
  selected: boolean;
  isLegacyReadOnly: boolean;
  toggleRowSelected: (id: string) => void;
  openEdit: (p: PlatoCarta) => void;
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
}) {
  const {
    p,
    meta,
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
  } = args;
  const tiene = tieneEscandalloForPlato(p, meta);
  const busyEsc = escNavId === p.id;
  const ops = productOperationalFieldsFromPlato(p);

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
        <ProductPrimaryCell p={p} />
      </HostlyDataCell>
      <HostlyDataCell col="tipo">
        <HostlyStatusBadge
          tone="neutral"
          dot={false}
          title={labelTipoVenta(t, p.tipoVenta)}
          aria-label={labelTipoVenta(t, p.tipoVenta)}
          className="hostly-data-table-tipo-pill"
        >
          {labelTipoVenta(t, p.tipoVenta)}
        </HostlyStatusBadge>
      </HostlyDataCell>
      <HostlyDataCell col="categoria">
        <span className="hostly-data-table-secondary" title={p.categoria}>
          {p.categoria}
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
      <HostlyDataCell align="end" col="price">
        <span className="hostly-data-table-price">{formatEuro(p.precioVenta, locale)}</span>
      </HostlyDataCell>
      <HostlyDataCell align="center" col="carta">
        <ProductosCartaTableCartaBadge p={p} t={t} locale={locale} />
      </HostlyDataCell>
      <HostlyDataCell align="center" col="esc">
        <ProductosCartaTableEscBadge tiene={tiene} t={t} locale={locale} />
      </HostlyDataCell>
      <HostlyDataCell align="end" col="actions">
        <div className="hostly-data-table-actions-shell">
          {reorderMode ? (
            <ProductosCartaReorderControls
              canMoveUp={rowIndex > 0}
              canMoveDown={rowIndex < rowCount - 1}
              busy={reorderBusyId === p.id}
              t={t}
              onMoveUp={() => onMoveProductUp?.(p.id)}
              onMoveDown={() => onMoveProductDown?.(p.id)}
            />
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
  props: ProductosCartaDataViewProps & { p: PlatoCarta; rowIndex?: number; rowCount?: number },
) {
  const {
    p,
    meta,
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
  } = props;
  const tiene = tieneEscandalloForPlato(p, meta);
  const busyEsc = escNavId === p.id;
  const selected = selectedIds.has(p.id);
  const ops = productOperationalFieldsFromPlato(p);

  return (
    <HostlyMobileListItem
      selected={reorderMode ? false : selected}
      leading={
        reorderMode ? null : (
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
        </>
      }
      aside={
        <>
          <span className="hostly-mobile-list-item__price">{formatEuro(p.precioVenta, locale)}</span>
          <div className="hostly-mobile-list-item__badges">
            <ProductosCartaTableCartaBadge p={p} t={t} locale={locale} />
            <ProductosCartaTableEscBadge tiene={tiene} t={t} locale={locale} />
          </div>
        </>
      }
      actions={
        reorderMode ? (
          <ProductosCartaReorderControls
            canMoveUp={rowIndex > 0}
            canMoveDown={rowIndex < rowCount - 1}
            busy={reorderBusyId === p.id}
            t={t}
            onMoveUp={() => onMoveProductUp?.(p.id)}
            onMoveDown={() => onMoveProductDown?.(p.id)}
          />
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
    onMoveProductUp,
    onMoveProductDown,
  } = props;

  const allSelected = displayed.length > 0 && displayed.every((p) => selectedIds.has(p.id));
  const rowCount = displayed.length;

  return (
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

      <HostlyDataTable
        variant="productos-carta"
        className={`hostly-data-table--dense-config${reorderMode ? " hostly-data-table--reorder-mode" : ""}`}
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
            })}
          </HostlyDataTableHead>
          <HostlyDataTableBody>
            {viewMode === "grouped"
              ? groupedByCategoria.map((g, gi) => (
                  <div key={`${g.sectionKey}-${gi}`} className="hostly-data-table-group">
                    <HostlyDataGroupBar first={gi === 0}>
                      <span className="hostly-data-table-group-bar__title">{g.categoria}</span>
                      <span className="hostly-data-table-group-bar__count">{g.items.length}</span>
                    </HostlyDataGroupBar>
                    {g.items.map((p, idx) => (
                      <HostlyDataRow key={p.id} selected={!reorderMode && selectedIds.has(p.id)}>
                        {renderProductRowCells({
                          ...props,
                          p,
                          selected: selectedIds.has(p.id),
                          rowIndex: idx,
                          rowCount: g.items.length,
                        })}
                      </HostlyDataRow>
                    ))}
                  </div>
                ))
              : displayed.map((p, idx) => (
                  <HostlyDataRow key={p.id} selected={!reorderMode && selectedIds.has(p.id)}>
                    {renderProductRowCells({
                      ...props,
                      p,
                      selected: selectedIds.has(p.id),
                      rowIndex: idx,
                      rowCount,
                    })}
                  </HostlyDataRow>
                ))}
          </HostlyDataTableBody>
        </HostlyDataTableScroll>
      </HostlyDataTable>

      <HostlyMobileList>
        {viewMode === "grouped"
          ? groupedByCategoria.map((g, gi) => (
              <HostlyMobileListGroup key={`m-${g.sectionKey}-${gi}`} title={g.categoria} count={g.items.length}>
                {g.items.map((p, idx) => (
                  <MobileProductItem
                    key={p.id}
                    {...props}
                    p={p}
                    rowIndex={idx}
                    rowCount={g.items.length}
                  />
                ))}
              </HostlyMobileListGroup>
            ))
          : displayed.map((p, idx) => (
              <MobileProductItem
                key={p.id}
                {...props}
                p={p}
                rowIndex={idx}
                rowCount={rowCount}
              />
            ))}
      </HostlyMobileList>
    </div>
  );
}
