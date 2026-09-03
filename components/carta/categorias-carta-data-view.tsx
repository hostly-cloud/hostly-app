"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import {
  getCategoryOperationalBehaviorShortLabel,
  normalizeCategoryOperationalBehavior,
} from "@/lib/carta-categorias/category-operational-behavior";
import { HostlyButton } from "@/components/ui/hostly";
import {
  HostlyDataCell,
  HostlyDataRow,
  HostlyDataTable,
  HostlyDataTableBody,
  HostlyDataTableHead,
  HostlyDataTableScroll,
  HostlyMobileList,
  HostlyMobileListItem,
  HostlyStatusBadge,
} from "@/components/ui/hostly/data-table";
import { ConfigCartaEditToggleActions } from "@/components/carta/config-carta-row-actions";
import {
  CategoriasCartaDragHandle,
  CategoriasCartaSortableDragHandle,
  CategoriasCartaSortableDesktopRow,
  CategoriasCartaSortableMobileItem,
  CategoriasCartaSortableRoot,
} from "@/components/carta/categorias-carta-sortable";
import { ProductosCartaReorderControls } from "@/components/productos/productos-table-cells";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { resolveCategoryProductFamilyLabel } from "@/lib/carta/category-product-family";
import { resolveEffectiveModifierGroupLabels } from "@/lib/modifiers/effective-product-modifiers";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";

function tipoLabel(t: CartaCategoriaTipo): string {
  if (t === "food") return "Comida";
  if (t === "drink") return "Bebida";
  return "Mixto";
}

function CategoryStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activa" : "Inactiva"}>
      {active ? "Activa" : "Inactiva"}
    </HostlyStatusBadge>
  );
}

export type CategoriasCartaDataViewProps = {
  items: CartaCategoria[];
  loading: boolean;
  countsByCatId: Map<string, number>;
  productFamilies: ProductFamilyDocument[];
  modifierGroups: ModifierGroupDocument[];
  onEdit: (item: CartaCategoria) => void;
  onToggleActive: (item: CartaCategoria) => void;
  onDelete?: (item: CartaCategoria) => void;
  onOrderProducts?: (item: CartaCategoria) => void;
  canOrderProducts?: (item: CartaCategoria) => boolean;
  orderProductsTitle?: string;
  orderProductsDisabledTitle?: string;
  onCreateNew?: () => void;
  onMoveCategoryUp?: (item: CartaCategoria) => void;
  onMoveCategoryDown?: (item: CartaCategoria) => void;
  onReorderCategories?: (orderedIds: string[]) => void;
  reorderBusyId?: string | null;
};

function renderCategoryCells(args: {
  c: CartaCategoria;
  countsByCatId: Map<string, number>;
  productFamilies: ProductFamilyDocument[];
  modifierGroups: ModifierGroupDocument[];
  onEdit: (item: CartaCategoria) => void;
  onToggleActive: (item: CartaCategoria) => void;
  onDelete?: (item: CartaCategoria) => void;
  onOrderProducts?: (item: CartaCategoria) => void;
  canOrderProducts?: (item: CartaCategoria) => boolean;
  orderProductsTitle?: string;
  orderProductsDisabledTitle?: string;
  behaviorLocale: "es" | "en";
  rowIndex: number;
  rowCount: number;
  onMoveCategoryUp?: (item: CartaCategoria) => void;
  onMoveCategoryDown?: (item: CartaCategoria) => void;
  onReorderCategories?: (orderedIds: string[]) => void;
  reorderBusyId?: string | null;
  dragHandleLabel: string;
  showDragHandle?: boolean;
  t: (key: string) => string;
}) {
  const {
    c,
    countsByCatId,
    productFamilies,
    modifierGroups,
    onEdit,
    onToggleActive,
    onDelete,
    onOrderProducts,
    canOrderProducts,
    orderProductsTitle,
    orderProductsDisabledTitle,
    behaviorLocale,
    rowIndex,
    rowCount,
    onMoveCategoryUp,
    onMoveCategoryDown,
    reorderBusyId,
    showDragHandle,
    t,
  } = args;
  const productCount = countsByCatId.get(c.id) ?? 0;
  const orderAllowed = canOrderProducts?.(c) ?? false;
  const orderTitle =
    orderAllowed
      ? orderProductsTitle ?? "Ordenar productos"
      : orderProductsDisabledTitle ?? orderProductsTitle ?? "Ordenar productos";
  const familyLabel = resolveCategoryProductFamilyLabel(c, productFamilies);
  const behaviorLabel = getCategoryOperationalBehaviorShortLabel(
    normalizeCategoryOperationalBehavior(c.categoryOperationalBehavior),
    behaviorLocale,
  );
  const modifierLabels = resolveEffectiveModifierGroupLabels(null, c, modifierGroups);
  const modifiersText = modifierLabels.length > 0 ? modifierLabels.join(", ") : "—";

  return (
    <>
      <HostlyDataCell col="name">
        <div className="hostly-carta-category-name-cell">
          {showDragHandle ? <CategoriasCartaSortableDragHandle /> : null}
          <div className="hostly-data-table-primary">
            <span className="hostly-data-table-primary__name" title={c.name}>
              {c.name}
            </span>
            <span className="hostly-data-table-primary__meta hostly-data-table-col--tablet-only">
              {familyLabel} · {tipoLabel(c.type)}
            </span>
          </div>
        </div>
      </HostlyDataCell>
      <HostlyDataCell align="center" col="status">
        <CategoryStatusBadge active={c.isActive} />
      </HostlyDataCell>
      <HostlyDataCell col="family">
        <div className="hostly-data-table-stack">
          <span className="hostly-data-table-secondary" title={familyLabel}>
            {familyLabel}
          </span>
          <span
            className="hostly-data-table-secondary hostly-data-table-secondary--muted"
            title={behaviorLabel}
          >
            {behaviorLabel}
          </span>
        </div>
      </HostlyDataCell>
      <HostlyDataCell align="end" col="products">
        <span className="hostly-data-table-metric">{productCount}</span>
      </HostlyDataCell>
      <HostlyDataCell col="type">
        <span className="hostly-data-table-secondary">{tipoLabel(c.type)}</span>
      </HostlyDataCell>
      <HostlyDataCell col="modifiers">
        <span className="hostly-data-table-secondary" title={modifiersText}>
          {modifiersText}
        </span>
      </HostlyDataCell>
      <HostlyDataCell align="end" col="order">
        {onMoveCategoryUp && onMoveCategoryDown ? (
          <div className="hostly-carta-category-order-actions" onClick={(e) => e.stopPropagation()}>
            <ProductosCartaReorderControls
              canMoveUp={rowIndex > 0}
              canMoveDown={rowIndex < rowCount - 1}
              busy={reorderBusyId === c.id}
              t={t}
              onMoveUp={() => onMoveCategoryUp(c)}
              onMoveDown={() => onMoveCategoryDown(c)}
            />
          </div>
        ) : null}
      </HostlyDataCell>
      <HostlyDataCell align="end" col="actions">
        <ConfigCartaEditToggleActions
          isActive={c.isActive}
          editTitle="Editar categoría de carta"
          toggleTitle={c.isActive ? "Desactivar categoría de carta" : "Activar categoría de carta"}
          onEdit={() => onEdit(c)}
          onToggle={() => onToggleActive(c)}
          orderProductsTitle={orderTitle}
          onOrderProducts={onOrderProducts ? () => onOrderProducts(c) : undefined}
          orderProductsDisabled={!orderAllowed}
          deleteTitle={t("common.delete")}
          onDelete={onDelete ? () => onDelete(c) : undefined}
        />
      </HostlyDataCell>
    </>
  );
}

export function CategoriasCartaDataView({
  items,
  loading,
  countsByCatId,
  productFamilies,
  modifierGroups,
  onEdit,
  onToggleActive,
  onDelete,
  onOrderProducts,
  canOrderProducts,
  orderProductsTitle,
  orderProductsDisabledTitle,
  onCreateNew,
  onMoveCategoryUp,
  onMoveCategoryDown,
  onReorderCategories,
  reorderBusyId,
}: CategoriasCartaDataViewProps) {
  const { locale, t } = useI18n();
  const behaviorLocale = locale === "en" ? "en" : "es";
  const dragHandleLabel = t("cartaCategories.dragHandleAria");
  const sortableEnabled = Boolean(onReorderCategories);

  if (loading) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded">
        <div className="hostly-carta-config-list-loading">Cargando categorías…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <p className="hostly-carta-config-empty__title">Aún no hay categorías de carta</p>
          <p className="hostly-carta-config-empty__body">
            Crea la primera sección visible del TPV (p. ej. Pizze Classico) o importa una carta con IA.
          </p>
          <div className="hostly-carta-config-empty__actions">
            {onCreateNew ? (
              <HostlyButton variant="primary" size="compact" onClick={onCreateNew}>
                Nueva categoría de carta
              </HostlyButton>
            ) : null}
            <Link href="/dashboard/configuracion/carta/importacion" className="hostly-button-secondary hostly-button-compact">
              IA e importación
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const renderDragPreview = (c: CartaCategoria) => (
    <div className="hostly-carta-category-drag-preview">
      <CategoriasCartaDragHandle disabled label={dragHandleLabel} />
      <span className="hostly-carta-category-drag-preview__name">{c.name}</span>
    </div>
  );

  const renderMobileCategoryItem = (c: CartaCategoria, showDragHandle: boolean) => {
    const productCount = countsByCatId.get(c.id) ?? 0;
    const familyLabel = resolveCategoryProductFamilyLabel(c, productFamilies);
    const behaviorLabel = getCategoryOperationalBehaviorShortLabel(
      normalizeCategoryOperationalBehavior(c.categoryOperationalBehavior),
      behaviorLocale,
    );
    const modifierLabels = resolveEffectiveModifierGroupLabels(null, c, modifierGroups);

    return (
      <HostlyMobileListItem
        onClick={showDragHandle ? undefined : () => onEdit(c)}
        leading={showDragHandle ? <CategoriasCartaSortableDragHandle /> : undefined}
        title={<span className="hostly-mobile-list-item__name">{c.name}</span>}
        meta={
          <>
            <span>{familyLabel}</span>
            <span className="hostly-mobile-list-item__dot" aria-hidden>
              ·
            </span>
            <span>{behaviorLabel}</span>
            <span className="hostly-mobile-list-item__dot" aria-hidden>
              ·
            </span>
            <span>{tipoLabel(c.type)}</span>
            {modifierLabels.length > 0 ? (
              <>
                <span className="hostly-mobile-list-item__dot" aria-hidden>
                  ·
                </span>
                <span>{modifierLabels.length} mod.</span>
              </>
            ) : null}
          </>
        }
        aside={
          <>
            <CategoryStatusBadge active={c.isActive} />
            <span className="hostly-data-table-metric">{productCount} prod.</span>
          </>
        }
        actions={
          <ConfigCartaEditToggleActions
            isActive={c.isActive}
            editTitle="Editar categoría de carta"
            toggleTitle={c.isActive ? "Desactivar categoría de carta" : "Activar categoría de carta"}
            onEdit={() => onEdit(c)}
            onToggle={() => onToggleActive(c)}
            orderProductsTitle={
              canOrderProducts?.(c)
                ? orderProductsTitle ?? "Ordenar productos"
                : orderProductsDisabledTitle ?? orderProductsTitle ?? "Ordenar productos"
            }
            onOrderProducts={onOrderProducts ? () => onOrderProducts(c) : undefined}
            orderProductsDisabled={!(canOrderProducts?.(c) ?? false)}
            deleteTitle={t("common.delete")}
            onDelete={onDelete ? () => onDelete(c) : undefined}
          />
        }
      />
    );
  };

  const tableContent = (listItems: CartaCategoria[], showDragHandle: boolean) => (
    <HostlyDataTable variant="categorias">
      <HostlyDataTableScroll>
        <HostlyDataTableHead>
          <HostlyDataCell col="name">Nombre</HostlyDataCell>
          <HostlyDataCell align="center" col="status">
            Estado
          </HostlyDataCell>
          <HostlyDataCell col="family">
            <span
              className="hostly-data-table-secondary"
              title="Familia de producto: filtros e informes. Distinta de la familia de menú (Platos / Bebidas)."
            >
              Fam. producto
            </span>
          </HostlyDataCell>
          <HostlyDataCell align="end" col="products">
            Productos
          </HostlyDataCell>
          <HostlyDataCell col="type">
            <span
              className="hostly-data-table-secondary"
              title="Si la sección es de comida, bebida o mixta."
            >
              Comida/bebida
            </span>
          </HostlyDataCell>
          <HostlyDataCell col="modifiers">Modificadores</HostlyDataCell>
          <HostlyDataCell align="end" col="order">
            Orden
          </HostlyDataCell>
          <HostlyDataCell align="end" col="actions">
            Acciones
          </HostlyDataCell>
        </HostlyDataTableHead>
        <HostlyDataTableBody>
          {listItems.map((c, rowIndex) => {
            const cells = renderCategoryCells({
              c,
              countsByCatId,
              productFamilies,
              modifierGroups,
              onEdit,
              onToggleActive,
              onDelete,
              onOrderProducts,
              canOrderProducts,
              orderProductsTitle,
              orderProductsDisabledTitle,
              behaviorLocale,
              rowIndex,
              rowCount: listItems.length,
              onMoveCategoryUp,
              onMoveCategoryDown,
              onReorderCategories,
              reorderBusyId,
              dragHandleLabel,
              showDragHandle,
              t,
            });

            if (showDragHandle) {
              return (
                <CategoriasCartaSortableDesktopRow key={c.id} item={c} onClick={() => onEdit(c)}>
                  {cells}
                </CategoriasCartaSortableDesktopRow>
              );
            }

            return (
              <HostlyDataRow key={c.id} onClick={() => onEdit(c)}>
                {cells}
              </HostlyDataRow>
            );
          })}
        </HostlyDataTableBody>
      </HostlyDataTableScroll>
    </HostlyDataTable>
  );

  const mobileContent = (listItems: CartaCategoria[], showDragHandle: boolean) => (
    <HostlyMobileList>
      {listItems.map((c) => {
        const item = renderMobileCategoryItem(c, showDragHandle);
        if (showDragHandle) {
          return (
            <CategoriasCartaSortableMobileItem key={c.id} item={c} onClick={() => onEdit(c)}>
              {item}
            </CategoriasCartaSortableMobileItem>
          );
        }
        return <div key={c.id}>{item}</div>;
      })}
    </HostlyMobileList>
  );

  const viewport = (listItems: CartaCategoria[], showDragHandle: boolean) => (
    <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded">
      {tableContent(listItems, showDragHandle)}
      {mobileContent(listItems, showDragHandle)}
    </div>
  );

  if (!sortableEnabled) {
    return viewport(items, false);
  }

  return (
    <CategoriasCartaSortableRoot
      items={items}
      disabled={Boolean(reorderBusyId)}
      dragHandleLabel={dragHandleLabel}
      onReorder={onReorderCategories!}
      renderDragPreview={renderDragPreview}
    >
      {({ localItems, isMobile }) => (
        <div className="hostly-data-table-viewport hostly-data-table-viewport--embedded">
          <p className="hostly-carta-category-reorder-hint" role="note">
            {t("cartaCategories.dragReorderHint")}
          </p>
          {!isMobile ? tableContent(localItems, true) : null}
          {isMobile ? mobileContent(localItems, true) : null}
        </div>
      )}
    </CategoriasCartaSortableRoot>
  );
}
