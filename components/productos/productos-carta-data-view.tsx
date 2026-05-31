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
  HostlyTableBulkBar,
} from "@/components/ui/hostly/data-table";
import type { Locale, TranslateFn } from "@/lib/i18n";
import type { EscandalloMetaMap } from "@/lib/platos-escandallo-bridge";
import type { PlatoCarta, TipoProductoVenta } from "@/lib/platos-local";
import {
  getPublicationFlags,
  ProductosCartaRowActions,
  PRODUCTOS_CARTA_LEGACY_BLOCKED,
} from "./productos-table-cells";

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

/** Etiqueta corta de carta: solo visibilidad en carta (sin Activo/Inactivo). */
function compactCartaBadgeCopy(
  p: PlatoCarta,
  t: TranslateFn,
  locale: Locale,
): { short: string; full: string; tone: "success" | "warning" | "muted" } {
  const { enCarta, status } = getPublicationFlags(p);
  const full =
    status === "onMenu"
      ? t("productos.statusBadgeOnMenu")
      : status === "offMenu"
        ? t("productos.statusBadgeOffMenu")
        : t("productos.statusBadgeInactive");
  const short = enCarta
    ? t("productos.pubEnCarta")
    : locale === "en"
      ? "Off"
      : "Fuera";
  const tone = status === "onMenu" ? "success" : status === "offMenu" ? "warning" : "muted";
  return { short, full, tone };
}

function compactEscBadgeCopy(
  tiene: boolean,
  t: TranslateFn,
  locale: Locale,
): { short: string; full: string; tone: "success" | "muted" } {
  const full = tiene ? t("productos.escCon") : t("productos.escSin");
  const short =
    locale === "en" ? (tiene ? "Costed" : "No cost") : tiene ? "Con esc." : "Sin esc.";
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
  const { short, full, tone } = compactCartaBadgeCopy(p, t, locale);
  return (
    <HostlyStatusBadge
      tone={tone}
      title={full}
      aria-label={full}
      className="hostly-productos-carta-table-badge"
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
  const { short, full, tone } = compactEscBadgeCopy(tiene, t, locale);
  return (
    <HostlyStatusBadge
      tone={tone}
      title={full}
      aria-label={full}
      className="hostly-productos-carta-table-badge"
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

export type ProductosCartaBulkBreakdown = {
  countFueraCarta: number;
  countEnCarta: number;
  countInactivos: number;
  countActivosVenta: number;
  idsFuera: Set<string>;
  idsEnCarta: Set<string>;
  idsInactivos: Set<string>;
  idsActivosVenta: Set<string>;
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
  bulkSelectionBreakdown: ProductosCartaBulkBreakdown;
  bulkApplyToIds: (ids: Set<string>, patch: Partial<{ activo: boolean; isActive: boolean }>) => void;
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
  return (
    <div className="hostly-data-table-primary">
      <span className="hostly-data-table-primary__name" title={p.nombre}>
        {p.nombre}
      </span>
      {p.origenAlta === "importacion_ia" ? (
        <HostlyStatusBadge tone="neutral" dot={false} className="hostly-data-table-primary__tag">
          IA
        </HostlyStatusBadge>
      ) : null}
      <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
        {p.categoria}
      </span>
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
}) {
  const { allSelected, displayedCount, isLegacyReadOnly, selectAllRef, t, toggleSelectAllDisplayed } = args;
  return (
    <>
      <HostlyDataCell align="center" col="select">
        <SelectionCheckbox
          checked={allSelected}
          disabled={displayedCount === 0 || isLegacyReadOnly}
          onChange={toggleSelectAllDisplayed}
          ariaLabel={t("productos.selectAllVisible")}
          inputRef={selectAllRef}
        />
      </HostlyDataCell>
      <HostlyDataCell col="product">{t("carta.colNombre")}</HostlyDataCell>
      <HostlyDataCell col="tipo">{t("carta.colTipo")}</HostlyDataCell>
      <HostlyDataCell col="categoria">{t("carta.colCategoria")}</HostlyDataCell>
      <HostlyDataCell align="end" col="price">
        {t("carta.colPrecio")}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="carta">
        {t("productos.colCarta")}
      </HostlyDataCell>
      <HostlyDataCell align="center" col="esc">
        {t("productos.colEscandallo")}
      </HostlyDataCell>
      <HostlyDataCell align="end" col="actions">
        {t("carta.colActions")}
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
  } = args;
  const tiene = tieneEscandalloForPlato(p, meta);
  const busyEsc = escNavId === p.id;

  return (
    <>
      <HostlyDataCell align="center" col="select">
        <SelectionCheckbox
          checked={selected}
          disabled={isLegacyReadOnly}
          onChange={() => toggleRowSelected(p.id)}
          ariaLabel={t("productos.selectRowAria", { name: p.nombre })}
        />
      </HostlyDataCell>
      <HostlyDataCell col="product">
        <ProductPrimaryCell p={p} />
      </HostlyDataCell>
      <HostlyDataCell col="tipo">
        <span className="hostly-data-table-secondary" title={labelTipoVenta(t, p.tipoVenta)}>
          {labelTipoVenta(t, p.tipoVenta)}
        </span>
      </HostlyDataCell>
      <HostlyDataCell col="categoria">
        <span className="hostly-data-table-secondary" title={p.categoria}>
          {p.categoria}
        </span>
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
      </HostlyDataCell>
    </>
  );
}

function MobileProductItem(props: ProductosCartaDataViewProps & { p: PlatoCarta }) {
  const { p, meta, escNavId, t, locale, selectedIds, isLegacyReadOnly, toggleRowSelected } = props;
  const tiene = tieneEscandalloForPlato(p, meta);
  const busyEsc = escNavId === p.id;
  const selected = selectedIds.has(p.id);

  return (
    <HostlyMobileListItem
      selected={selected}
      leading={
        <SelectionCheckbox
          checked={selected}
          disabled={isLegacyReadOnly}
          onChange={() => toggleRowSelected(p.id)}
          ariaLabel={t("productos.selectRowAria", { name: p.nombre })}
        />
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
          <span>{p.categoria}</span>
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
    bulkSelectionBreakdown,
    bulkApplyToIds,
  } = props;

  const allSelected = displayed.length > 0 && displayed.every((p) => selectedIds.has(p.id));

  return (
    <div className="hostly-data-table-viewport">
      {selectedIds.size > 0 ? (
        <HostlyTableBulkBar>
          <span className="hostly-data-table-bulk-bar__label">
            {t("productos.bulkSelectedCount", { count: String(selectedIds.size) })}
          </span>
          <div className="hostly-data-table-bulk-bar__actions">
            {bulkSelectionBreakdown.countFueraCarta > 0 ? (
              <button
                type="button"
                disabled={isLegacyReadOnly}
                title={isLegacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : undefined}
                onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsFuera, { activo: true })}
                className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn hostly-data-table-bulk-bar__btn--success"
              >
                {t("productos.bulkVolverCartaCount", { count: String(bulkSelectionBreakdown.countFueraCarta) })}
              </button>
            ) : null}
            {bulkSelectionBreakdown.countEnCarta > 0 ? (
              <button
                type="button"
                disabled={isLegacyReadOnly}
                title={isLegacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : undefined}
                onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsEnCarta, { activo: false })}
                className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn hostly-data-table-bulk-bar__btn--warning"
              >
                {t("productos.bulkQuitarCartaCount", { count: String(bulkSelectionBreakdown.countEnCarta) })}
              </button>
            ) : null}
            {bulkSelectionBreakdown.countInactivos > 0 ? (
              <button
                type="button"
                disabled={isLegacyReadOnly}
                title={isLegacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : undefined}
                onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsInactivos, { isActive: true })}
                className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn"
              >
                {t("productos.bulkActivarCount", { count: String(bulkSelectionBreakdown.countInactivos) })}
              </button>
            ) : null}
            {bulkSelectionBreakdown.countActivosVenta > 0 ? (
              <button
                type="button"
                disabled={isLegacyReadOnly}
                title={isLegacyReadOnly ? PRODUCTOS_CARTA_LEGACY_BLOCKED : undefined}
                onClick={() => bulkApplyToIds(bulkSelectionBreakdown.idsActivosVenta, { isActive: false })}
                className="hostly-button-secondary hostly-button-compact hostly-data-table-bulk-bar__btn"
              >
                {t("productos.bulkDesactivarCount", { count: String(bulkSelectionBreakdown.countActivosVenta) })}
              </button>
            ) : null}
          </div>
        </HostlyTableBulkBar>
      ) : null}

      <HostlyDataTable variant="productos-carta">
        <HostlyDataTableScroll>
          <HostlyDataTableHead>
            {renderProductosCartaHeaderCells({
              allSelected,
              displayedCount: displayed.length,
              isLegacyReadOnly,
              selectAllRef,
              t,
              toggleSelectAllDisplayed,
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
                    {g.items.map((p) => (
                      <HostlyDataRow key={p.id} selected={selectedIds.has(p.id)}>
                        {renderProductRowCells({
                          ...props,
                          p,
                          selected: selectedIds.has(p.id),
                        })}
                      </HostlyDataRow>
                    ))}
                  </div>
                ))
              : displayed.map((p) => (
                  <HostlyDataRow key={p.id} selected={selectedIds.has(p.id)}>
                    {renderProductRowCells({
                      ...props,
                      p,
                      selected: selectedIds.has(p.id),
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
                {g.items.map((p) => (
                  <MobileProductItem key={p.id} {...props} p={p} />
                ))}
              </HostlyMobileListGroup>
            ))
          : displayed.map((p) => <MobileProductItem key={p.id} {...props} p={p} />)}
      </HostlyMobileList>
    </div>
  );
}
