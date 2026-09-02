"use client";

import type { CSSProperties, ReactNode, SVGProps } from "react";
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { CategoriaCartaFormField } from "@/components/carta/categoria-carta-form-field";
import { CategoryProductFamilySelect } from "@/components/carta/category-product-family-select";
import {
  CATEGORY_PRODUCT_FAMILY_NONE,
  resolveProductFamilyFromSelectValue,
} from "@/lib/carta/category-product-family";
import { ConfigCartaWorkbench, ConfigBtnPrimary, ConfigBtnSecondary, ConfigCard } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import ModulePageShell from "@/components/module-page-shell";
import { ProductosCartaDataView, ProductosResolverParitySummaryStrip } from "@/components/productos/productos-carta-data-view";
import {
  ProductosCartaNameThumb,
  type ProductEditFocus,
  type ProductEditOptions,
} from "@/components/productos/productos-table-cells";
import {
  ConfigCartaStatusFilterSelect,
  ProductosCategoryNavigation,
  type ConfigCartaListFilterId,
} from "@/components/productos/productos-config-carta-compact-controls";
import {
  PRODUCT_CATEGORY_ALL_ID,
  PRODUCT_CATEGORY_UNCATEGORIZED_ID,
  buildProductCategoryNavigationOptions,
  matchesProductCategoryNavigationOption,
} from "@/lib/productos/product-category-navigation";
import { ProductosBulkAssignCourseModal } from "@/components/productos/productos-bulk-assign-course-modal";
import { ProductosBulkAssignDestinationModal } from "@/components/productos/productos-bulk-assign-destination-modal";
import { ProductCatalogImageBulkPanel } from "@/components/productos/product-catalog-image-bulk-panel";
import { ProductosBulkAssignCategoryModal } from "@/components/productos/productos-bulk-assign-category-modal";
import { ProductosBulkAssignFamilyModal } from "@/components/productos/productos-bulk-assign-family-modal";
import { CartaDeleteChoiceModal } from "@/components/carta/carta-delete-choice-modal";
import { ProductosBulkDeleteModal } from "@/components/productos/productos-bulk-delete-modal";
import {
  computeBulkCategoryInitialSelectValue,
  computeBulkCourseInitialSelectValue,
  computeBulkDestinationInitialSelectValue,
  computeBulkFamilyInitialSelectValue,
} from "@/components/productos/productos-bulk-initial-values";
import { ProductosSelectionBar } from "@/components/productos/productos-selection-bar";
import { useProductosSelection } from "@/components/productos/use-productos-selection";
import { HostlyFilterCard, HostlyKpiCard, HostlySection, HostlySectionHeader, HostlySurface, hostlySegmentTabClassName, HostlySegmentedControl } from "@/components/ui/hostly";
import { fetchCartaCategorias, fetchCartaFamilias, createCartaCategoriaApi } from "@/lib/carta-categorias/api-client";
import { buildCartaGroupedSections } from "@/lib/carta-categorias/grouping";
import { comparePlatoCarta } from "@/lib/carta/product-sort-order";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import {
  cartaCategoriasForProductForm,
  cartaCategoriasForProductSelectorList,
  defaultCartaCategoriaTipoForTipoProducto,
  isCartaCategoriaCompatibleWithTipoProducto,
} from "@/lib/carta-categorias/filter-for-tipo-producto";
import {
  buildProductFamilyPatchFromCategoryId,
} from "@/lib/carta/product-category-family-resolver";
import {
  defaultOperationStationSelectForTipoVenta,
  parseProductPrecio,
} from "@/lib/productos/product-central-draft";
import { resolveCategorySelectionInheritance } from "@/lib/productos/product-category-inheritance";
import {
  buildCentralInputFromProductFormDraft,
  validateProductFormCoreFields,
} from "@/lib/productos/product-form-submit-payload";
import { persistCentralCatalogProduct } from "@/lib/productos/persist-central-catalog-product";
import {
  matchesCatalogFoodDrinkSegment,
  productFamilyDenormFromPlato,
  readProductFamilyTypeForFilter,
  type CatalogFoodDrinkSegment,
} from "@/lib/carta/product-family-list-filter";
import type { CartaCategoria, CartaCategoriaTipo, CartaFamilia } from "@/lib/carta-categorias/types";
import { CARTA_MENU_FAMILIA_FILTER_UNASSIGNED, isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import {
  productCatalogCourseFromSelectValue,
  productCatalogCourseSelectValue,
  type ProductCatalogCourse,
} from "@/lib/carta/menu-course";
import {
  DEFAULT_PRODUCT_COMPOSITION_TYPE,
  PRODUCT_COMPOSITION_TYPE_VALUES,
  normalizeProductCompositionType,
  type ProductCompositionType,
} from "@/lib/carta/product-composition-type";
import { productFormSkipsMenuCourse } from "@/lib/carta/product-form-menu-course";
import {
  evaluateProductFormPreventiveValidation,
  PRODUCT_FORM_ACTIVE_NO_FAMILY_WARNING,
} from "@/lib/carta/product-form-preventive-validation";
import { buildProductMenuFamilyInheritedHintView } from "@/lib/productos/product-menu-family-inherited-hint";
import {
  auditCatalogResolverParityFromSources,
  filterProductsByResolverParityFilter,
  summarizeResolverParityAudits,
  type ResolverParityFilterId,
} from "@/lib/productos/product-operational-routing-audit";
import { OperationStationProductSelect } from "@/components/operacion/operation-station-product-select";
import {
  ensureDefaultOperationStations,
  listenOperationStations,
} from "@/lib/firestore/operation-stations";
import { listProductionStations } from "@/lib/firestore/production-stations";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";
import {
  ensureDefaultProductFamilies,
  listenProductFamilies,
} from "@/lib/firestore/product-families";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import { listenModifierGroups } from "@/lib/firestore/modifier-groups";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import { sanitizeModifierGroupIdsForSave } from "@/lib/modifiers/effective-product-modifiers";
import {
  buildProductStationPatchFromSelectValue,
  isLegacyOperationStationSelectValue,
  operationStationSelectValueFromProduct,
} from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import {
  applyDefaultModifierFamilyIfEligible,
  fetchModifierFamiliesForRestaurante,
  type ModifierFamilyRow,
} from "@/lib/modificadores/default-modifier-family";
import { useAuth } from "@/components/auth/auth-context";
import { fireAndForgetSyncCatalogoCategoria } from "@/lib/hostly/sync-catalogo-venta-categoria";
import { OPER_PRIMARY_COUNT_META, OPER_PRIMARY_SECTION_TITLE } from "@/lib/hostly/tpv-oper-title";
import {
  bootstrapPlatosFromEscandallosIfEmpty,
  ensureEscandalloRowsForPlatos,
  fetchEscandalloMetaForIds,
  mirrorPlatoToEscandalloRow,
  type EscandalloMetaMap,
} from "@/lib/platos-escandallo-bridge";
import { CatalogMigrationPreviewPanel } from "@/components/productos/catalog-migration-preview-panel";
import { LegacyPlatosArchivePanel } from "@/components/productos/legacy-platos-archive-panel";
import { useCentralProductsForCarta } from "@/lib/carta/use-central-products-for-carta";
import { resolvePlatoTieneEscandallo } from "@/lib/carta/operational-catalog-mappers";
import {
  applyResolvedCartaCentralProductDelete,
  resolveCartaProductDeleteAction,
} from "@/lib/carta/carta-product-delete-policy";
import {
  activateCentralProduct,
  bulkUpdateCentralProductsCourse,
  bulkUpdateCentralProductsDestination,
  bulkUpdateCentralProductsCategory,
  bulkUpdateCentralProductsFamily,
  deleteCentralProductPermanently,
  disableCentralProduct,
  formatCentralCatalogWriteError,
  listenCentralProducts,
  listenProductsForInventory,
  setCentralProductPublication,
  reorderCentralProductsInCategory,
} from "@/lib/firestore/products";
import { createStableImageFile } from "@/lib/firebase/product-image-storage";
import {
  buildInventoryProductLookupMap,
  buildRecipeSourceFromDraftRows,
  isRecipeInventoryUnit,
  normalizeProductRecipe,
  normalizedProductRecipeToFirestore,
  productDocumentsToInventoryLookup,
} from "@/lib/recipes/product-recipe-helpers";
import type { InventoryProductLookup } from "@/lib/recipes/product-recipe-types";
import type { RecipeIngredientDraftRow } from "@/components/productos/product-recipe-editor-section";
import { parseNullableNumber } from "@/components/carta/escandallos/escandallo-display-utils";
import {
  ProductFormCommercialInfoModal,
  ProductFormCommercialInfoSummaryCard,
} from "@/components/productos/product-form-commercial-info-modal";
import {
  ProductFormEscandalloModal,
  ProductFormEscandalloSummaryCard,
} from "@/components/productos/product-form-escandallo-modal";
import { ProductFormDrawerZone } from "@/components/productos/product-form-drawer-section";
import {
  ProductFormDrawerTabPanel,
  ProductFormDrawerTabs,
  type ProductFormDrawerTabId,
} from "@/components/productos/product-form-drawer-tabs";
import { ProductQuickCreateDrawer } from "@/components/productos/product-quick-create-drawer";
import { useProductQuickCreate } from "@/components/productos/use-product-quick-create";
import type { ProductDocument } from "@/lib/firestore/products";
import type {
  ProductQuickCreateDraft,
  ProductQuickCreateInheritedDraft,
} from "@/lib/productos/product-category-inheritance";
import {
  PLATOS_CHANGED_EVENT,
  TIPOS_PRODUCTO_VENTA,
  createPlatoDraft,
  loadPlatos,
  savePlatos,
  type PlatoCarta,
  type TipoProductoVenta,
} from "@/lib/platos-local";
import type { Locale } from "@/lib/i18n";

type CartaFilter =
  | "todos"
  | "activos"
  | "inactivos"
  | "enCarta"
  | "fueraCarta"
  | "conEscandallo"
  | "sinEscandallo";

const PRODUCTOS_ROW_HOVER_CLASS = "hostly-productos-data-row";
const PRODUCTOS_ROW_TEXT_BTN_CLASS = "hostly-productos-row-text-btn";
const PRODUCTOS_ROW_ICON_BTN_CLASS = "hostly-productos-row-icon-btn";
const LEGACY_CATALOG_EDIT_BLOCKED = "Migra el catálogo para editar productos.";

/** Data-grid: hover suave en fila + botones de acción compactos (config TPV). */
const productosTableInteractionStyles = `
.hostly-productos-data-row {
  transition: background-color 0.16s ease;
}
.hostly-productos-data-row:hover {
  background-color: rgba(248, 250, 252, 0.045) !important;
}
.hostly-productos-row-text-btn {
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease, opacity 0.14s ease;
}
.hostly-productos-row-text-btn:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
.hostly-productos-row-icon-btn {
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease;
}
.hostly-productos-row-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
@media (hover: hover) and (pointer: fine) {
  .hostly-productos-row-text-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.04) !important;
    border-color: rgba(148, 163, 184, 0.16) !important;
    color: #cbd5e1 !important;
  }
  .hostly-productos-row-text-btn:active:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.025) !important;
  }
  .hostly-productos-row-icon-btn:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.052) !important;
    border-color: rgba(148, 163, 184, 0.2) !important;
    color: #cbd5e1 !important;
  }
}
@media (prefers-reduced-motion: reduce) {
  .hostly-productos-data-row,
  .hostly-productos-row-text-btn,
  .hostly-productos-row-icon-btn {
    transition: none;
  }
}
.hostly-productos-routing-correct-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 7px;
  min-height: 22px;
  border-radius: 999px;
  border: 1px solid rgba(56, 189, 248, 0.38);
  background: rgba(224, 242, 254, 0.95);
  color: #0369a1;
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.04em;
  line-height: 1.1;
  white-space: nowrap;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}
.hostly-productos-routing-correct-btn:hover {
  border-color: rgba(56, 189, 248, 0.55);
  background: rgba(186, 230, 253, 0.98);
}
.hostly-productos-routing-correct-btn:focus-visible {
  outline: 2px solid rgba(56, 189, 248, 0.45);
  outline-offset: 1px;
}
.hostly-productos-routing-correct-btn--disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .hostly-productos-routing-correct-btn {
    transition: none;
  }
}
.hostly-product-form-routing-focus {
  display: flex;
  flex-direction: column;
  gap: var(--hostly-op-gap-sm, 10px);
  min-width: 0;
  border-radius: 10px;
  transition: box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}
.hostly-product-form-routing-focus--active {
  padding: 8px;
  margin: -4px -4px 0;
  border: 1px solid rgba(56, 189, 248, 0.42);
  background: rgba(224, 242, 254, 0.28);
  box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.1);
}
.hostly-product-form-routing-focus__banner {
  margin: 0;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(56, 189, 248, 0.28);
  background: rgba(255, 255, 255, 0.92);
  color: #0369a1;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.35;
}
@media (prefers-reduced-motion: reduce) {
  .hostly-product-form-routing-focus {
    transition: none;
  }
}
`;

/** Contenedor principal de la tabla (modo claro: superficie ice del design system; modo oscuro: legacy). */
const PRODUCTOS_TABLE_SECTION_DARK_STYLE: CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid rgba(51, 65, 85, 0.5)",
  background: "#1e293b",
  boxShadow: "none",
};

function ProductosTableChrome({
  iceVisual,
  embedFlatChrome,
  className,
  children,
}: {
  iceVisual: boolean;
  /** Menos “tarjeta sobre tarjeta” en Config → Carta → Productos */
  embedFlatChrome?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (iceVisual) {
    if (embedFlatChrome) {
      return (
        <HostlySurface
          variant="flat"
          className={[
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 bg-transparent shadow-none",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </HostlySurface>
      );
    }
    return (
      <HostlySurface variant="ice" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </HostlySurface>
    );
  }
  return <section style={PRODUCTOS_TABLE_SECTION_DARK_STYLE}>{children}</section>;
}

/** Botones de texto en columna Acciones: compactos, misma altura, no “texto flotante”. */
const productRowActionBtnShell: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  padding: "2px 6px",
  borderRadius: 5,
  fontSize: 9,
  fontWeight: 550,
  lineHeight: 1.2,
  whiteSpace: "nowrap",
  minHeight: 22,
  boxSizing: "border-box",
  cursor: "pointer",
  border: "1px solid rgba(51, 65, 85, 0.38)",
  background: "rgba(15, 23, 42, 0.2)",
  color: "#8896a8",
};

const TIPO_VENTA_I18N: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

function labelTipoVenta(t: (key: string) => string, tipo: TipoProductoVenta): string {
  return t(TIPO_VENTA_I18N[tipo]);
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatEuro(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const tabularFigures: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

/** Nombre: columna dominante (Stripe-like). */
const productRowNombreStyle: CSSProperties = {
  fontWeight: 700,
  color: "#f8fafc",
  fontSize: 14,
  lineHeight: 1.28,
  letterSpacing: "-0.02em",
  minWidth: 0,
  flex: "1 1 0%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const productRowPrecioStyle: CSSProperties = {
  ...tabularFigures,
  display: "block",
  width: "100%",
  minWidth: 0,
  textAlign: "right",
  fontWeight: 600,
  color: "#e2e8f0",
  fontSize: 12,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
};

/** Tipo: micro-etiqueta estrecha. */
const productRowTipoStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 590,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#5b6a7d",
  lineHeight: 1.2,
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** Categoría carta: secundaria legible. */
const productRowCategoriaStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 480,
  color: "#758193",
  lineHeight: 1.26,
  display: "block",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const inputStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  color: "#f8fafc",
  fontSize: 16,
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: 8,
};

const drawerInputClass = "hostly-input hostly-carta-config-field-input";
const drawerInputProminentClass = `${drawerInputClass} hostly-product-form-drawer-input--prominent`;

/** Ancho útil del módulo: más protagonismo sin tocar sidebar de configuración. */
const PRODUCTOS_SHELL_MAX_WIDTH = 1520;
/** Mínimo horizontal del grid: scroll horizontal en pantallas estrechas, sin “tabla mini”. */
const PRODUCTOS_TABLE_MIN_WIDTH_PX = 980;
/** Con columna Acciones sólo iconos hay menos anchura útil tabular. */
const PRODUCTOS_TABLE_MIN_WIDTH_EMBED_ICONS_PX = 840;

const colHeadStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 560,
  color: "#5f7082",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  lineHeight: 1.18,
  display: "block",
  minWidth: 0,
  boxSizing: "border-box",
  padding: "3px 4px",
};

/**
 * Data-grid: misma plantilla en cabecera, filas y barra de grupo.
 * Checkbox · nombre · tipo · categoría · PVP · carta · escandallo · acciones (embed config: sólo iconos).
 */
const PRODUCTOS_TABLE_GRID_TEMPLATE =
  "32px minmax(200px, 4fr) 80px minmax(124px, 2fr) 76px minmax(86px, 1fr) 78px minmax(248px, 1.55fr)";

const PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED =
  "28px minmax(200px, 4fr) 80px minmax(124px, 2fr) 76px minmax(86px, 1fr) 78px minmax(248px, 1.55fr)";
/** Config Carta embed: columna Acciones sólo iconos — más protagonismo datos. */
const PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED_ICONS =
  "28px minmax(208px, 4.35fr) 80px minmax(124px, 2fr) 76px minmax(86px, 1fr) 78px minmax(108px, 0.92fr)";

const rowGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE,
  columnGap: 6,
  rowGap: 0,
  alignItems: "center",
  justifyItems: "stretch",
  width: "100%",
  boxSizing: "border-box",
};

const rowGridEmbed: CSSProperties = {
  ...rowGrid,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED,
  columnGap: 10,
};

const rowGridEmbedIcons: CSSProperties = {
  ...rowGrid,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED_ICONS,
  columnGap: 10,
};

/** Barra de grupo: misma rejilla; contenido en una sola celda ancha. */
const rowGridGroupBar: CSSProperties = {
  display: "grid",
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE,
  columnGap: 6,
  alignItems: "center",
  width: "100%",
  boxSizing: "border-box",
};

const rowGridGroupBarEmbed: CSSProperties = {
  ...rowGridGroupBar,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED,
  columnGap: 10,
};

const rowGridGroupBarEmbedIcons: CSSProperties = {
  ...rowGridGroupBar,
  gridTemplateColumns: PRODUCTOS_TABLE_GRID_TEMPLATE_EMBED_ICONS,
  columnGap: 10,
};

const productTableRowPadding = "3px 8px";
/** Modo hielo: mayor ritmo vertical (inventory / Shopify-like). */
const productTableRowPaddingIce = "6px 10px";
const productRowMinHeight = 32;
const productRowMinHeightIce = 40;
/** Divisor de filas en tema claro: menos ruido que --hostly-line pleno */
const PRODUCTOS_ROW_DIVIDER_ICE = "1px solid var(--hostly-table-divider-faint)";

const productGridPriceCell: CSSProperties = {
  justifySelf: "stretch",
  minWidth: 0,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
};

type ProductoEstadoVenta = PlatoCarta & { enCarta?: boolean; isActive?: boolean };

function getPublicationFlags(p: PlatoCarta): {
  isActive: boolean;
  enCarta: boolean;
  status: "onMenu" | "offMenu" | "inactive";
} {
  const raw = p as ProductoEstadoVenta;
  /** Sin campo explícito: el producto cuenta como activo en catálogo; `activo` solo indica visibilidad en carta. */
  const isActive = typeof raw.isActive === "boolean" ? raw.isActive : true;
  const enCarta = typeof raw.enCarta === "boolean" ? raw.enCarta : raw.activo;
  if (!isActive) return { isActive, enCarta, status: "inactive" };
  if (enCarta) return { isActive, enCarta, status: "onMenu" };
  return { isActive, enCarta, status: "offMenu" };
}

function ProductRowPublicationCell({
  p,
  t,
  embedLight = false,
}: {
  p: PlatoCarta;
  t: (key: string) => string;
  embedLight?: boolean;
}) {
  const { status } = getPublicationFlags(p);
  const label =
    status === "onMenu"
      ? t("productos.statusBadgeOnMenu")
      : status === "offMenu"
        ? t("productos.statusBadgeOffMenu")
        : t("productos.statusBadgeInactive");
  const dotColor =
    status === "onMenu" ? "#22c55e" : status === "offMenu" ? "#d97706" : "#ef4444";
  const tone = embedLight
    ? status === "onMenu"
      ? {
          border: "1px solid rgba(148, 163, 184, 0.11)",
          background: "rgba(248, 250, 252, 0.38)",
          color: "#64748b",
        }
      : status === "offMenu"
        ? {
            border: "1px solid rgba(148, 163, 184, 0.095)",
            background: "rgba(248, 250, 252, 0.28)",
            color: "#64748b",
          }
        : {
            border: "1px solid rgba(148, 163, 184, 0.11)",
            background: "rgba(248, 250, 252, 0.32)",
            color: "#64748b",
          }
    : status === "onMenu"
      ? {
          border: "1px solid rgba(74, 222, 128, 0.22)",
          background: "rgba(34, 197, 94, 0.08)",
          color: "#d1fae5",
        }
      : status === "offMenu"
        ? {
            border: "1px solid rgba(251, 191, 36, 0.2)",
            background: "rgba(245, 158, 11, 0.06)",
            color: "#fef3c7",
          }
        : {
            border: "1px solid rgba(248, 113, 113, 0.2)",
            background: "rgba(239, 68, 68, 0.06)",
            color: "#fecaca",
          };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        justifySelf: "stretch",
        width: "100%",
        minWidth: 0,
        padding: "0 1px",
        boxSizing: "border-box",
      }}
    >
      <span
        role="status"
        aria-label={label}
        title={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          maxWidth: "100%",
          boxSizing: "border-box",
          padding: embedLight ? "1px 6px" : "2px 7px",
          borderRadius: embedLight ? 6 : 999,
          fontSize: embedLight ? 8 : 9,
          fontWeight: embedLight ? 500 : 600,
          letterSpacing: embedLight ? "0.06em" : "0.04em",
          textTransform: "uppercase",
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...tone,
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: embedLight ? 4 : 5,
            height: embedLight ? 4 : 5,
            borderRadius: "50%",
            background: dotColor,
            opacity: embedLight ? 0.55 : 1,
            boxShadow: embedLight ? "none" : `0 0 0 1px rgba(15, 23, 42, 0.5)`,
          }}
        />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </span>
    </div>
  );
}

function ProductRowEscandalloCell({
  tiene,
  t,
  embedLight = false,
}: {
  tiene: boolean;
  t: (key: string) => string;
  embedLight?: boolean;
}) {
  const label = tiene ? t("productos.escCon") : t("productos.escSin");
  const escTone = embedLight
    ? tiene
      ? {
          border: "1px solid rgba(148, 163, 184, 0.1)",
          background: "rgba(248, 250, 252, 0.35)",
          color: "#8896a9",
        }
      : {
          border: "1px solid rgba(148, 163, 184, 0.085)",
          background: "rgba(248, 250, 252, 0.28)",
          color: "#8b98ab",
        }
    : tiene
      ? {
          border: "1px solid rgba(148, 163, 184, 0.14)",
          background: "rgba(248, 250, 252, 0.04)",
          color: "#94a3b8",
        }
      : {
          border: "1px solid rgba(71, 85, 105, 0.35)",
          background: "transparent",
          color: "#64748b",
        };
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        justifySelf: "stretch",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <span
        title={label}
        aria-label={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: embedLight ? 3 : 4,
          padding: embedLight ? "1px 5px" : "2px 6px",
          borderRadius: embedLight ? 5 : 5,
          fontSize: embedLight ? 8 : 9,
          fontWeight: embedLight ? 500 : 600,
          letterSpacing: embedLight ? "0.06em" : "0.05em",
          textTransform: "uppercase",
          maxWidth: "100%",
          boxSizing: "border-box",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          ...escTone,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            flexShrink: 0,
            background: embedLight
              ? tiene
                ? "rgba(148, 163, 184, 0.3)"
                : "rgba(148, 163, 184, 0.16)"
              : tiene
                ? "rgba(148, 163, 184, 0.55)"
                : "rgba(71, 85, 105, 0.65)",
          }}
        />
        {label}
      </span>
    </div>
  );
}

const productRowActionBtnShellLight: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  minHeight: 26,
  height: 26,
  padding: "0 6px",
  borderRadius: 6,
  fontSize: 9,
  fontWeight: 520,
  lineHeight: 1,
  whiteSpace: "nowrap",
  boxSizing: "border-box",
  cursor: "pointer",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(255, 255, 255, 0.22)",
  color: "#7b8798",
};

/** Botón icónico hielo (Config → Carta → Productos). */
const productRowIconBtnShellLight: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: 26,
  height: 26,
  padding: 0,
  borderRadius: 7,
  boxSizing: "border-box",
  cursor: "pointer",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  background: "rgba(255, 255, 255, 0.22)",
  color: "#7b8798",
};

function RowActionGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

function IconGlCartaPrimary({ status }: { status: "onMenu" | "offMenu" | "inactive" }) {
  if (status === "inactive") {
    return (
      <RowActionGlyph>
        <path d="M13 2L4 14h6l-1.5 8L20 9h-6.5L13 2z" />
      </RowActionGlyph>
    );
  }
  if (status === "onMenu") {
    return (
      <RowActionGlyph strokeWidth={1.55}>
        <circle cx="12" cy="12" r="8.75" />
        <path d="M8 12h8" />
      </RowActionGlyph>
    );
  }
  return (
    <RowActionGlyph>
      <path d="M12 5v14M5 12h14" />
    </RowActionGlyph>
  );
}

function IconGlPencil() {
  return (
    <RowActionGlyph>
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </RowActionGlyph>
  );
}

function IconGlChart() {
  return (
    <RowActionGlyph>
      <path d="M4 19V10M12 19V6M16 19v-5M20 19v-2" />
    </RowActionGlyph>
  );
}

function IconGlTrash() {
  return (
    <RowActionGlyph>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
      <path d="M10 11v6M14 11v6" />
    </RowActionGlyph>
  );
}

function ProductRowActions({
  p,
  busyEsc,
  t,
  embedLight = false,
  inventoryIconToolbar = false,
  legacyReadOnly = false,
  onEdit,
  onToggleCarta,
  onActivateProduct,
  onEsc,
  onDelete,
}: {
  p: PlatoCarta;
  busyEsc: boolean;
  t: (key: string) => string;
  embedLight?: boolean;
  inventoryIconToolbar?: boolean;
  legacyReadOnly?: boolean;
  onEdit: () => void;
  onToggleCarta: () => void;
  onActivateProduct: () => void;
  onEsc: () => void;
  onDelete: () => void;
}) {
  const { status, enCarta } = getPublicationFlags(p);
  const escEnabled = enCarta && !busyEsc;
  const shell = embedLight ? productRowActionBtnShellLight : productRowActionBtnShell;

  const primaryCartaLabel =
    status === "inactive"
      ? t("productos.actionActivateProduct")
      : status === "onMenu"
        ? t("productos.actionQuitarCarta")
        : t("productos.pubEnCarta");

  const primaryCartaTitle =
    status === "inactive"
      ? t("productos.actionActivateProduct")
      : status === "onMenu"
        ? t("productos.actionQuitarCarta")
        : t("productos.actionVolverCarta");

  const primaryCartaStyle: CSSProperties = embedLight
    ? status === "inactive"
      ? {
          ...shell,
          border: "1px solid rgba(148, 163, 184, 0.28)",
          background: "rgba(255, 255, 255, 0.45)",
          color: "#475569",
          fontWeight: 500,
        }
      : status === "onMenu"
        ? {
            ...shell,
            border: "1px solid rgba(148, 163, 184, 0.3)",
            background: "rgba(255, 255, 255, 0.4)",
            color: "#64748b",
            fontWeight: 500,
          }
        : {
            ...shell,
            border: "1px solid rgba(148, 163, 184, 0.28)",
            background: "rgba(255, 255, 255, 0.45)",
            color: "#64748b",
            fontWeight: 500,
          }
    : status === "inactive"
      ? {
          ...productRowActionBtnShell,
          border: "1px solid rgba(56, 189, 248, 0.28)",
          background: "rgba(8, 47, 73, 0.32)",
          color: "#bae6fd",
          fontWeight: 600,
        }
      : status === "onMenu"
        ? {
            ...productRowActionBtnShell,
            border: "1px solid rgba(251, 191, 36, 0.28)",
            background: "rgba(245, 158, 11, 0.08)",
            color: "#fde68a",
          }
        : {
            ...productRowActionBtnShell,
            border: "1px solid rgba(74, 222, 128, 0.28)",
            background: "rgba(34, 197, 94, 0.08)",
            color: "#bbf7d0",
          };

  const primaryCartaIconStyle: CSSProperties =
    status === "inactive"
      ? {
          ...productRowIconBtnShellLight,
          border: "1px solid rgba(56, 189, 248, 0.22)",
          background: "rgba(224, 242, 254, 0.55)",
          color: "#0369a1",
        }
      : status === "onMenu"
        ? {
            ...productRowIconBtnShellLight,
            border: "1px solid rgba(251, 191, 36, 0.28)",
            background: "rgba(255, 251, 235, 0.65)",
            color: "#b45309",
          }
        : {
            ...productRowIconBtnShellLight,
            border: "1px solid rgba(74, 222, 128, 0.24)",
            background: "rgba(220, 252, 231, 0.55)",
            color: "#166534",
          };

  const onPrimaryCarta = status === "inactive" ? onActivateProduct : onToggleCarta;

  const escLabel = busyEsc ? t("carta.escPending") : t("carta.actionEscandallo");
  const escTitle =
    busyEsc ? t("carta.escPending") : !enCarta ? t("productos.escNeedCartaHint") : t("carta.actionEscandallo");

  const editBlockedTitle = legacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : t("carta.actionEdit");
  const deleteBlockedTitle = legacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : t("common.delete");
  const cartaBlockedTitle = legacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : primaryCartaTitle;

  if (inventoryIconToolbar && embedLight) {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "nowrap",
          gap: 2,
          justifyContent: "flex-end",
          alignItems: "center",
          justifySelf: "stretch",
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          disabled={legacyReadOnly}
          onClick={legacyReadOnly ? undefined : onPrimaryCarta}
          style={{
            ...primaryCartaIconStyle,
            ...(legacyReadOnly ? { opacity: 0.45, cursor: "not-allowed" } : {}),
          }}
          title={cartaBlockedTitle}
          aria-label={cartaBlockedTitle}
        >
          <IconGlCartaPrimary status={status} />
        </button>

        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          disabled={legacyReadOnly}
          onClick={legacyReadOnly ? undefined : onEdit}
          style={{
            ...productRowIconBtnShellLight,
            ...(legacyReadOnly ? { opacity: 0.45, cursor: "not-allowed" } : {}),
          }}
          title={editBlockedTitle}
          aria-label={editBlockedTitle}
        >
          <IconGlPencil />
        </button>

        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          disabled={!escEnabled}
          title={escTitle}
          aria-label={escLabel}
          onClick={onEsc}
          style={{
            ...productRowIconBtnShellLight,
            cursor: escEnabled ? "pointer" : "not-allowed",
          }}
        >
          <IconGlChart />
        </button>

        <button
          type="button"
          className={PRODUCTOS_ROW_ICON_BTN_CLASS}
          disabled={legacyReadOnly}
          onClick={legacyReadOnly ? undefined : onDelete}
          style={{
            ...productRowIconBtnShellLight,
            border: "1px solid rgba(248, 113, 113, 0.22)",
            background: "rgba(254, 242, 242, 0.45)",
            color: "#b91c1c",
            ...(legacyReadOnly ? { opacity: 0.45, cursor: "not-allowed" } : {}),
          }}
          title={deleteBlockedTitle}
          aria-label={deleteBlockedTitle}
        >
          <IconGlTrash />
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "nowrap",
        gap: 3,
        justifyContent: "flex-end",
        alignItems: "center",
        justifySelf: "stretch",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onPrimaryCarta}
        style={{
          ...primaryCartaStyle,
          ...(legacyReadOnly ? { opacity: 0.45, cursor: "not-allowed" } : {}),
        }}
        title={cartaBlockedTitle}
        aria-label={cartaBlockedTitle}
      >
        {primaryCartaLabel}
      </button>

      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onEdit}
        style={{
          ...shell,
          ...(legacyReadOnly ? { opacity: 0.45, cursor: "not-allowed" } : {}),
        }}
        title={editBlockedTitle}
        aria-label={editBlockedTitle}
      >
        {t("carta.actionEdit")}
      </button>

      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        disabled={!escEnabled}
        title={escTitle}
        aria-label={escLabel}
        onClick={onEsc}
        style={{
          ...shell,
          cursor: escEnabled ? "pointer" : "not-allowed",
        }}
      >
        {escLabel}
      </button>

      <button
        type="button"
        className={PRODUCTOS_ROW_TEXT_BTN_CLASS}
        disabled={legacyReadOnly}
        onClick={legacyReadOnly ? undefined : onDelete}
        style={{
          ...shell,
          border: embedLight ? "1px solid rgba(148, 163, 184, 0.22)" : "1px solid rgba(248, 113, 113, 0.28)",
          background: embedLight ? "transparent" : "rgba(127, 29, 29, 0.12)",
          color: embedLight ? "#94a3b8" : "#fca5a5",
          ...(legacyReadOnly ? { opacity: 0.45, cursor: "not-allowed" } : {}),
        }}
        title={deleteBlockedTitle}
        aria-label={deleteBlockedTitle}
      >
        {t("common.delete")}
      </button>
    </div>
  );
}

type AdvancedFormPendingImageSnapshot = {
  name: string;
  size: number;
  lastModified: number;
};

type AdvancedFormImagePersistableSnapshot = {
  mode: "central" | "legacy";
  legacyFotoUrl: string;
  existingImagePath: string;
  removeImage: boolean;
  pendingFile: AdvancedFormPendingImageSnapshot | null;
};

type AdvancedFormRecipeRowPersistableSnapshot = {
  productId: string;
  quantity: string;
  unit: string;
};

type AdvancedProductFormBaselineSnapshot = {
  nombre: string;
  precio: string;
  tipoVenta: TipoProductoVenta;
  categoriaCartaId: string | null;
  productFamilyId: string;
  operationStationSelect: string;
  draftCourse: string;
  productCompositionType: ProductCompositionType;
  activo: boolean;
  modifierGroupIds: readonly string[];
  descripcion: string;
  image: AdvancedFormImagePersistableSnapshot;
  recipeEnabled: boolean;
  recipeRows: readonly AdvancedFormRecipeRowPersistableSnapshot[];
};

type AdvancedFormSnapshotCompareContext = {
  modifierGroups: readonly ModifierGroupDocument[];
  skipsMenuCourse: boolean;
};

type AdvancedProductFormPersistableSnapshot = {
  nombre: string;
  precio: string;
  tipoVenta: TipoProductoVenta;
  categoriaCartaId: string | null;
  productFamilyId: string;
  operationStationSelect: string;
  course: string;
  productCompositionType: ProductCompositionType;
  activo: boolean;
  modifierGroupIds: readonly string[];
  descripcion: string;
  image: AdvancedFormImagePersistableSnapshot;
  recipeEnabled: boolean;
  recipeRows: readonly AdvancedFormRecipeRowPersistableSnapshot[];
};

type AdvancedFormSnapshotBuildInput = {
  isCentralCatalog: boolean;
  draftNombre: string;
  draftPrecio: string;
  draftTipo: TipoProductoVenta;
  draftCategoriaCartaId: string | null;
  draftProductFamilyId: string;
  draftOperationStationSelect: string;
  draftCourse: string;
  draftProductCompositionType: ProductCompositionType;
  draftActivo: boolean;
  draftModifierGroupIds: readonly string[];
  draftDesc: string;
  draftFoto: string;
  draftExistingImagePath: string | undefined;
  draftRemoveImage: boolean;
  draftPendingImageFile: File | null;
  draftRecipeEnabled: boolean;
  draftRecipeRows: readonly RecipeIngredientDraftRow[];
  skipsMenuCourse: boolean;
  modifierGroups: readonly ModifierGroupDocument[];
};

function normalizeAdvancedFormPrecioSnapshot(value: string): string {
  const parsed = parseProductPrecio(value);
  return parsed == null ? value.trim() : String(parsed);
}

function normalizeAdvancedFormRecipeQuantityComparable(value: string): string {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed) && parsed > 0) return String(parsed);
  return value.trim();
}

function mapAdvancedFormRecipeRowsBaseline(
  rows: readonly RecipeIngredientDraftRow[],
): AdvancedFormRecipeRowPersistableSnapshot[] {
  return rows
    .filter((row) => row.productId.trim().length > 0)
    .map((row) => ({
      productId: row.productId.trim(),
      quantity: row.quantity.trim(),
      unit: row.unit,
    }));
}

function normalizeAdvancedFormCourseComparable(
  rawCourse: string,
  skipsMenuCourse: boolean,
): string {
  return skipsMenuCourse ? "" : rawCourse.trim();
}

function normalizeAdvancedFormModifierGroupIdsComparable(
  rawIds: readonly string[],
  modifierGroups: readonly ModifierGroupDocument[],
): string[] {
  return sanitizeModifierGroupIdsForSave(rawIds, modifierGroups).slice().sort();
}

function buildAdvancedFormImagePersistableSnapshot(
  input: Pick<
    AdvancedFormSnapshotBuildInput,
    "isCentralCatalog" | "draftFoto" | "draftExistingImagePath" | "draftRemoveImage" | "draftPendingImageFile"
  >,
): AdvancedFormImagePersistableSnapshot {
  if (input.isCentralCatalog) {
    return {
      mode: "central",
      legacyFotoUrl: "",
      existingImagePath: input.draftExistingImagePath?.trim() ?? "",
      removeImage: input.draftRemoveImage,
      pendingFile: input.draftPendingImageFile
        ? {
            name: input.draftPendingImageFile.name,
            size: input.draftPendingImageFile.size,
            lastModified: input.draftPendingImageFile.lastModified,
          }
        : null,
    };
  }
  return {
    mode: "legacy",
    legacyFotoUrl: input.draftFoto.trim(),
    existingImagePath: "",
    removeImage: false,
    pendingFile: null,
  };
}

function captureAdvancedFormBaselineSnapshot(
  input: AdvancedFormSnapshotBuildInput,
): AdvancedProductFormBaselineSnapshot {
  return {
    nombre: input.draftNombre.trim(),
    precio: input.draftPrecio.trim(),
    tipoVenta: input.draftTipo,
    categoriaCartaId: input.draftCategoriaCartaId,
    productFamilyId: input.draftProductFamilyId.trim(),
    operationStationSelect: input.draftOperationStationSelect.trim(),
    draftCourse: input.draftCourse.trim(),
    productCompositionType: normalizeProductCompositionType(
      input.draftProductCompositionType,
    ),
    activo: input.draftActivo,
    modifierGroupIds: [...input.draftModifierGroupIds],
    descripcion: input.draftDesc.trim(),
    image: buildAdvancedFormImagePersistableSnapshot(input),
    recipeEnabled: input.draftRecipeEnabled,
    recipeRows: mapAdvancedFormRecipeRowsBaseline(input.draftRecipeRows),
  };
}

function buildAdvancedFormComparableSnapshot(
  source: AdvancedProductFormBaselineSnapshot,
  context: AdvancedFormSnapshotCompareContext,
): AdvancedProductFormPersistableSnapshot {
  return {
    nombre: source.nombre,
    precio: normalizeAdvancedFormPrecioSnapshot(source.precio),
    tipoVenta: source.tipoVenta,
    categoriaCartaId: source.categoriaCartaId,
    productFamilyId: source.productFamilyId,
    operationStationSelect: source.operationStationSelect,
    course: normalizeAdvancedFormCourseComparable(
      source.draftCourse,
      context.skipsMenuCourse,
    ),
    productCompositionType: source.productCompositionType,
    activo: source.activo,
    modifierGroupIds: normalizeAdvancedFormModifierGroupIdsComparable(
      source.modifierGroupIds,
      context.modifierGroups,
    ),
    descripcion: source.descripcion,
    image: source.image,
    recipeEnabled: source.recipeEnabled,
    recipeRows: source.recipeRows.map((row) => ({
      productId: row.productId,
      quantity: normalizeAdvancedFormRecipeQuantityComparable(row.quantity),
      unit: row.unit,
    })),
  };
}

function buildAdvancedFormComparableSnapshotFromInput(
  input: AdvancedFormSnapshotBuildInput,
  context: AdvancedFormSnapshotCompareContext,
): AdvancedProductFormPersistableSnapshot {
  return buildAdvancedFormComparableSnapshot(
    captureAdvancedFormBaselineSnapshot(input),
    context,
  );
}

function areAdvancedFormPendingImagesEqual(
  left: AdvancedFormPendingImageSnapshot | null,
  right: AdvancedFormPendingImageSnapshot | null,
): boolean {
  if (left == null || right == null) return left === right;
  return (
    left.name === right.name &&
    left.size === right.size &&
    left.lastModified === right.lastModified
  );
}

function areAdvancedFormImagesEqual(
  left: AdvancedFormImagePersistableSnapshot,
  right: AdvancedFormImagePersistableSnapshot,
): boolean {
  return (
    left.mode === right.mode &&
    left.legacyFotoUrl === right.legacyFotoUrl &&
    left.existingImagePath === right.existingImagePath &&
    left.removeImage === right.removeImage &&
    areAdvancedFormPendingImagesEqual(left.pendingFile, right.pendingFile)
  );
}

function areAdvancedFormRecipeRowsEqual(
  left: readonly AdvancedFormRecipeRowPersistableSnapshot[],
  right: readonly AdvancedFormRecipeRowPersistableSnapshot[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (row, index) =>
      row.productId === right[index]?.productId &&
      row.quantity === right[index]?.quantity &&
      row.unit === right[index]?.unit,
  );
}

function areAdvancedProductFormPersistableSnapshotsEqual(
  left: AdvancedProductFormPersistableSnapshot,
  right: AdvancedProductFormPersistableSnapshot,
): boolean {
  if (left.modifierGroupIds.length !== right.modifierGroupIds.length) return false;
  return (
    left.nombre === right.nombre &&
    left.precio === right.precio &&
    left.tipoVenta === right.tipoVenta &&
    left.categoriaCartaId === right.categoriaCartaId &&
    left.productFamilyId === right.productFamilyId &&
    left.operationStationSelect === right.operationStationSelect &&
    left.course === right.course &&
    left.productCompositionType === right.productCompositionType &&
    left.activo === right.activo &&
    left.descripcion === right.descripcion &&
    left.recipeEnabled === right.recipeEnabled &&
    left.modifierGroupIds.every((id, index) => id === right.modifierGroupIds[index]) &&
    areAdvancedFormImagesEqual(left.image, right.image) &&
    areAdvancedFormRecipeRowsEqual(left.recipeRows, right.recipeRows)
  );
}

function isVisibleFocusDestination(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if (element.hasAttribute("hidden")) return false;
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hasAttribute("hidden")) return false;
    if (ancestor.getAttribute("aria-hidden") === "true") return false;
  }
  if (element.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(element);
  if (style.visibility === "hidden" || style.display === "none") return false;
  return true;
}

function isFocusableFocusDestination(element: HTMLElement): boolean {
  if (element.matches(":disabled") || element.getAttribute("aria-disabled") === "true") {
    return false;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
  ) {
    if (element.disabled) return false;
  }
  if (
    element.tabIndex < 0 &&
    !element.matches("input, select, textarea, button, a[href], summary")
  ) {
    return false;
  }
  return true;
}

function isValidFocusDestination(element: HTMLElement): boolean {
  return isVisibleFocusDestination(element) && isFocusableFocusDestination(element);
}

function tryFocusElement(target: HTMLElement): boolean {
  if (!isValidFocusDestination(target)) return false;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

function isAdvancedFormDrawerFocusTarget(
  element: HTMLElement,
  drawerRoot: HTMLElement,
): boolean {
  if (!drawerRoot.contains(element)) return false;
  return isValidFocusDestination(element);
}

function captureAdvancedFormDrawerFocusTarget(
  drawerRoot: HTMLElement | null,
): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !drawerRoot) return null;
  if (!isAdvancedFormDrawerFocusTarget(active, drawerRoot)) return null;
  return active;
}

function isAddCategoryOpenerFocusTarget(element: HTMLElement): boolean {
  return isValidFocusDestination(element);
}

type AdvancedFormDrawerFocusRestoreFallback = "saved" | "active-tab" | "drawer-container";

function restoreAdvancedFormDrawerFocus(
  savedTarget: HTMLElement | null,
  drawerRoot: HTMLElement | null,
): AdvancedFormDrawerFocusRestoreFallback {
  if (
    savedTarget &&
    drawerRoot &&
    isAdvancedFormDrawerFocusTarget(savedTarget, drawerRoot) &&
    tryFocusElement(savedTarget)
  ) {
    return "saved";
  }

  const activeTabButton = drawerRoot?.querySelector(
    '.hostly-product-form-drawer-tabs__tab[aria-selected="true"]',
  );
  if (
    activeTabButton instanceof HTMLElement &&
    drawerRoot &&
    isAdvancedFormDrawerFocusTarget(activeTabButton, drawerRoot) &&
    tryFocusElement(activeTabButton)
  ) {
    return "active-tab";
  }

  if (drawerRoot && isVisibleFocusDestination(drawerRoot)) {
    drawerRoot.focus({ preventScroll: true });
    if (document.activeElement === drawerRoot) {
      return "drawer-container";
    }
  }

  return "drawer-container";
}

function ProductAdvancedFormDiscardConfirm({
  open,
  saving,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  saving: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const keepEditingRef = useRef<HTMLButtonElement | null>(null);
  const discardRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    keepEditingRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onKeepEditing();
        return;
      }
      if (event.key !== "Tab") return;

      const keepEditing = keepEditingRef.current;
      const discard = discardRef.current;
      if (!keepEditing || !discard) return;

      const focusables = [keepEditing, discard];
      const active = document.activeElement;
      const currentIndex = focusables.indexOf(active as HTMLButtonElement);

      if (currentIndex === -1) {
        event.preventDefault();
        keepEditing.focus();
        return;
      }

      event.preventDefault();
      const nextIndex = event.shiftKey
        ? currentIndex === 0
          ? focusables.length - 1
          : currentIndex - 1
        : currentIndex === focusables.length - 1
          ? 0
          : currentIndex + 1;
      focusables[nextIndex]?.focus();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onKeepEditing]);

  if (!open) return null;

  return (
    <div
      className="hostly-productos-bulk-course-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onKeepEditing();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hostly-product-form-discard-title"
        aria-describedby="hostly-product-form-discard-message"
        className="hostly-productos-bulk-course-modal"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2
          id="hostly-product-form-discard-title"
          className="hostly-productos-bulk-course-modal__title"
        >
          ¿Descartar cambios?
        </h2>
        <p
          id="hostly-product-form-discard-message"
          className="hostly-productos-bulk-course-modal__hint"
        >
          Perderás los cambios que todavía no has guardado.
        </p>
        <div className="hostly-productos-bulk-course-modal__actions">
          <button
            ref={keepEditingRef}
            type="button"
            className="hostly-button-secondary hostly-button-compact"
            disabled={saving}
            onClick={onKeepEditing}
          >
            Seguir editando
          </button>
          <button
            ref={discardRef}
            type="button"
            className="hostly-button-danger hostly-button-compact"
            disabled={saving}
            onClick={onDiscard}
          >
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}

export type ProductosManagementPageProps = {
  /** Dentro del layout Config (franja superior); el shell usa altura flexible en lugar de 100dvh. */
  lockViewportFillParent?: boolean;
  /** Vista alineada con Configuración: shell claro, tabla y chips legibles sobre fondo global. */
  embedConfigVisual?: boolean;
  /**
   * `/dashboard/productos`: mismo tratamiento visual “hielo” que en Config, manteniendo enlaces a rutas de carta (no a Config).
   */
  dashboardListIceVisual?: boolean;
};

export default function ProductosManagementPage({
  lockViewportFillParent = false,
  embedConfigVisual = false,
  dashboardListIceVisual = false,
}: ProductosManagementPageProps = {}) {
  const { t, locale } = useI18n();
  const { restaurantId: profileRestaurantId, profileReady } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const recipeDeepLinkHandledRef = useRef<string | null>(null);
  const emb = Boolean(embedConfigVisual);
  const iceVisual = emb || Boolean(dashboardListIceVisual);
  /** Solo /dashboard/configuracion/carta/productos — ruta explícita, no depender solo del prop */
  const isConfigCartaProductosRoute =
    pathname === "/dashboard/configuracion/carta/productos" ||
    pathname.endsWith("/configuracion/carta/productos");
  const configCartaProductosChrome = isConfigCartaProductosRoute && iceVisual;
  const iceProductosDataGridStyle = iceVisual ? (configCartaProductosChrome ? rowGridEmbedIcons : rowGridEmbed) : rowGrid;
  const iceProductosGroupBarGridStyle = iceVisual
    ? configCartaProductosChrome
      ? rowGridGroupBarEmbedIcons
      : rowGridGroupBarEmbed
    : rowGridGroupBar;
  const productosTableMinInnerWidthPx =
    iceVisual && configCartaProductosChrome ? PRODUCTOS_TABLE_MIN_WIDTH_EMBED_ICONS_PX : PRODUCTOS_TABLE_MIN_WIDTH_PX;
  /** Tenant Firestore/API: solo `restaurantId` del perfil autenticado (sin localStorage/"default"). */
  const tenantRestaurantId = useMemo(() => {
    if (!profileReady) return null;
    const rid = profileRestaurantId?.trim();
    return rid || null;
  }, [profileReady, profileRestaurantId]);
  const operationalRestaurantId = tenantRestaurantId ?? "";
  const operationalCatalog = useCentralProductsForCarta(tenantRestaurantId, {
    scope: "management",
    requireAuthenticatedTenant: true,
  });
  const isCentralCatalog = operationalCatalog.source === "central";
  const isLegacyCatalog =
    operationalCatalog.source === "legacy_local" ||
    operationalCatalog.source === "legacy_fallback";
  const isLegacyReadOnly =
    isLegacyCatalog &&
    operationalCatalog.source !== null &&
    !operationalCatalog.loading;
  const [hydrated, setHydrated] = useState(false);
  const [items, setItems] = useState<PlatoCarta[]>([]);
  const [meta, setMeta] = useState<EscandalloMetaMap>(new Map());
  const [listFilter, setListFilter] = useState<CartaFilter>("todos");
  const [catalogFoodDrinkSegment, setCatalogFoodDrinkSegment] =
    useState<CatalogFoodDrinkSegment>("all");
  const [listSearch, setListSearch] = useState("");
  const [configCartaAdvancedOpen, setConfigCartaAdvancedOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped");
  const [categoryTab, setCategoryTab] = useState<string>(PRODUCT_CATEGORY_ALL_ID);
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [editFocus, setEditFocus] = useState<ProductEditFocus | null>(null);
  const [productFormTab, setProductFormTab] = useState<ProductFormDrawerTabId>("producto");
  const routingFocusRef = useRef<HTMLDivElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNombre, setDraftNombre] = useState("");
  const [draftTipo, setDraftTipo] = useState<TipoProductoVenta>("plato");
  const [draftProductCompositionType, setDraftProductCompositionType] =
    useState<ProductCompositionType>(DEFAULT_PRODUCT_COMPOSITION_TYPE);
  const [cartaCategorias, setCartaCategorias] = useState<CartaCategoria[]>([]);
  const [productFamilies, setProductFamilies] = useState<ProductFamilyDocument[]>([]);
  const [cartaFamilias, setCartaFamilias] = useState<CartaFamilia[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupDocument[]>([]);
  const [modifierFamilies, setModifierFamilies] = useState<ModifierFamilyRow[]>([]);
  const [parityCatalogsLoaded, setParityCatalogsLoaded] = useState(false);
  const [resolverParityFilter, setResolverParityFilter] =
    useState<ResolverParityFilterId>("all");
  const [draftCategoriaCartaId, setDraftCategoriaCartaId] = useState<string | null>(null);
  const [draftCartaMenuFamiliaId, setDraftCartaMenuFamiliaId] = useState<string | null>(null);
  const [draftFamilyOverrideOpen, setDraftFamilyOverrideOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCatName, setAddCatName] = useState("");
  const [addCatType, setAddCatType] = useState<CartaCategoriaTipo>("general");
  const [addCatCartaFamiliaId, setAddCatCartaFamiliaId] = useState<string | undefined>(undefined);
  const [addCatSaving, setAddCatSaving] = useState(false);
  const [draftPrecio, setDraftPrecio] = useState("");
  const [draftActivo, setDraftActivo] = useState(true);
  const [draftFoto, setDraftFoto] = useState("");
  const [draftImagePreviewUrl, setDraftImagePreviewUrl] = useState<string | null>(
    null,
  );
  const [draftPendingImageFile, setDraftPendingImageFile] = useState<File | null>(
    null,
  );
  const [draftExistingImagePath, setDraftExistingImagePath] = useState<
    string | undefined
  >(undefined);
  const [draftRemoveImage, setDraftRemoveImage] = useState(false);
  const draftImageFileInputRef = useRef<HTMLInputElement | null>(null);
  const [draftDesc, setDraftDesc] = useState("");
  const [draftOperationStationSelect, setDraftOperationStationSelect] =
    useState("default-kitchen");
  const [draftCourse, setDraftCourse] = useState("");
  const [draftProductFamilyId, setDraftProductFamilyId] = useState(
    CATEGORY_PRODUCT_FAMILY_NONE,
  );
  const [draftModifierGroupIds, setDraftModifierGroupIds] = useState<string[]>([]);
  const [operationStations, setOperationStations] = useState<
    OperationStationDocument[]
  >([]);
  const productFormSubmitMessages = useMemo(
    () => ({
      errorNombre: t("carta.errorNombre"),
      errorPrecio: t("carta.errorPrecio"),
      errorCategoriaTipo: t("carta.errorCategoriaTipo"),
    }),
    [t],
  );
  const productTableInlineEdit = useMemo(
    () => ({
      enabled: isCentralCatalog && !isLegacyReadOnly,
      restaurantId: operationalRestaurantId,
      isCentralCatalog,
      messages: {
        errorNombre: productFormSubmitMessages.errorNombre,
        errorPrecio: productFormSubmitMessages.errorPrecio,
      },
      onError: (message: string) => setFormError(message),
    }),
    [
      isCentralCatalog,
      isLegacyReadOnly,
      operationalRestaurantId,
      productFormSubmitMessages.errorNombre,
      productFormSubmitMessages.errorPrecio,
    ],
  );
  const quickCreate = useProductQuickCreate({
    restaurantId: operationalRestaurantId,
    cartaCategorias,
    operationStations,
    productFamilies,
    modifierGroups,
    inventoryProducts: [],
    isCentralCatalog,
    messages: productFormSubmitMessages,
  });
  /** Fetch único (sin listener): paridad resolver en tooltip Routing. */
  const [productionStations, setProductionStations] = useState<
    ProductionStationDocument[]
  >([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [escNavId, setEscNavId] = useState<string | null>(null);
  const {
    selectedIds,
    setSelectedIds,
    selectAllRef,
    toggleRowSelected,
    clearSelection,
    toggleSelectAllDisplayed: toggleSelectAllDisplayedBase,
  } = useProductosSelection();
  const nombreInputRef = useRef<HTMLInputElement | null>(null);
  const advancedFormDrawerRef = useRef<HTMLElement | null>(null);
  const advancedFormDiscardFocusRestoreRef = useRef<HTMLElement | null>(null);
  const advancedFormDiscardFocusPendingRef = useRef(false);
  const addCategoryOpenerRef = useRef<HTMLElement | null>(null);
  const addCategoryFocusRestorePendingRef = useRef(false);
  const addCategoryRestoreViaDrawerFallbackRef = useRef(false);
  /** Oculta al instante productos borrados hasta que el snapshot central confirme el delete. */
  const pendingRemovedProductIdsRef = useRef<Set<string>>(new Set());
  const configListFilterInitRef = useRef(false);
  const [drawerSyncing, setDrawerSyncing] = useState(false);
  const [draftRecipeEnabled, setDraftRecipeEnabled] = useState(false);
  const [draftRecipeRows, setDraftRecipeRows] = useState<RecipeIngredientDraftRow[]>([]);
  const draftRecipeEnabledRef = useRef(draftRecipeEnabled);
  const draftRecipeRowsRef = useRef(draftRecipeRows);
  draftRecipeEnabledRef.current = draftRecipeEnabled;
  draftRecipeRowsRef.current = draftRecipeRows;
  const [formSessionToken, setFormSessionToken] = useState(0);
  const formSessionTokenRef = useRef(0);
  const [discardFormConfirmOpen, setDiscardFormConfirmOpen] = useState(false);
  const advancedFormBaselineRef = useRef<AdvancedProductFormBaselineSnapshot | null>(null);
  const pendingAdvancedFormBaselineSessionRef = useRef<number | null>(null);
  const advancedFormSnapshotBuildInputRef = useRef<AdvancedFormSnapshotBuildInput>({
    isCentralCatalog: false,
    draftNombre: "",
    draftPrecio: "",
    draftTipo: "plato",
    draftCategoriaCartaId: null,
    draftProductFamilyId: CATEGORY_PRODUCT_FAMILY_NONE,
    draftOperationStationSelect: "default-kitchen",
    draftCourse: "",
    draftProductCompositionType: DEFAULT_PRODUCT_COMPOSITION_TYPE,
    draftActivo: true,
    draftModifierGroupIds: [],
    draftDesc: "",
    draftFoto: "",
    draftExistingImagePath: undefined,
    draftRemoveImage: false,
    draftPendingImageFile: null,
    draftRecipeEnabled: false,
    draftRecipeRows: [],
    skipsMenuCourse: false,
    modifierGroups: [],
  });
  const [escandalloModalOpen, setEscandalloModalOpen] = useState(false);
  const [commercialInfoModalOpen, setCommercialInfoModalOpen] = useState(false);
  const [inventoryLookup, setInventoryLookup] = useState<InventoryProductLookup[]>([]);
  const [centralDocsById, setCentralDocsById] = useState(
    () => new Map<string, ProductDocument>(),
  );
  const [bulkAssignCourseOpen, setBulkAssignCourseOpen] = useState(false);
  const [bulkAssignCourseSaving, setBulkAssignCourseSaving] = useState(false);
  const [bulkAssignDestinationOpen, setBulkAssignDestinationOpen] = useState(false);
  const [bulkAssignDestinationSaving, setBulkAssignDestinationSaving] = useState(false);
  const [bulkAssignCategoryOpen, setBulkAssignCategoryOpen] = useState(false);
  const [bulkAssignCategorySaving, setBulkAssignCategorySaving] = useState(false);
  const [bulkAssignFamilyOpen, setBulkAssignFamilyOpen] = useState(false);
  const [bulkAssignFamilySaving, setBulkAssignFamilySaving] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteSaving, setBulkDeleteSaving] = useState(false);
  const [deleteChoiceProduct, setDeleteChoiceProduct] = useState<PlatoCarta | null>(null);
  const [deleteChoiceBusy, setDeleteChoiceBusy] = useState(false);

  const persist = useCallback(
    (next: PlatoCarta[]) => {
      if (isCentralCatalog) return;
      // Fase 10C: catálogo legacy solo lectura — no escribir localStorage.
      void next;
    },
    [isCentralCatalog],
  );

  useEffect(() => {
    if (!tenantRestaurantId) return;
    void bootstrapPlatosFromEscandallosIfEmpty(tenantRestaurantId);
  }, [tenantRestaurantId]);

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId || !isCentralCatalog) {
      setOperationStations([]);
      return;
    }
    const rid = tenantRestaurantId;
    let defaultsEnsured = false;
    const unsub = listenOperationStations(
      rid,
      (list) => {
        setOperationStations(list);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          void ensureDefaultOperationStations(rid).catch((e) =>
            console.error("ensureDefaultOperationStations", e),
          );
        }
      },
      (e) => console.error("listenOperationStations", e),
    );
    return () => unsub();
  }, [profileReady, tenantRestaurantId, isCentralCatalog]);

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId || !isCentralCatalog) {
      setProductFamilies([]);
      return;
    }
    const rid = tenantRestaurantId;
    let defaultsEnsured = false;
    const unsub = listenProductFamilies(
      rid,
      (list) => {
        setProductFamilies(list);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          void ensureDefaultProductFamilies(rid).catch((e) =>
            console.error("ensureDefaultProductFamilies", e),
          );
        }
      },
      (e) => console.error("listenProductFamilies", e),
    );
    return () => unsub();
  }, [profileReady, tenantRestaurantId, isCentralCatalog]);

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId || !isCentralCatalog) {
      setCentralDocsById(new Map());
      return;
    }
    const rid = tenantRestaurantId;
    return listenCentralProducts(
      rid,
      (docs) => {
        setCentralDocsById(new Map(docs.map((doc) => [doc.id, doc])));
      },
      (e) => console.error("listenCentralProducts(recipe)", e),
    );
  }, [profileReady, tenantRestaurantId, isCentralCatalog]);

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId || !isCentralCatalog || !formOpen) {
      setInventoryLookup([]);
      return;
    }
    const rid = tenantRestaurantId;
    return listenProductsForInventory(
      rid,
      (docs) => {
        setInventoryLookup(productDocumentsToInventoryLookup(docs));
      },
      (e) => console.error("listenProductsForInventory(recipe)", e),
    );
  }, [profileReady, tenantRestaurantId, isCentralCatalog, formOpen]);

  useEffect(() => {
    if (!configCartaProductosChrome || configListFilterInitRef.current) return;
    configListFilterInitRef.current = true;
    setListFilter("activos");
  }, [configCartaProductosChrome]);

  useEffect(() => {
    if (!profileReady || operationalCatalog.loading) return;
    queueMicrotask(() => {
      const pendingRemoved = pendingRemovedProductIdsRef.current;
      if (operationalCatalog.tenantUnavailable) {
        setItems([]);
        setHydrated(true);
        return;
      }
      for (const id of [...pendingRemoved]) {
        if (!operationalCatalog.platos.some((p) => p.id === id)) {
          pendingRemoved.delete(id);
        }
      }
      setItems(
        operationalCatalog.platos.filter((p) => !pendingRemoved.has(p.id)),
      );
      setHydrated(true);
    });
  }, [
    operationalCatalog.loading,
    operationalCatalog.platos,
    operationalCatalog.tenantUnavailable,
    profileReady,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (operationalCatalog.source === "central") return;
    if (!tenantRestaurantId) return;
    let alive = true;
    const onChange = () => {
      queueMicrotask(() => {
        if (!alive) return;
        setItems(loadPlatos(tenantRestaurantId));
      });
    };
    window.addEventListener(PLATOS_CHANGED_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(PLATOS_CHANGED_EVENT, onChange);
    };
  }, [operationalCatalog.source, tenantRestaurantId]);

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId) {
      setModifierGroups([]);
      return;
    }
    return listenModifierGroups(
      tenantRestaurantId,
      setModifierGroups,
      console.error,
    );
  }, [profileReady, tenantRestaurantId]);

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId) {
      setCartaCategorias([]);
      setCartaFamilias([]);
      setModifierFamilies([]);
      setProductionStations([]);
      setParityCatalogsLoaded(false);
      return;
    }
    let cancelled = false;
    setParityCatalogsLoaded(false);
    const rid = tenantRestaurantId;
    void Promise.all([
      fetchCartaCategorias(rid),
      fetchCartaFamilias(rid),
      fetchModifierFamiliesForRestaurante(rid),
      listProductionStations(rid),
    ]).then(([list, fams, mods, prodStations]) => {
      if (cancelled) return;
      queueMicrotask(() => {
        if (cancelled) return;
        setCartaCategorias(list);
        setCartaFamilias(fams);
        setModifierFamilies(mods);
        setProductionStations(prodStations);
        setParityCatalogsLoaded(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [profileReady, tenantRestaurantId]);

  const parityCatalogSources = useMemo(
    () => ({
      operationStations,
      productionStations,
      cartaCategorias,
      cartaFamilias,
    }),
    [operationStations, productionStations, cartaCategorias, cartaFamilias],
  );

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId) return;
    let alive = true;
    const onCat = () => {
      const rid = tenantRestaurantId;
      void Promise.all([
        fetchCartaCategorias(rid),
        fetchCartaFamilias(rid),
        fetchModifierFamiliesForRestaurante(rid),
        listProductionStations(rid),
      ]).then(([list, fams, mods, prodStations]) => {
        if (!alive) return;
        queueMicrotask(() => {
          if (!alive) return;
          setCartaCategorias(list);
          setCartaFamilias(fams);
          setModifierFamilies(mods);
          setProductionStations(prodStations);
        });
      });
    };
    window.addEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
    return () => {
      alive = false;
      window.removeEventListener(CARTA_CATEGORIAS_CHANGED_EVENT, onCat);
    };
  }, [profileReady, tenantRestaurantId]);

  useEffect(() => {
    let cancelled = false;
    const ids = items.map((p) => p.escandalloSupabaseId).filter((x): x is number => x != null);
    if (ids.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) setMeta(new Map());
      });
      return () => {
        cancelled = true;
      };
    }
    void fetchEscandalloMetaForIds(ids).then((m) => {
      if (cancelled) return;
      queueMicrotask(() => {
        if (!cancelled) setMeta(m);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const tieneEscandalloForPlato = useCallback(
    (p: PlatoCarta, escMeta: EscandalloMetaMap = meta) =>
      resolvePlatoTieneEscandallo(
        p,
        escMeta,
        isCentralCatalog ? centralDocsById.get(p.id) : undefined,
      ),
    [meta, isCentralCatalog, centralDocsById],
  );

  const applyCentralRecipeToLocalCatalog = useCallback(
    (
      productId: string,
      recipe: ReturnType<typeof normalizeProductRecipe>["recipe"],
    ) => {
      const enabled = recipe.enabled === true;
      const recipeDoc = normalizedProductRecipeToFirestore(recipe);
      setCentralDocsById((prev) => {
        const next = new Map(prev);
        const existing = next.get(productId);
        if (existing) {
          next.set(productId, { ...existing, recipe: recipeDoc });
        }
        return next;
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                tieneEscandallo: enabled,
                estadoCoste: enabled ? "ok" : "pendiente",
              }
            : p,
        ),
      );
    },
    [],
  );

  const stats = useMemo(() => {
    let activos = 0;
    let inactivos = 0;
    let conEsc = 0;
    let sinEsc = 0;
    for (const p of items) {
      if (p.activo) activos += 1;
      else inactivos += 1;
      if (tieneEscandalloForPlato(p, meta)) conEsc += 1;
      else sinEsc += 1;
    }
    return { activos, inactivos, conEsc, sinEsc, total: items.length };
  }, [items, meta, tieneEscandalloForPlato]);

  const catalogListFilter: CartaFilter = listFilter;

  const configStatusFilterCounts = useMemo(() => {
    let activos = 0;
    let inactivos = 0;
    let enCarta = 0;
    let fueraCarta = 0;
    for (const p of items) {
      const flags = getPublicationFlags(p);
      if (flags.isActive) activos += 1;
      else inactivos += 1;
      if (flags.status === "onMenu") enCarta += 1;
      else if (flags.status === "offMenu") fueraCarta += 1;
    }
    return { activos, inactivos, enCarta, fueraCarta, total: items.length };
  }, [items]);

  const catalogListFilteredRows = useMemo(() => {
    let rows = items;
    const matchesActivos = (p: PlatoCarta) =>
      configCartaProductosChrome ? getPublicationFlags(p).isActive : p.activo;
    const matchesInactivos = (p: PlatoCarta) => !matchesActivos(p);

    if (catalogListFilter === "activos") rows = rows.filter(matchesActivos);
    else if (catalogListFilter === "inactivos") rows = rows.filter(matchesInactivos);
    else if (catalogListFilter === "enCarta") {
      rows = rows.filter((p) => getPublicationFlags(p).status === "onMenu");
    } else if (catalogListFilter === "fueraCarta") {
      rows = rows.filter((p) => getPublicationFlags(p).status === "offMenu");
    } else if (catalogListFilter === "conEscandallo") rows = rows.filter((p) => tieneEscandalloForPlato(p, meta));
    else if (catalogListFilter === "sinEscandallo") rows = rows.filter((p) => !tieneEscandalloForPlato(p, meta));

    return rows;
  }, [items, catalogListFilter, configCartaProductosChrome, meta, tieneEscandalloForPlato]);

  const catalogFoodDrinkCounts = useMemo(() => {
    let food = 0;
    let drink = 0;
    for (const p of catalogListFilteredRows) {
      const type = readProductFamilyTypeForFilter(productFamilyDenormFromPlato(p));
      if (type === "food") food += 1;
      else if (type === "drink") drink += 1;
    }
    return {
      all: catalogListFilteredRows.length,
      food,
      drink,
    };
  }, [catalogListFilteredRows]);

  const filteredSorted = useMemo(() => {
    let rows = catalogListFilteredRows;
    if (catalogFoodDrinkSegment !== "all") {
      rows = rows.filter((p) =>
        matchesCatalogFoodDrinkSegment(
          productFamilyDenormFromPlato(p),
          catalogFoodDrinkSegment,
        ),
      );
    }

    return [...rows].sort((a, b) => a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" }));
  }, [catalogListFilteredRows, catalogFoodDrinkSegment]);

  const categoriasForProductosSelector = useMemo(
    () => cartaCategoriasForProductSelectorList(cartaCategorias),
    [cartaCategorias],
  );

  const tabOptions = useMemo(
    () =>
      buildProductCategoryNavigationOptions(
        categoriasForProductosSelector,
        filteredSorted,
        {
          all: t("cartaVisual.categoryAll"),
          uncategorized: t("cartaCategories.filterUncat"),
        },
      ),
    [categoriasForProductosSelector, filteredSorted, t],
  );

  useEffect(() => {
    let alive = true;
    if (!tabOptions.some((o) => o.id === categoryTab)) {
      queueMicrotask(() => {
        if (!alive) return;
        setCategoryTab(PRODUCT_CATEGORY_ALL_ID);
      });
    }
    return () => {
      alive = false;
    };
  }, [tabOptions, categoryTab]);

  const tabFilteredSorted = useMemo(() => {
    const selectedOption = tabOptions.find((option) => option.id === categoryTab);
    if (!selectedOption || selectedOption.kind === "all") {
      return [...filteredSorted].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" }),
      );
    }
    const rows = filteredSorted.filter((product) =>
      matchesProductCategoryNavigationOption(product, selectedOption),
    );
    return [...rows].sort(comparePlatoCarta);
  }, [filteredSorted, categoryTab, tabOptions]);

  const resolverParityAuditsForTab = useMemo(() => {
    if (!parityCatalogsLoaded) return [];
    return auditCatalogResolverParityFromSources(
      tabFilteredSorted,
      parityCatalogSources,
    );
  }, [parityCatalogsLoaded, tabFilteredSorted, parityCatalogSources]);

  const resolverParitySummaryForTab = useMemo(
    () => summarizeResolverParityAudits(resolverParityAuditsForTab),
    [resolverParityAuditsForTab],
  );

  const parityFilteredSorted = useMemo(() => {
    if (resolverParityFilter === "all" || !parityCatalogsLoaded) {
      return tabFilteredSorted;
    }
    return filterProductsByResolverParityFilter(
      tabFilteredSorted,
      resolverParityAuditsForTab,
      resolverParityFilter,
    );
  }, [
    tabFilteredSorted,
    resolverParityAuditsForTab,
    resolverParityFilter,
    parityCatalogsLoaded,
  ]);

  const handleResolverParityFilterChange = useCallback(
    (next: ResolverParityFilterId) => {
      setResolverParityFilter((prev) => {
        if (next === "all" || prev === next) return "all";
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (reorderMode) setResolverParityFilter("all");
  }, [reorderMode]);

  const selectedCategoryOption = useMemo(
    () => tabOptions.find((option) => option.id === categoryTab),
    [categoryTab, tabOptions],
  );

  const canUseProductReorder =
    isCentralCatalog &&
    !isLegacyReadOnly &&
    selectedCategoryOption?.kind === "category" &&
    selectedCategoryOption.isConfigured;

  const activeReorderCategoryLabel = useMemo(() => {
    return selectedCategoryOption?.kind === "category"
      ? selectedCategoryOption.label
      : "";
  }, [selectedCategoryOption]);

  const showCategoryReorderControl =
    configCartaProductosChrome && isCentralCatalog && !isLegacyReadOnly;

  const reorderCategoryFullCount = useMemo(() => {
    if (selectedCategoryOption?.kind !== "category") return 0;
    return items.filter((product) =>
      matchesProductCategoryNavigationOption(product, selectedCategoryOption),
    ).length;
  }, [items, selectedCategoryOption]);

  const categoryReorderControl = useMemo(() => {
    if (
      categoryTab === PRODUCT_CATEGORY_ALL_ID ||
      categoryTab === PRODUCT_CATEGORY_UNCATEGORIZED_ID ||
      !selectedCategoryOption?.isConfigured
    ) {
      const hint = t("productos.orderModeSelectCategoryHint");
      return { enabled: false, label: hint, title: hint, ariaLabel: hint };
    }
    if (reorderCategoryFullCount < 2) {
      const hint = t("productos.orderModeMinProductsHint");
      return { enabled: false, label: hint, title: hint, ariaLabel: hint };
    }
    const label = t("productos.orderModeCategoryCta");
    return {
      enabled: true,
      label,
      title: label,
      ariaLabel: t("productos.orderModeCategoryCtaAria", {
        category: activeReorderCategoryLabel,
      }),
    };
  }, [
    categoryTab,
    reorderCategoryFullCount,
    t,
    activeReorderCategoryLabel,
    selectedCategoryOption,
  ]);

  const exitReorderMode = useCallback(() => {
    setReorderMode(false);
    setReorderBusyId(null);
  }, []);

  useEffect(() => {
    setReorderMode(false);
    setReorderBusyId(null);
  }, [categoryTab]);

  useEffect(() => {
    if (!canUseProductReorder) {
      setReorderMode(false);
      setReorderBusyId(null);
    }
  }, [canUseProductReorder]);

  const toggleReorderMode = useCallback(() => {
    if (!canUseProductReorder) return;
    setReorderMode((prev) => {
      if (prev) return false;
      setListSearch("");
      setListFilter("todos");
      setCatalogFoodDrinkSegment("all");
      setConfigCartaAdvancedOpen(false);
      clearSelection();
      setViewMode("list");
      return true;
    });
  }, [canUseProductReorder, clearSelection]);

  const reorderProductsInCategory = useCallback(
    async (orderedIds: string[]) => {
      if (!operationalRestaurantId || reorderBusyId || !canUseProductReorder) return;
      const currentIds = tabFilteredSorted.map((p) => p.id);
      if (orderedIds.join("|") === currentIds.join("|")) return;
      setReorderBusyId(orderedIds[0] ?? null);
      try {
        await reorderCentralProductsInCategory(operationalRestaurantId, orderedIds);
      } catch (e) {
        setNotice(formatCentralCatalogWriteError(e));
        window.setTimeout(() => setNotice(null), 4200);
      } finally {
        setReorderBusyId(null);
      }
    },
    [
      operationalRestaurantId,
      reorderBusyId,
      canUseProductReorder,
      tabFilteredSorted,
    ],
  );

  const displayed = useMemo(() => {
    if (reorderMode) return tabFilteredSorted;
    const q = normalizeForSearch(listSearch);
    const base = parityFilteredSorted;
    if (!q) return base;
    return base.filter(
      (p) =>
        normalizeForSearch(p.nombre).includes(q) ||
        normalizeForSearch(p.categoria).includes(q) ||
        normalizeForSearch(p.tipoVenta).includes(q) ||
        normalizeForSearch(labelTipoVenta(t, p.tipoVenta)).includes(q),
    );
  }, [reorderMode, tabFilteredSorted, parityFilteredSorted, listSearch, t]);

  useEffect(() => {
    let alive = true;
    const valid = new Set(items.map((p) => p.id));
    queueMicrotask(() => {
      if (!alive) return;
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => valid.has(id)));
        return next.size === prev.size && [...prev].every((id) => next.has(id)) ? prev : next;
      });
    });
    return () => {
      alive = false;
    };
  }, [items, setSelectedIds]);

  useLayoutEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    if (displayed.length === 0) {
      el.indeterminate = false;
      return;
    }
    const nSel = displayed.filter((p) => selectedIds.has(p.id)).length;
    el.indeterminate = nSel > 0 && nSel < displayed.length;
  }, [displayed, selectAllRef, selectedIds]);

  const toggleSelectAllDisplayed = useCallback(() => {
    toggleSelectAllDisplayedBase(displayed.map((p) => p.id));
  }, [displayed, toggleSelectAllDisplayedBase]);

  const bulkAssignPassDisabled = isLegacyReadOnly || !isCentralCatalog;
  const bulkAssignPassDisabledTitle = bulkAssignPassDisabled
    ? isLegacyReadOnly
      ? LEGACY_CATALOG_EDIT_BLOCKED
      : t("productos.bulkAssignPassCentralOnly")
    : undefined;

  const bulkAssignDestinationDisabled = bulkAssignPassDisabled;
  const bulkAssignDestinationDisabledTitle = bulkAssignPassDisabled
    ? bulkAssignPassDisabledTitle
    : isLegacyReadOnly
      ? LEGACY_CATALOG_EDIT_BLOCKED
      : t("productos.bulkAssignDestinationCentralOnly");

  const bulkAssignCategoryDisabled = bulkAssignPassDisabled;
  const bulkAssignCategoryDisabledTitle = bulkAssignPassDisabled
    ? bulkAssignPassDisabledTitle
    : t("productos.bulkAssignCategoryCentralOnly");

  const bulkAssignFamilyDisabled = bulkAssignPassDisabled;
  const bulkAssignFamilyDisabledTitle = bulkAssignPassDisabled
    ? bulkAssignPassDisabledTitle
    : t("productos.bulkAssignFamilyCentralOnly");

  const bulkDeleteDisabled = bulkAssignPassDisabled;
  const bulkDeleteDisabledTitle = bulkAssignPassDisabled
    ? bulkAssignPassDisabledTitle
    : t("productos.bulkDeleteCentralOnly");

  const bulkSelectedProducts = useMemo(
    () => items.filter((p) => selectedIds.has(p.id)),
    [items, selectedIds],
  );

  const bulkInitialCourseSelectValue = useMemo(
    () => computeBulkCourseInitialSelectValue(bulkSelectedProducts, centralDocsById),
    [bulkSelectedProducts, centralDocsById],
  );

  const bulkInitialDestinationSelectValue = useMemo(
    () => computeBulkDestinationInitialSelectValue(bulkSelectedProducts, centralDocsById),
    [bulkSelectedProducts, centralDocsById],
  );

  const bulkInitialCategorySelectValue = useMemo(
    () => computeBulkCategoryInitialSelectValue(bulkSelectedProducts, centralDocsById),
    [bulkSelectedProducts, centralDocsById],
  );

  const bulkInitialFamilySelectValue = useMemo(
    () => computeBulkFamilyInitialSelectValue(bulkSelectedProducts, centralDocsById),
    [bulkSelectedProducts, centralDocsById],
  );

  const applyCentralDeleteOutcomeToUi = useCallback(
    (p: PlatoCarta, outcome: "deleted" | "deactivated") => {
      if (outcome === "deleted") {
        pendingRemovedProductIdsRef.current.add(p.id);
        setItems((prev) => prev.filter((x) => x.id !== p.id));
        setCentralDocsById((prev) => {
          const next = new Map(prev);
          next.delete(p.id);
          return next;
        });
        if (editingId === p.id) {
          setFormOpen(false);
          setEditingId(null);
          setFormError(null);
        }
        return;
      }
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? ({
                ...x,
                activo: false,
                enCarta: false,
                isActive: false,
                updatedAt: now,
              } as PlatoCarta & { enCarta?: boolean; isActive?: boolean })
            : x,
        ),
      );
      if (editingId === p.id) {
        setFormOpen(false);
        setEditingId(null);
        setFormError(null);
      }
    },
    [editingId],
  );

  const confirmBulkAssignCourse = useCallback(
    async (courseSelectValue: string) => {
      if (bulkAssignPassDisabled) return;
      const rid = operationalRestaurantId.trim();
      if (!rid) return;
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      const course: ProductCatalogCourse =
        productCatalogCourseFromSelectValue(courseSelectValue);

      setBulkAssignCourseSaving(true);
      setFormError(null);
      try {
        const { updated } = await bulkUpdateCentralProductsCourse(
          rid,
          ids,
          course,
        );
        setNotice(
          t("productos.bulkAssignPassSuccess", { count: String(updated) }),
        );
        window.setTimeout(() => setNotice(null), 3200);
        clearSelection();
        setBulkAssignCourseOpen(false);
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      } finally {
        setBulkAssignCourseSaving(false);
      }
    },
    [
      bulkAssignPassDisabled,
      operationalRestaurantId,
      selectedIds,
      t,
      clearSelection,
    ],
  );

  const confirmBulkAssignDestination = useCallback(
    async (destination: "kitchen" | "bar" | "cocktail") => {
      if (bulkAssignDestinationDisabled) return;
      const rid = operationalRestaurantId.trim();
      if (!rid) return;
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      setBulkAssignDestinationSaving(true);
      setFormError(null);
      try {
        const { updated } = await bulkUpdateCentralProductsDestination(
          rid,
          ids,
          destination,
        );
        setNotice(
          t("productos.bulkAssignDestinationSuccess", { count: String(updated) }),
        );
        window.setTimeout(() => setNotice(null), 3200);
        clearSelection();
        setBulkAssignDestinationOpen(false);
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      } finally {
        setBulkAssignDestinationSaving(false);
      }
    },
    [
      bulkAssignDestinationDisabled,
      operationalRestaurantId,
      selectedIds,
      t,
      clearSelection,
    ],
  );

  const confirmBulkAssignCategory = useCallback(
    async (categoryId: string | null, categoryName: string) => {
      if (bulkAssignCategoryDisabled) return;
      const rid = operationalRestaurantId.trim();
      if (!rid) return;
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      setBulkAssignCategorySaving(true);
      setFormError(null);
      try {
        const { updated } = await bulkUpdateCentralProductsCategory(rid, ids, {
          categoryId,
          categoryName,
        });
        setNotice(
          t("productos.bulkAssignCategorySuccess", { count: String(updated) }),
        );
        window.setTimeout(() => setNotice(null), 3200);
        clearSelection();
        setBulkAssignCategoryOpen(false);
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      } finally {
        setBulkAssignCategorySaving(false);
      }
    },
    [
      bulkAssignCategoryDisabled,
      operationalRestaurantId,
      selectedIds,
      t,
      clearSelection,
    ],
  );

  const confirmBulkAssignFamily = useCallback(
    async (familyId: string | null) => {
      if (bulkAssignFamilyDisabled) return;
      const rid = operationalRestaurantId.trim();
      if (!rid) return;
      const ids = [...selectedIds];
      if (ids.length === 0) return;

      const familyPatch =
        familyId == null
          ? ({ clearProductFamily: true } as const)
          : (() => {
              const fam = productFamilies.find((f) => f.id === familyId);
              if (!fam) return null;
              return {
                productFamilyId: fam.id,
                productFamilyName: fam.name.trim(),
                productFamilyType: fam.type,
              } as const;
            })();

      if (!familyPatch) return;

      setBulkAssignFamilySaving(true);
      setFormError(null);
      try {
        const { updated } = await bulkUpdateCentralProductsFamily(
          rid,
          ids,
          familyPatch,
        );
        setNotice(
          t("productos.bulkAssignFamilySuccess", { count: String(updated) }),
        );
        window.setTimeout(() => setNotice(null), 3200);
        clearSelection();
        setBulkAssignFamilyOpen(false);
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      } finally {
        setBulkAssignFamilySaving(false);
      }
    },
    [
      bulkAssignFamilyDisabled,
      operationalRestaurantId,
      selectedIds,
      productFamilies,
      t,
      clearSelection,
    ],
  );

  const confirmBulkDelete = useCallback(async () => {
    if (bulkDeleteDisabled || !isCentralCatalog) return;
    const restauranteId = operationalRestaurantId.trim();
    if (!restauranteId) return;
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    setBulkDeleteSaving(true);
    setFormError(null);
    let deleted = 0;
    let deactivated = 0;
    let failed = 0;

    try {
      for (const id of ids) {
        const p = items.find((x) => x.id === id);
        if (!p) continue;
        try {
          const decision = await resolveCartaProductDeleteAction({
            p,
            meta,
            centralDoc: centralDocsById.get(p.id),
            restaurantId: restauranteId,
            tieneEscandallo: tieneEscandalloForPlato,
          });
          const outcome = await applyResolvedCartaCentralProductDelete(
            restauranteId,
            p.id,
            decision,
          );
          applyCentralDeleteOutcomeToUi(p, outcome);
          if (outcome === "deleted") deleted += 1;
          else deactivated += 1;
        } catch {
          failed += 1;
        }
      }

      const failedSuffix =
        failed > 0
          ? t("productos.bulkDeleteSuccessFailedSuffix", {
              failed: String(failed),
            })
          : "";
      setNotice(
        t("productos.bulkDeleteSuccess", {
          deleted: String(deleted),
          deactivated: String(deactivated),
          failedSuffix,
        }),
      );
      window.setTimeout(() => setNotice(null), 4200);
      clearSelection();
      setBulkDeleteOpen(false);
    } finally {
      setBulkDeleteSaving(false);
    }
  }, [
    bulkDeleteDisabled,
    isCentralCatalog,
    operationalRestaurantId,
    selectedIds,
    items,
    meta,
    centralDocsById,
    applyCentralDeleteOutcomeToUi,
    tieneEscandalloForPlato,
    t,
    clearSelection,
  ]);

  const groupedByCategoria = useMemo(() => {
    const sections = buildCartaGroupedSections(displayed, cartaCategorias, {
      activeProductsOnly: false,
      activeCategoriesOnly: false,
    });
    return sections.map((s) => ({ categoria: s.label, sectionKey: s.sectionKey, items: s.items }));
  }, [displayed, cartaCategorias]);

  const kpiPills = useMemo(
    () => [
      { key: "act", label: t("carta.kpiActivos"), value: String(stats.activos) },
      { key: "ina", label: t("carta.kpiInactivos"), value: String(stats.inactivos) },
      { key: "ce", label: t("carta.kpiConEsc"), value: String(stats.conEsc) },
      { key: "se", label: t("carta.kpiSinEsc"), value: String(stats.sinEsc) },
    ],
    [t, stats],
  );

  const rowNombreStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowNombreStyle,
            color: "var(--hostly-navy-deep)",
            fontWeight: 750,
            fontSize: 15,
            lineHeight: 1.34,
            letterSpacing: "-0.024em",
          }
        : productRowNombreStyle,
    [iceVisual],
  );
  const rowPrecioStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowPrecioStyle,
            color: "var(--hostly-navy-deep)",
            fontWeight: 680,
            fontSize: 13,
            lineHeight: 1.3,
          }
        : productRowPrecioStyle,
    [iceVisual],
  );
  const rowTipoStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowTipoStyle,
            fontSize: 9,
            fontWeight: 540,
            letterSpacing: "0.05em",
            color: "color-mix(in srgb, var(--hostly-ink-muted) 94%, var(--hostly-ink))",
          }
        : productRowTipoStyle,
    [iceVisual],
  );
  const rowCategoriaStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...productRowCategoriaStyle,
            fontSize: 9.5,
            fontWeight: 420,
            color: "color-mix(in srgb, var(--hostly-ink-muted) 92%, var(--hostly-ink))",
          }
        : productRowCategoriaStyle,
    [iceVisual],
  );
  const colHeadStyleResolved = useMemo(
    () =>
      iceVisual
        ? {
            ...colHeadStyle,
            fontSize: 8.5,
            fontWeight: 540,
            letterSpacing: "0.13em",
            color: "var(--hostly-ink-faint)",
            padding: "5px 4px",
          }
        : colHeadStyle,
    [iceVisual],
  );

  const draftSkipsMenuCourse = useMemo(
    () =>
      productFormSkipsMenuCourse({
        tipo: draftTipo,
        operationStationSelect: draftOperationStationSelect,
        operationStations,
      }),
    [draftTipo, draftOperationStationSelect, operationStations],
  );

  advancedFormSnapshotBuildInputRef.current = {
    isCentralCatalog,
    draftNombre,
    draftPrecio,
    draftTipo,
    draftCategoriaCartaId,
    draftProductFamilyId,
    draftOperationStationSelect,
    draftCourse,
    draftProductCompositionType,
    draftActivo,
    draftModifierGroupIds,
    draftDesc,
    draftFoto,
    draftExistingImagePath,
    draftRemoveImage,
    draftPendingImageFile,
    draftRecipeEnabled,
    draftRecipeRows,
    skipsMenuCourse: draftSkipsMenuCourse,
    modifierGroups,
  };

  useEffect(() => {
    if (!formOpen || !draftSkipsMenuCourse) return;
    setDraftCourse("");
  }, [formOpen, draftSkipsMenuCourse]);

  const categoriasForForm = useMemo(
    () =>
      cartaCategoriasForProductForm(
        cartaCategorias,
        draftTipo,
        draftFamilyOverrideOpen ? draftCartaMenuFamiliaId : null,
        { currentCategoryId: draftCategoriaCartaId },
      ),
    [
      cartaCategorias,
      draftTipo,
      draftFamilyOverrideOpen,
      draftCartaMenuFamiliaId,
      draftCategoriaCartaId,
    ],
  );

  const activeModifierGroups = useMemo(
    () =>
      modifierGroups
        .filter((g) => g.active)
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name, "es", { sensitivity: "base" }),
        ),
    [modifierGroups],
  );

  const draftSelectedCategory = useMemo(
    () =>
      draftCategoriaCartaId
        ? cartaCategorias.find((c) => c.id === draftCategoriaCartaId)
        : undefined,
    [draftCategoriaCartaId, cartaCategorias],
  );

  const inheritedModifierGroupIds = useMemo(
    () =>
      sanitizeModifierGroupIdsForSave(
        draftSelectedCategory?.modifierGroupIds ?? [],
        modifierGroups,
      ),
    [draftSelectedCategory, modifierGroups],
  );

  const inheritedModifierGroupIdSet = useMemo(
    () => new Set(inheritedModifierGroupIds),
    [inheritedModifierGroupIds],
  );

  const inheritedModifierGroups = useMemo(
    () =>
      activeModifierGroups.filter((group) =>
        inheritedModifierGroupIdSet.has(group.id),
      ),
    [activeModifierGroups, inheritedModifierGroupIdSet],
  );

  const ownSelectableModifierGroups = useMemo(
    () =>
      activeModifierGroups.filter(
        (group) => !inheritedModifierGroupIdSet.has(group.id),
      ),
    [activeModifierGroups, inheritedModifierGroupIdSet],
  );

  const toggleProductOwnModifierGroup = useCallback(
    (groupId: string) => {
      setDraftModifierGroupIds((prev) => {
        const preservedInherited = prev.filter((id) =>
          inheritedModifierGroupIdSet.has(id),
        );
        const own = prev.filter((id) => !inheritedModifierGroupIdSet.has(id));
        const nextOwn = own.includes(groupId)
          ? own.filter((id) => id !== groupId)
          : [...own, groupId];
        return [...preservedInherited, ...nextOwn];
      });
    },
    [inheritedModifierGroupIdSet],
  );

  const draftMenuFamilyInheritedHint = useMemo(
    () =>
      buildProductMenuFamilyInheritedHintView({
        selectedCategory: draftSelectedCategory,
        cartaFamilias,
        operationStations,
      }),
    [draftSelectedCategory, cartaFamilias, operationStations],
  );

  const draftCatalogHierarchyContext = useMemo(() => {
    const categoryName = draftSelectedCategory?.name?.trim() || null;
    if (!categoryName) return { menuFamilyName: null, categoryName: null };

    let menuFamilyName: string | null = null;
    const selectedFamiliaId = draftCartaMenuFamiliaId?.trim();
    if (
      selectedFamiliaId &&
      selectedFamiliaId !== CARTA_MENU_FAMILIA_FILTER_UNASSIGNED
    ) {
      menuFamilyName = cartaFamilias.find((f) => f.id === selectedFamiliaId)?.name ?? null;
    }
    if (!menuFamilyName) {
      const linkedId = draftSelectedCategory?.cartaFamiliaId?.trim();
      if (linkedId) {
        menuFamilyName = cartaFamilias.find((f) => f.id === linkedId)?.name ?? null;
      }
    }
    if (
      draftMenuFamilyInheritedHint.status === "inherited" &&
      !menuFamilyName
    ) {
      menuFamilyName = draftMenuFamilyInheritedHint.menuFamilyName;
    }

    return { menuFamilyName, categoryName };
  }, [
    draftSelectedCategory,
    draftCartaMenuFamiliaId,
    cartaFamilias,
    draftMenuFamilyInheritedHint,
  ]);
  const draftDerivedMenuFamilyLabel =
    draftCatalogHierarchyContext.menuFamilyName ??
    (draftSelectedCategory ? "Sin familia asignada" : "Selecciona una categoría");
  const draftDerivedMenuFamilyHint = draftSelectedCategory
    ? "Asignada automáticamente por la categoría."
    : "Hostly la completará automáticamente al elegir una categoría.";

  const applyCategorySelection = useCallback(
    (id: string | null) => {
      const inheritance = resolveCategorySelectionInheritance(id, cartaCategorias);
      setDraftCategoriaCartaId(inheritance.categoriaCartaId);
      setDraftCartaMenuFamiliaId(inheritance.cartaMenuFamiliaId);
      setDraftProductFamilyId(inheritance.productFamilyId);
    },
    [cartaCategorias],
  );

  const handleDraftTipoChange = useCallback(
    (tipo: TipoProductoVenta) => {
      setDraftTipo(tipo);
      setDraftOperationStationSelect(defaultOperationStationSelectForTipoVenta(tipo));
      const currentCategory = draftCategoriaCartaId
        ? cartaCategorias.find((c) => c.id === draftCategoriaCartaId)
        : undefined;
      if (!isCartaCategoriaCompatibleWithTipoProducto(currentCategory, tipo)) {
        applyCategorySelection(null);
      }
    },
    [applyCategorySelection, cartaCategorias, draftCategoriaCartaId],
  );

  const draftPreventiveValidation = useMemo(
    () =>
      evaluateProductFormPreventiveValidation({
        tipoVenta: draftTipo,
        active: draftActivo,
        categoryId: draftCategoriaCartaId,
        hasProductFamily: Boolean(
          resolveProductFamilyFromSelectValue(draftProductFamilyId, productFamilies),
        ),
        operationStationSelect: draftOperationStationSelect,
        operationStations,
        courseSelectValue: draftCourse,
        skipsMenuCourse: draftSkipsMenuCourse,
        validateCourse: isCentralCatalog,
      }),
    [
      draftTipo,
      draftActivo,
      draftCategoriaCartaId,
      draftProductFamilyId,
      productFamilies,
      draftOperationStationSelect,
      operationStations,
      draftCourse,
      draftSkipsMenuCourse,
      isCentralCatalog,
    ],
  );

  const preventiveFieldWarnings = useMemo(() => {
    const destination: string[] = [];
    const family: string[] = [];
    for (const message of draftPreventiveValidation.warnings) {
      if (message === PRODUCT_FORM_ACTIVE_NO_FAMILY_WARNING) {
        family.push(message);
      } else {
        destination.push(message);
      }
    }
    return { destination, family };
  }, [draftPreventiveValidation.warnings]);

  const inventoryLookupMap = useMemo(
    () => buildInventoryProductLookupMap(inventoryLookup),
    [inventoryLookup],
  );

  const draftRecipeWarnings = useMemo(() => {
    if (!formOpen || !isCentralCatalog) return [];
    const saleProductId = editingId?.trim() ?? "";
    const validation = normalizeProductRecipe(
      buildRecipeSourceFromDraftRows(draftRecipeEnabled, draftRecipeRows),
      { saleProductId, inventoryProductsById: inventoryLookupMap },
    );
    return validation.warnings;
  }, [
    draftRecipeEnabled,
    draftRecipeRows,
    editingId,
    formOpen,
    inventoryLookupMap,
    isCentralCatalog,
  ]);

  const draftSalePriceForProfitability = useMemo(
    () => parseNullableNumber(draftPrecio.trim() === "" ? "" : draftPrecio.replace(",", ".")),
    [draftPrecio],
  );

  const draftCommercialHasImage = useMemo(() => {
    if (isCentralCatalog) {
      return Boolean(draftImagePreviewUrl && !draftRemoveImage);
    }
    return Boolean(draftFoto.trim());
  }, [isCentralCatalog, draftImagePreviewUrl, draftRemoveImage, draftFoto]);

  const draftCommercialImagePreviewUrl = useMemo(() => {
    if (isCentralCatalog) {
      return draftImagePreviewUrl && !draftRemoveImage ? draftImagePreviewUrl : null;
    }
    const url = draftFoto.trim();
    return url || null;
  }, [isCentralCatalog, draftImagePreviewUrl, draftRemoveImage, draftFoto]);

  function applyRecipeDraftFromDocument(
    recipe: ProductDocument["recipe"] | undefined,
  ): void {
    setDraftRecipeEnabled(recipe?.enabled === true);
    const ingredients = Array.isArray(recipe?.ingredients) ? recipe!.ingredients : [];
    setDraftRecipeRows(
      ingredients.length > 0
        ? ingredients.map((ing, index) => ({
            clientRowId: `loaded_${index}_${String(ing.productId ?? "")}`,
            productId: typeof ing.productId === "string" ? ing.productId.trim() : "",
            quantity:
              typeof ing.quantity === "number" && Number.isFinite(ing.quantity)
                ? String(ing.quantity)
                : "",
            unit: isRecipeInventoryUnit(ing.unit) ? ing.unit : "unit",
          }))
        : [],
    );
  }

  const resetDraftImageState = useCallback(() => {
    setDraftImagePreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    setDraftPendingImageFile(null);
    setDraftExistingImagePath(undefined);
    setDraftRemoveImage(false);
    if (draftImageFileInputRef.current) {
      draftImageFileInputRef.current.value = "";
    }
  }, []);

  const beginAdvancedFormSession = useCallback(() => {
    const nextToken = formSessionTokenRef.current + 1;
    formSessionTokenRef.current = nextToken;
    pendingAdvancedFormBaselineSessionRef.current = nextToken;
    setFormSessionToken(nextToken);
  }, []);

  const closeForm = useCallback(() => {
    resetDraftImageState();
    setEscandalloModalOpen(false);
    setCommercialInfoModalOpen(false);
    setDiscardFormConfirmOpen(false);
    setEditFocus(null);
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
    advancedFormBaselineRef.current = null;
    pendingAdvancedFormBaselineSessionRef.current = null;
  }, [resetDraftImageState]);

  const hasAdvancedFormUnsavedChanges = useCallback(() => {
    if (!advancedFormBaselineRef.current) return false;
    const input = advancedFormSnapshotBuildInputRef.current;
    const compareContext: AdvancedFormSnapshotCompareContext = {
      modifierGroups: input.modifierGroups,
      skipsMenuCourse: input.skipsMenuCourse,
    };
    const current = buildAdvancedFormComparableSnapshotFromInput(input, compareContext);
    const baseline = buildAdvancedFormComparableSnapshot(
      advancedFormBaselineRef.current,
      compareContext,
    );
    return !areAdvancedProductFormPersistableSnapshotsEqual(current, baseline);
  }, []);

  const dismissDiscardFormConfirm = useCallback(() => {
    setDiscardFormConfirmOpen(false);
    advancedFormDiscardFocusPendingRef.current = true;
  }, []);

  const confirmDiscardForm = useCallback(() => {
    setDiscardFormConfirmOpen(false);
    closeForm();
  }, [closeForm]);

  const requestCloseForm = useCallback(() => {
    if (drawerSyncing || discardFormConfirmOpen) return;
    if (hasAdvancedFormUnsavedChanges()) {
      advancedFormDiscardFocusRestoreRef.current = captureAdvancedFormDrawerFocusTarget(
        advancedFormDrawerRef.current,
      );
      setDiscardFormConfirmOpen(true);
      return;
    }
    closeForm();
  }, [closeForm, discardFormConfirmOpen, drawerSyncing, hasAdvancedFormUnsavedChanges]);

  const captureAddCategoryOpenerFocus = useCallback(() => {
    const active = document.activeElement;
    addCategoryOpenerRef.current = active instanceof HTMLElement ? active : null;
  }, []);

  const closeAddCategoryDialog = useCallback(() => {
    setAddCategoryOpen(false);
    addCategoryFocusRestorePendingRef.current = true;
  }, []);

  const openAddCategoryDialog = useCallback(
    (prepare: () => void, options?: { restoreViaDrawerFallback?: boolean }) => {
      captureAddCategoryOpenerFocus();
      addCategoryRestoreViaDrawerFallbackRef.current =
        options?.restoreViaDrawerFallback === true;
      prepare();
      setAddCategoryOpen(true);
    },
    [captureAddCategoryOpenerFocus],
  );

  useLayoutEffect(() => {
    if (discardFormConfirmOpen || !advancedFormDiscardFocusPendingRef.current) return;
    advancedFormDiscardFocusPendingRef.current = false;
    restoreAdvancedFormDrawerFocus(
      advancedFormDiscardFocusRestoreRef.current,
      advancedFormDrawerRef.current,
    );
    advancedFormDiscardFocusRestoreRef.current = null;
  }, [discardFormConfirmOpen]);

  useLayoutEffect(() => {
    if (addCategoryOpen || !addCategoryFocusRestorePendingRef.current) return;
    addCategoryFocusRestorePendingRef.current = false;
    const opener = addCategoryOpenerRef.current;
    const useDrawerFallback = addCategoryRestoreViaDrawerFallbackRef.current;
    addCategoryRestoreViaDrawerFallbackRef.current = false;
    if (opener && isAddCategoryOpenerFocusTarget(opener) && tryFocusElement(opener)) {
      return;
    }
    if (useDrawerFallback) {
      restoreAdvancedFormDrawerFocus(null, advancedFormDrawerRef.current);
    }
  }, [addCategoryOpen]);

  useLayoutEffect(() => {
    if (!formOpen || pendingAdvancedFormBaselineSessionRef.current == null) return;
    if (pendingAdvancedFormBaselineSessionRef.current !== formSessionTokenRef.current) return;
    advancedFormBaselineRef.current = captureAdvancedFormBaselineSnapshot(
      advancedFormSnapshotBuildInputRef.current,
    );
    pendingAdvancedFormBaselineSessionRef.current = null;
  }, [formOpen, formSessionToken]);

  const closeQuickCreate = useCallback(() => {
    setQuickCreateOpen(false);
    quickCreate.resetDraft();
  }, [quickCreate]);

  const openAdvancedCreateFromQuickDraft = useCallback(
    (quickDraft: ProductQuickCreateDraft, inherited: ProductQuickCreateInheritedDraft) => {
      setQuickCreateOpen(false);
      setEditingId(null);
      setDraftNombre(quickDraft.nombre);
      setDraftPrecio(quickDraft.precio);
      setDraftCategoriaCartaId(quickDraft.categoriaCartaId);
      setDraftCartaMenuFamiliaId(inherited.cartaMenuFamiliaId);
      setDraftTipo(inherited.tipoVenta);
      setDraftProductCompositionType(inherited.productCompositionType);
      setDraftActivo(inherited.activo);
      setDraftOperationStationSelect(inherited.operationStationSelect);
      setDraftCourse(inherited.course);
      setDraftProductFamilyId(inherited.productFamilyId);
      setDraftModifierGroupIds([...inherited.modifierGroupIds]);
      setDraftDesc("");
      setDraftFoto("");
      resetDraftImageState();
      setDraftRecipeEnabled(false);
      setDraftRecipeRows([]);
      setFormError(null);
      setEditFocus(null);
      setDraftFamilyOverrideOpen(false);
      quickCreate.resetDraft();
      beginAdvancedFormSession();
      setFormOpen(true);
    },
    [beginAdvancedFormSession, quickCreate, resetDraftImageState],
  );

  const handleDraftImageFileChange = useCallback(async (file: File | null) => {
    setDraftImagePreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    if (!file) {
      setDraftPendingImageFile(null);
      return;
    }
    try {
      const stable = await createStableImageFile(file);
      setDraftPendingImageFile(stable);
      setDraftRemoveImage(false);
      setDraftImagePreviewUrl(URL.createObjectURL(stable));
      setFormError(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo leer la imagen");
    }
  }, []);

  const handleRemoveDraftImage = useCallback(() => {
    setDraftRemoveImage(true);
    setDraftPendingImageFile(null);
    setDraftImagePreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    if (draftImageFileInputRef.current) {
      draftImageFileInputRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    if (!addCategoryOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeAddCategoryDialog();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [addCategoryOpen, closeAddCategoryDialog]);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        commercialInfoModalOpen ||
        escandalloModalOpen ||
        addCategoryOpen ||
        discardFormConfirmOpen
      ) {
        return;
      }
      e.preventDefault();
      requestCloseForm();
    };
    window.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => {
      if (editFocus !== "routing") {
        nombreInputRef.current?.focus();
      }
    }, 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [
    formOpen,
    requestCloseForm,
    editFocus,
    commercialInfoModalOpen,
    escandalloModalOpen,
    addCategoryOpen,
    discardFormConfirmOpen,
  ]);

  useEffect(() => {
    if (!formOpen || editFocus !== "routing") return;
    const scrollTimer = window.setTimeout(() => {
      routingFocusRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(scrollTimer);
  }, [formOpen, editFocus, editingId]);

  useEffect(() => {
    if (!formOpen || editFocus !== "recipe" || !isCentralCatalog) return;
    const openTimer = window.setTimeout(() => {
      setEscandalloModalOpen(true);
    }, 80);
    return () => window.clearTimeout(openTimer);
  }, [formOpen, editFocus, isCentralCatalog, editingId]);

  useEffect(() => {
    if (!formOpen) return;
    if (editFocus === "routing") {
      setProductFormTab("operacion");
      return;
    }
    if (editFocus === "recipe") {
      setProductFormTab("escandallo");
      return;
    }
    setProductFormTab("producto");
  }, [formOpen, editFocus]);

  const openRecipeFromDeepLink = useEffectEvent((plato: PlatoCarta) => {
    openEdit(plato, { focus: "recipe" });
  });

  useEffect(() => {
    if (!isConfigCartaProductosRoute || !hydrated || operationalCatalog.loading) return;

    const productId = searchParams.get("productId")?.trim() ?? "";
    const focus = searchParams.get("focus")?.trim() ?? "";
    if (!productId || focus !== "recipe") return;

    const linkKey = `${productId}:${focus}`;
    if (recipeDeepLinkHandledRef.current === linkKey) return;

    if (isLegacyReadOnly) {
      recipeDeepLinkHandledRef.current = linkKey;
      router.replace(pathname, { scroll: false });
      return;
    }

    const plato = items.find((x) => x.id === productId);
    if (!plato) {
      if (operationalCatalog.source !== null && items.length > 0) {
        recipeDeepLinkHandledRef.current = linkKey;
        setFormError("No se encontró el producto para editar el escandallo.");
        router.replace(pathname, { scroll: false });
      }
      return;
    }

    recipeDeepLinkHandledRef.current = linkKey;
    openRecipeFromDeepLink(plato);
    router.replace(pathname, { scroll: false });
  }, [
    hydrated,
    isConfigCartaProductosRoute,
    isLegacyReadOnly,
    items,
    operationalCatalog.loading,
    operationalCatalog.source,
    pathname,
    router,
    searchParams,
  ]);

  const metricNum: CSSProperties = {
    ...tabularFigures,
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: iceVisual ? "#0f172a" : "#f8fafc",
    lineHeight: 1.1,
  };

  function resetNewProductDraftState() {
    setEditingId(null);
    setDraftNombre("");
    setDraftTipo("plato");
    setDraftProductCompositionType(DEFAULT_PRODUCT_COMPOSITION_TYPE);
    setDraftCategoriaCartaId(null);
    setDraftCartaMenuFamiliaId(null);
    setDraftPrecio("");
    setDraftActivo(true);
    setDraftFoto("");
    resetDraftImageState();
    setDraftDesc("");
    setDraftOperationStationSelect("default-kitchen");
    setDraftCourse("");
    setDraftProductFamilyId(CATEGORY_PRODUCT_FAMILY_NONE);
    setDraftModifierGroupIds([]);
    setDraftRecipeEnabled(false);
    setDraftRecipeRows([]);
    setEditFocus(null);
    setDraftFamilyOverrideOpen(false);
  }

  function openCreate() {
    if (isLegacyReadOnly) return;
    setFormError(null);
    if (isCentralCatalog) {
      quickCreate.resetDraft();
      setQuickCreateOpen(true);
      return;
    }
    resetNewProductDraftState();
    beginAdvancedFormSession();
    setFormOpen(true);
  }

  function openEdit(p: PlatoCarta, options?: ProductEditOptions) {
    if (isLegacyReadOnly) return;
    setEditFocus(options?.focus ?? null);
    setDraftFamilyOverrideOpen(false);
    setEditingId(p.id);
    setDraftNombre(p.nombre);
    setDraftTipo(p.tipoVenta);
    const tid = p.categoriaCartaId ?? null;
    const cat = tid ? cartaCategorias.find((c) => c.id === tid) : undefined;
    if (!tid) setDraftCategoriaCartaId(null);
    else if (!cat) setDraftCategoriaCartaId(tid);
    else setDraftCategoriaCartaId(tid);
    if (cat) {
      setDraftCartaMenuFamiliaId(
        cat.cartaFamiliaId?.trim() ? cat.cartaFamiliaId.trim() : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED,
      );
    } else if (tid && !cat) {
      const cf = p.cartaFamiliaId?.trim();
      setDraftCartaMenuFamiliaId(cf ? cf : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED);
    } else {
      setDraftCartaMenuFamiliaId(null);
    }
    setDraftPrecio(String(p.precioVenta));
    setDraftActivo(p.activo);
    setDraftFoto(p.fotoUrl ?? "");
    resetDraftImageState();
    if (isCentralCatalog) {
      const centralDoc = centralDocsById.get(p.id);
      setDraftExistingImagePath(centralDoc?.imagePath);
      setDraftImagePreviewUrl(centralDoc?.imageUrl?.trim() || null);
    }
    setDraftDesc(p.descripcion ?? "");
    setDraftOperationStationSelect(
      operationStationSelectValueFromProduct({
        operationStationId: p.operationStationId,
        operationStationName: p.operationStationName,
        preparationArea: p.preparationArea,
        station: p.preparationArea ?? null,
      }),
    );
    const centralDocForFamily = isCentralCatalog ? centralDocsById.get(p.id) : undefined;
    const directFamilyId =
      centralDocForFamily?.productFamilyId?.trim() || p.productFamilyId?.trim() || "";
    if (directFamilyId) {
      setDraftProductFamilyId(directFamilyId);
    } else {
      const categoryFamilyPatch = buildProductFamilyPatchFromCategoryId(tid, cartaCategorias);
      setDraftProductFamilyId(
        categoryFamilyPatch.productFamilyId && !categoryFamilyPatch.clearProductFamily
          ? categoryFamilyPatch.productFamilyId
          : CATEGORY_PRODUCT_FAMILY_NONE,
      );
    }
    if (isCentralCatalog) {
      const centralDoc = centralDocsById.get(p.id);
      setDraftProductCompositionType(
        normalizeProductCompositionType(centralDoc?.productCompositionType),
      );
      setDraftCourse(
        productCatalogCourseSelectValue(
          centralDoc?.course !== undefined ? centralDoc.course : undefined,
        ),
      );
      applyRecipeDraftFromDocument(centralDoc?.recipe);
    } else {
      setDraftProductCompositionType(DEFAULT_PRODUCT_COMPOSITION_TYPE);
      setDraftCourse("");
      setDraftRecipeEnabled(false);
      setDraftRecipeRows([]);
    }
    const centralDocForModifiers = isCentralCatalog ? centralDocsById.get(p.id) : undefined;
    setDraftModifierGroupIds(
      centralDocForModifiers?.modifierGroupIds ?? p.modifierGroupIds ?? [],
    );
    setFormError(null);
    beginAdvancedFormSession();
    setFormOpen(true);
  }

  async function submitForm() {
    setFormError(null);
    const formCoreDraft = {
      nombre: draftNombre,
      precioInput: draftPrecio,
      categoriaCartaId: draftCategoriaCartaId,
      draftTipo,
      draftActivo,
      draftOperationStationSelect,
      draftCourse,
      draftProductFamilyId,
      draftProductCompositionType,
      draftDesc,
      draftModifierGroupIds,
    };

    const validation = validateProductFormCoreFields(formCoreDraft, {
      cartaCategorias,
      modifierGroups,
      preventiveValidation: draftPreventiveValidation,
      messages: productFormSubmitMessages,
    });

    if (!validation.ok) {
      setFormError(validation.error);
      return;
    }

    const { nombre, precioVenta, selectedCategory: selectedCat } = validation;
    const stationPatch = buildProductStationPatchFromSelectValue(
      draftOperationStationSelect,
      operationStations,
    );
    const preparationArea = stationPatch.preparationArea;
    const restauranteId = operationalRestaurantId;
    const now = new Date().toISOString();
    const cartaFamiliaIdPatch = selectedCat?.cartaFamiliaId?.trim() || undefined;
    const selMenuFamId = selectedCat?.cartaFamiliaId?.trim();
    const menuFamName =
      selMenuFamId != null && selMenuFamId !== ""
        ? cartaFamilias.find((x) => x.id === selMenuFamId)?.name
        : undefined;

    if (isCentralCatalog) {
      setDrawerSyncing(true);
      try {
        const existingFlags = editingId
          ? getPublicationFlags(items.find((p) => p.id === editingId)!)
          : null;
        const centralInput = buildCentralInputFromProductFormDraft(
          formCoreDraft,
          validation,
          {
            operationStations,
            productFamilies,
            cartaCategorias,
            existingIsActive: existingFlags?.isActive,
          },
        );
        const persistResult = await persistCentralCatalogProduct({
          restaurantId: restauranteId,
          editingId,
          centralInput,
          recipeEnabled: draftRecipeEnabledRef.current,
          recipeRows: draftRecipeRowsRef.current,
          saleProductIdForRecipe: editingId?.trim() ?? "",
          inventoryLookupMap,
          image: {
            pendingFile: draftPendingImageFile,
            remove: draftRemoveImage,
            existingPath: draftExistingImagePath,
          },
        });

        if (!persistResult.ok) {
          setFormError(persistResult.error);
          return;
        }

        applyCentralRecipeToLocalCatalog(
          persistResult.productId,
          persistResult.recipe,
        );
        setNotice("Guardado en catálogo central");
        closeForm();
        window.setTimeout(() => setNotice(null), 3200);
      } finally {
        setDrawerSyncing(false);
      }
      return;
    }

    if (isLegacyReadOnly) return;

    const {
      modifierGroupIdsForSave,
      categoria,
      categoriaCartaIdPatch,
    } = validation;
    const sanitizedModifierGroupIds = modifierGroupIdsForSave ?? [];

    if (editingId) {
      const next = items.map((p) => {
        if (p.id !== editingId) return p;
        let patched: PlatoCarta = {
          ...p,
          nombre,
          preparationArea,
          ...(stationPatch.operationStationId
            ? {
                operationStationId: stationPatch.operationStationId,
                operationStationName: stationPatch.operationStationName,
              }
            : stationPatch.clearOperationStation
              ? {
                  operationStationId: undefined,
                  operationStationName: undefined,
                }
              : {}),
          tipoVenta: draftTipo,
          categoria,
          categoriaCartaId: categoriaCartaIdPatch,
          cartaFamiliaId: cartaFamiliaIdPatch,
          precioVenta,
          activo: draftActivo,
          fotoUrl: draftFoto.trim() || undefined,
          descripcion: draftDesc.trim() || undefined,
          updatedAt: now,
        };
        patched = applyDefaultModifierFamilyIfEligible(patched, {
          selectedCartaCategoria: selectedCat,
          cartaMenuFamiliaName: menuFamName,
          modifierFamilies,
        });
        if (sanitizedModifierGroupIds.length > 0) {
          patched.modifierGroupIds = sanitizedModifierGroupIds;
        } else {
          delete patched.modifierGroupIds;
        }
        return patched;
      });
      persist(next);
      const updated = next.find((p) => p.id === editingId);
      fireAndForgetSyncCatalogoCategoria(restauranteId, updated?.escandalloSupabaseId ?? null, categoria);
      if (updated?.escandalloSupabaseId != null) {
        const { error: mirErr } = await mirrorPlatoToEscandalloRow(updated);
        if (mirErr) {
          setFormError(mirErr);
          return;
        }
      }
      setNotice(t("carta.noticeSaved"));
    } else {
      let nuevo = createPlatoDraft(restauranteId, {
        nombre,
        preparationArea,
        tipoVenta: draftTipo,
        categoria,
        categoriaCartaId: categoriaCartaIdPatch,
        cartaFamiliaId: cartaFamiliaIdPatch,
        precioVenta,
        activo: draftActivo,
        fotoUrl: draftFoto.trim() || undefined,
        descripcion: draftDesc.trim() || undefined,
      });
      if (stationPatch.operationStationId) {
        nuevo.operationStationId = stationPatch.operationStationId;
        nuevo.operationStationName = stationPatch.operationStationName;
      }
      nuevo = applyDefaultModifierFamilyIfEligible(nuevo, {
        selectedCartaCategoria: selectedCat,
        cartaMenuFamiliaName: menuFamName,
        modifierFamilies,
      });
      if (sanitizedModifierGroupIds.length > 0) {
        nuevo.modifierGroupIds = sanitizedModifierGroupIds;
      }
      const nextLocal = [...items, nuevo];
      persist(nextLocal);
      setNotice(t("carta.noticeAdded"));
      if (nuevo.activo) {
        setDrawerSyncing(true);
        const ensured = await ensureEscandalloRowsForPlatos(nextLocal);
        setDrawerSyncing(false);
        if (ensured.error) {
          setFormError(t("carta.errorSyncEsc"));
          return;
        }
        if (ensured.next !== nextLocal) {
          savePlatos(restauranteId, ensured.next);
          setItems(ensured.next);
        }
      }
    }
    closeForm();
    window.setTimeout(() => setNotice(null), 3200);
  }

  async function saveQuickCategory() {
    const name = addCatName.trim();
    if (!name) return;
    setAddCatSaving(true);
    const res = await createCartaCategoriaApi(operationalRestaurantId, {
      name,
      type: addCatType,
      cartaFamiliaId: addCatCartaFamiliaId,
      isActive: true,
    });
    setAddCatSaving(false);
    if (res.ok) {
      const rid = operationalRestaurantId;
      const [list, fams, mods] = await Promise.all([
        fetchCartaCategorias(rid),
        fetchCartaFamilias(rid),
        fetchModifierFamiliesForRestaurante(rid),
      ]);
      setCartaCategorias(list);
      setCartaFamilias(fams);
      setModifierFamilies(mods);
      const newCat = list.find((c) => c.id === res.item.id) ?? res.item;
      if (quickCreateOpen) {
        quickCreate.selectCategory(newCat.id);
      } else {
        setDraftCategoriaCartaId(newCat.id);
        setDraftCartaMenuFamiliaId(
          newCat.cartaFamiliaId?.trim() ? newCat.cartaFamiliaId.trim() : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED,
        );
        const familyPatch = buildProductFamilyPatchFromCategoryId(newCat.id, list);
        if (familyPatch.clearProductFamily) {
          setDraftProductFamilyId(CATEGORY_PRODUCT_FAMILY_NONE);
        } else if (familyPatch.productFamilyId) {
          setDraftProductFamilyId(familyPatch.productFamilyId);
        }
      }
      setAddCategoryOpen(false);
      setAddCatName("");
      setAddCatType(
        defaultCartaCategoriaTipoForTipoProducto(
          quickCreateOpen ? quickCreate.inheritedDraft.tipoVenta : draftTipo,
        ),
      );
      setAddCatCartaFamiliaId(undefined);
    }
  }

  async function toggleActivo(p: PlatoCarta) {
    const restauranteId = operationalRestaurantId;
    if (isCentralCatalog) {
      const flags = getPublicationFlags(p);
      try {
        await setCentralProductPublication(restauranteId, p.id, {
          visibleOnMenu: !flags.enCarta,
          active: flags.isActive,
        });
        setNotice("Guardado en catálogo central");
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      }
      window.setTimeout(() => setNotice(null), 2200);
      return;
    }
    if (isLegacyReadOnly) return;
    const now = new Date().toISOString();
    const next = items.map((x) => (x.id === p.id ? { ...x, activo: !x.activo, updatedAt: now } : x));
    persist(next);
    void (async () => {
      const pl = next.find((x) => x.id === p.id);
      if (pl) await mirrorPlatoToEscandalloRow(pl);
    })();
    setNotice(t("carta.noticeSaved"));
    window.setTimeout(() => setNotice(null), 2200);
  }

  /** Reactiva venta (`isActive`); no cambia visibilidad en carta. Campo opcional en persistencia JSON. */
  async function activateProducto(p: PlatoCarta) {
    const restauranteId = operationalRestaurantId;
    if (isCentralCatalog) {
      try {
        await activateCentralProduct(restauranteId, p.id);
        setNotice("Guardado en catálogo central");
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      }
      window.setTimeout(() => setNotice(null), 2200);
      return;
    }
    if (isLegacyReadOnly) return;
    const now = new Date().toISOString();
    const next = items.map((x) =>
      x.id === p.id ? ({ ...x, isActive: true, updatedAt: now } as PlatoCarta & { isActive?: boolean }) : x,
    );
    persist(next as PlatoCarta[]);
    void (async () => {
      const pl = next.find((x) => x.id === p.id);
      if (pl) await mirrorPlatoToEscandalloRow(pl);
    })();
    setNotice(t("carta.noticeSaved"));
    window.setTimeout(() => setNotice(null), 2200);
  }

  async function goToEscandallo(p: PlatoCarta) {
    if (!p.activo) return;
    setFormError(null);

    if (isCentralCatalog) {
      openEdit(p, { focus: "recipe" });
      return;
    }

    setEscNavId(p.id);
    try {
      const restauranteId = operationalRestaurantId;
      let platos = loadPlatos(restauranteId);
      const { next, error } = await ensureEscandalloRowsForPlatos(platos);
      if (error) {
        setFormError(t("carta.errorSyncEsc"));
        return;
      }
      if (next !== platos && !isCentralCatalog) {
        savePlatos(restauranteId, next);
        setItems(next);
        platos = next;
      }
      const linked = platos.find((x) => x.id === p.id);
      const sid = linked?.escandalloSupabaseId;
      if (sid == null) {
        setFormError(t("carta.errorSyncEsc"));
        return;
      }
      router.push(`/dashboard/escandallos/${sid}`);
    } finally {
      setEscNavId(null);
    }
  }

  function deleteProducto(p: PlatoCarta) {
    if (isLegacyReadOnly) return;
    setDeleteChoiceProduct(p);
  }

  const closeProductDeleteChoice = useCallback(() => {
    if (!deleteChoiceBusy) setDeleteChoiceProduct(null);
  }, [deleteChoiceBusy]);

  const deactivateProductChoice = useCallback(async () => {
    const p = deleteChoiceProduct;
    if (!p || isLegacyReadOnly) return;
    const restauranteId = operationalRestaurantId;
    setDeleteChoiceBusy(true);
    setFormError(null);
    try {
      if (isCentralCatalog) {
        await disableCentralProduct(restauranteId, p.id);
        applyCentralDeleteOutcomeToUi(p, "deactivated");
        setNotice("Producto desactivado.");
      } else {
        const now = new Date().toISOString();
        const next = items.map((x) =>
          x.id === p.id
            ? ({
                ...x,
                activo: false,
                enCarta: false,
                isActive: false,
                updatedAt: now,
              } as PlatoCarta & { enCarta?: boolean; isActive?: boolean })
            : x,
        );
        persist(next);
        setItems(next);
        if (editingId === p.id) {
          setFormOpen(false);
          setEditingId(null);
        }
        setNotice("Producto desactivado.");
      }
      setDeleteChoiceProduct(null);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (e) {
      setFormError(
        isCentralCatalog
          ? formatCentralCatalogWriteError(e)
          : e instanceof Error
            ? e.message
            : "No se pudo desactivar el producto.",
      );
    } finally {
      setDeleteChoiceBusy(false);
    }
  }, [
    deleteChoiceProduct,
    isLegacyReadOnly,
    operationalRestaurantId,
    isCentralCatalog,
    applyCentralDeleteOutcomeToUi,
    items,
    persist,
    editingId,
  ]);

  const deleteProductPermanently = useCallback(async () => {
    const p = deleteChoiceProduct;
    if (!p || isLegacyReadOnly) return;
    const restauranteId = operationalRestaurantId;
    setDeleteChoiceBusy(true);
    setFormError(null);
    try {
      if (isCentralCatalog) {
        await deleteCentralProductPermanently(restauranteId, p.id);
        applyCentralDeleteOutcomeToUi(p, "deleted");
        setNotice("Producto eliminado definitivamente.");
      } else {
        const next = items.filter((x) => x.id !== p.id);
        persist(next);
        setItems(next);
        if (editingId === p.id) {
          setFormOpen(false);
          setEditingId(null);
          setFormError(null);
        }
        setNotice("Producto eliminado definitivamente.");
      }
      setDeleteChoiceProduct(null);
      window.setTimeout(() => setNotice(null), 2200);
    } catch (e) {
      setFormError(
        isCentralCatalog
          ? formatCentralCatalogWriteError(e)
          : e instanceof Error
            ? e.message
            : "No se pudo eliminar el producto.",
      );
    } finally {
      setDeleteChoiceBusy(false);
    }
  }, [
    deleteChoiceProduct,
    isLegacyReadOnly,
    operationalRestaurantId,
    isCentralCatalog,
    applyCentralDeleteOutcomeToUi,
    items,
    persist,
    editingId,
  ]);

  const iceToolbarFilterSpecs = [
    { id: "todos" as const, label: t("carta.filterAll") },
    { id: "activos" as const, label: t("carta.filterActive") },
    { id: "inactivos" as const, label: t("carta.filterInactive") },
    { id: "conEscandallo" as const, label: t("carta.filterConEsc") },
    { id: "sinEscandallo" as const, label: t("carta.filterSinEsc") },
  ] as const;
  const CONFIG_CARTA_ADVANCED_ESC_FILTER_IDS = ["conEscandallo", "sinEscandallo"] as const;

  function renderCatalogFoodDrinkSegment(inline = false): ReactNode {
    const specs: ReadonlyArray<{
      id: CatalogFoodDrinkSegment;
      label: string;
      count: number;
    }> = [
      { id: "all", label: t("productos.catalogSegmentAll"), count: catalogFoodDrinkCounts.all },
      { id: "food", label: t("productos.catalogSegmentFood"), count: catalogFoodDrinkCounts.food },
      { id: "drink", label: t("productos.catalogSegmentDrink"), count: catalogFoodDrinkCounts.drink },
    ];

    return (
      <div
        className={
          inline
            ? "hostly-productos-carta-food-drink-segment hostly-productos-carta-food-drink-segment--inline"
            : "hostly-productos-carta-food-drink-segment"
        }
      >
        <HostlySegmentedControl
          aria-label={t("productos.catalogSegmentAria")}
          className="min-w-0 w-full"
        >
          {specs.map((spec) => {
            const active = catalogFoodDrinkSegment === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={hostlySegmentTabClassName(
                  "inline-flex items-center gap-1 !text-[11px]",
                )}
                onClick={() => setCatalogFoodDrinkSegment(spec.id)}
              >
                <span>{spec.label}</span>
                <span
                  style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
                  aria-hidden
                >
                  ({spec.count})
                </span>
              </button>
            );
          })}
        </HostlySegmentedControl>
      </div>
    );
  }

  /** UI only: filtros rápidos hielo; `cfgMergedStripe` = barra ultra compacta (config carta embed). */
  function iceToolbarFilterButtons(
    cfgMergedStripe: boolean,
    onlyIds?: readonly (typeof iceToolbarFilterSpecs)[number]["id"][],
  ): ReactNode {
    const useCartaV25 = configCartaProductosChrome;
    const dense = cfgMergedStripe;
    const specs = onlyIds ? iceToolbarFilterSpecs.filter((f) => onlyIds.includes(f.id)) : iceToolbarFilterSpecs;
    return specs.map((f) => {
      const active = listFilter === f.id;
      if (useCartaV25) {
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => setListFilter(f.id)}
            aria-pressed={active}
            className={`hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--status${active ? " is-active" : ""}`}
          >
            {f.label}
          </button>
        );
      }
      const passiveBorder =
        dense
          ? "1px solid rgba(148, 163, 184, 0.16)"
          : configCartaProductosChrome
            ? "1px solid rgba(148, 163, 184, 0.18)"
            : iceVisual
              ? "1px solid var(--hostly-line)"
              : "1px solid #334155";
      const inactiveBg =
        dense
          ? "rgba(255, 255, 255, 0.42)"
          : configCartaProductosChrome && iceVisual
            ? "rgba(255, 255, 255, 0.5)"
            : iceVisual
              ? "#fff"
              : "#0f172a";
      const inactiveInk =
        dense ? "var(--hostly-ink-muted)" : configCartaProductosChrome ? "var(--hostly-ink-muted)" : "#94a3b8";
      return (
        <button
          key={f.id}
          type="button"
          onClick={() => setListFilter(f.id)}
          style={{
            border: active ? "1px solid rgba(34, 197, 94, 0.55)" : passiveBorder,
            background: active
              ? iceVisual
                ? "rgba(220, 252, 231, 0.95)"
                : "rgba(34, 197, 94, 0.18)"
              : inactiveBg,
            color: active ? (iceVisual ? "#166534" : "#ecfdf5") : inactiveInk,
            padding: dense ? "3px 7px" : configCartaProductosChrome ? "4px 9px" : "5px 11px",
            borderRadius: 999,
            fontWeight: active ? 700 : dense ? 640 : configCartaProductosChrome ? 650 : 700,
            cursor: "pointer",
            fontSize: dense ? 10 : configCartaProductosChrome ? 11 : 12,
            lineHeight: dense ? 1.1 : 1.2,
            minHeight: dense ? 22 : configCartaProductosChrome ? 26 : 30,
          }}
        >
          {f.label}
        </button>
      );
    });
  }

  function iceToolbarViewControls(cfgMergedStripe: boolean): ReactNode {
    const useCartaV25 = configCartaProductosChrome;
    const dense = cfgMergedStripe;
    if (useCartaV25) {
      return (
        <>
          <button
            type="button"
            onClick={() => setViewMode("grouped")}
            aria-pressed={viewMode === "grouped"}
            className={`hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--view${viewMode === "grouped" ? " is-active" : ""}`}
          >
            Vista agrupada
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
            className={`hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--view${viewMode === "list" ? " is-active" : ""}`}
          >
            Vista lista
          </button>
        </>
      );
    }
    const shellStyle: CSSProperties = {
      display: "flex",
      gap: dense ? 4 : configCartaProductosChrome ? 5 : 6,
      alignItems: "center",
      flexWrap: "wrap",
      flexShrink: 0,
      ...(dense ? {} : { marginLeft: "auto" }),
    };
    return (
      <span style={shellStyle}>
        {!dense ? (
          <span
            style={{
              fontSize: configCartaProductosChrome ? 9 : 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#64748b",
            }}
          >
            Vista
          </span>
        ) : (
          <span
            style={{
              fontSize: 8,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#94a3b8",
              opacity: 0.85,
            }}
          >
            Vista
          </span>
        )}
        <button
          type="button"
          onClick={() => setViewMode("grouped")}
          style={{
            border:
              viewMode === "grouped"
                ? "1px solid rgba(56, 189, 248, 0.55)"
                : dense
                  ? "1px solid rgba(148, 163, 184, 0.16)"
                  : configCartaProductosChrome
                    ? "1px solid rgba(148, 163, 184, 0.18)"
                    : iceVisual
                      ? "1px solid var(--hostly-line)"
                      : "1px solid #334155",
            background:
              viewMode === "grouped"
                ? iceVisual
                  ? "rgba(224, 242, 254, 0.95)"
                  : "rgba(14, 165, 233, 0.14)"
                : dense && iceVisual
                  ? "rgba(255, 255, 255, 0.42)"
                  : configCartaProductosChrome && iceVisual
                    ? "rgba(255, 255, 255, 0.5)"
                    : iceVisual
                      ? "#fff"
                      : "#0f172a",
            color:
              viewMode === "grouped"
                ? iceVisual
                  ? "#0369a1"
                  : "#bae6fd"
                : dense && iceVisual
                  ? "var(--hostly-ink-muted)"
                  : configCartaProductosChrome
                    ? "var(--hostly-ink-muted)"
                    : "#94a3b8",
            padding: dense ? "3px 8px" : configCartaProductosChrome ? "4px 9px" : "5px 11px",
            borderRadius: 999,
            fontWeight: dense ? 720 : 800,
            cursor: "pointer",
            fontSize: dense ? 10 : configCartaProductosChrome ? 11 : 12,
            lineHeight: dense ? 1.1 : 1.2,
            minHeight: dense ? 22 : configCartaProductosChrome ? 26 : 30,
            whiteSpace: "nowrap",
          }}
        >
          Vista agrupada
        </button>
        <button
          type="button"
          onClick={() => setViewMode("list")}
          style={{
            border:
              viewMode === "list"
                ? "1px solid rgba(56, 189, 248, 0.55)"
                : dense
                  ? "1px solid rgba(148, 163, 184, 0.16)"
                  : configCartaProductosChrome
                    ? "1px solid rgba(148, 163, 184, 0.18)"
                    : iceVisual
                      ? "1px solid var(--hostly-line)"
                      : "1px solid #334155",
            background:
              viewMode === "list"
                ? iceVisual
                  ? "rgba(224, 242, 254, 0.95)"
                  : "rgba(14, 165, 233, 0.14)"
                : dense && iceVisual
                  ? "rgba(255, 255, 255, 0.42)"
                  : configCartaProductosChrome && iceVisual
                    ? "rgba(255, 255, 255, 0.5)"
                    : iceVisual
                      ? "#fff"
                      : "#0f172a",
            color:
              viewMode === "list"
                ? iceVisual
                  ? "#0369a1"
                  : "#bae6fd"
                : dense && iceVisual
                  ? "var(--hostly-ink-muted)"
                  : configCartaProductosChrome
                    ? "var(--hostly-ink-muted)"
                    : "#94a3b8",
            padding: dense ? "3px 8px" : configCartaProductosChrome ? "4px 9px" : "5px 11px",
            borderRadius: 999,
            fontWeight: dense ? 720 : 800,
            cursor: "pointer",
            fontSize: dense ? 10 : configCartaProductosChrome ? 11 : 12,
            lineHeight: dense ? 1.1 : 1.2,
            minHeight: dense ? 22 : configCartaProductosChrome ? 26 : 30,
            whiteSpace: "nowrap",
          }}
        >
          Vista lista
        </button>
      </span>
    );
  }

  /** Selector compacto Activos/Inactivos/Todos/En carta/Fuera — reutiliza listFilter. */
  function renderConfigCartaStatusFilterSelect(): ReactNode {
    return (
      <ConfigCartaStatusFilterSelect
        value={listFilter}
        counts={configStatusFilterCounts}
        onChange={(id: ConfigCartaListFilterId) => setListFilter(id)}
        t={t}
      />
    );
  }

  function renderCompactResolverParityCards(): ReactNode {
    if (!parityCatalogsLoaded) {
      return (
        <span className="hostly-filter-card-panel__loading" role="status">
          {t("productos.resolverParitySummaryLoading")}
        </span>
      );
    }

    const missingStation = resolverParitySummaryForTab.byIssue.FALTA_STATION;
    const heuristic = resolverParitySummaryForTab.byIssue.FALLBACK_HEURISTICO;
    const noOpStation = resolverParitySummaryForTab.byIssue.SIN_OPERATION_STATION;
    const cards: Array<{
      label: string;
      value: number;
      filterId: ResolverParityFilterId;
      tone?: "success" | "warning" | "danger";
    }> = [
      {
        label: t("productos.resolverParitySummaryTotal"),
        value: resolverParitySummaryForTab.total,
        filterId: "all",
      },
      {
        label: t("productos.resolverParitySummaryOk"),
        value: resolverParitySummaryForTab.ok,
        filterId: "ok",
        tone: "success",
      },
      {
        label: t("productos.resolverParitySummaryDivergence"),
        value: resolverParitySummaryForTab.withDivergence,
        filterId: "divergences",
        tone: resolverParitySummaryForTab.withDivergence > 0 ? "danger" : undefined,
      },
      {
        label: t("productos.resolverParitySummaryMissingStation"),
        value: missingStation,
        filterId: "missingStation",
        tone: missingStation > 0 ? "warning" : undefined,
      },
      {
        label: t("productos.resolverParitySummaryHeuristic"),
        value: heuristic,
        filterId: "heuristic",
        tone: heuristic > 0 ? "warning" : undefined,
      },
      {
        label: t("productos.resolverParitySummaryNoOpStation"),
        value: noOpStation,
        filterId: "missingOperationStation",
        tone: noOpStation > 0 ? "warning" : undefined,
      },
    ];

    return cards.map((card) => {
      const active = resolverParityFilter === card.filterId;
      return (
        <HostlyFilterCard
          key={card.filterId}
          label={card.label}
          value={card.value}
          tone={card.tone}
          active={active}
          onClick={() => handleResolverParityFilterChange(card.filterId)}
        />
      );
    });
  }

  function renderCategoryReorderControl(): ReactNode {
    if (!showCategoryReorderControl) return null;
    return (
      <button
        type="button"
        className="hostly-productos-carta-action hostly-productos-carta-action--secondary hostly-productos-carta-action--compact hostly-productos-carta-action--ops"
        disabled={!categoryReorderControl.enabled}
        title={categoryReorderControl.title}
        aria-label={categoryReorderControl.ariaLabel}
        onClick={categoryReorderControl.enabled ? toggleReorderMode : undefined}
      >
        {categoryReorderControl.label}
      </button>
    );
  }

  function renderConfigCartaHeaderActions(): ReactNode {
    return (
      <div className="hostly-productos-carta-header-inline-actions">
        <button
          type="button"
          disabled={isLegacyReadOnly}
          title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
          onClick={openCreate}
          className="hostly-button-primary hostly-button-compact hostly-productos-carta-header-inline-actions__btn hostly-productos-carta-header-inline-actions__btn--primary whitespace-nowrap"
          style={isLegacyReadOnly ? { opacity: 0.48, cursor: "not-allowed" } : undefined}
        >
          <svg
            className="hostly-productos-carta-header-inline-actions__icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Nuevo producto
        </button>
        <button
          type="button"
          className="hostly-productos-carta-header-inline-actions__more"
          aria-expanded={configCartaAdvancedOpen}
          aria-controls="hostly-productos-carta-advanced-panel"
          onClick={() => setConfigCartaAdvancedOpen((open) => !open)}
        >
          <svg
            className="hostly-productos-carta-header-inline-actions__icon"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          {configCartaAdvancedOpen ? "Menos opciones" : "Más opciones"}
        </button>
      </div>
    );
  }

  if (!profileReady || !hydrated) {
    if (configCartaProductosChrome) {
      return (
        <ConfigCartaWorkbench
          title="Productos"
          description="Catálogo maestro de productos del restaurante"
          compactSectionHeader={false}
          lockViewport
          lockViewportFillParent={lockViewportFillParent}
          visualVariant="productos"
          headerActions={renderConfigCartaHeaderActions()}
        >
          <p style={{ color: "#64748b", fontSize: 13 }}>{t("common.preparingData")}</p>
        </ConfigCartaWorkbench>
      );
    }
    return (
      <ModulePageShell
        title={t("productos.title")}
        subtitle={t("productos.loadingSubtitle")}
        maxWidth={PRODUCTOS_SHELL_MAX_WIDTH}
        compactLayout
        operationalFocus
        denseWorkbench
        lockViewport
        lockViewportFillParent={lockViewportFillParent}
        shellSurface={iceVisual ? "configLight" : "default"}
        denseInventoryHeader={emb}
      >
        <p style={{ color: iceVisual ? "#64748b" : "#94a3b8", fontSize: 13 }}>{t("common.preparingData")}</p>
      </ModulePageShell>
    );
  }

  if (operationalCatalog.tenantUnavailable) {
    if (configCartaProductosChrome) {
      return (
        <ConfigCartaWorkbench
          title="Productos"
          description="Catálogo maestro de productos del restaurante"
          compactSectionHeader={false}
          lockViewport
          lockViewportFillParent={lockViewportFillParent}
          visualVariant="productos"
          headerActions={renderConfigCartaHeaderActions()}
        >
          <p style={{ color: "#64748b", fontSize: 13 }}>
            No hay un restaurante asignado a tu usuario. Contacta con el administrador para vincular tu cuenta.
          </p>
        </ConfigCartaWorkbench>
      );
    }
    return (
      <ModulePageShell
        title={t("productos.title")}
        subtitle={t("productos.loadingSubtitle")}
        maxWidth={PRODUCTOS_SHELL_MAX_WIDTH}
        compactLayout
        operationalFocus
        denseWorkbench
        lockViewport
        lockViewportFillParent={lockViewportFillParent}
        shellSurface={iceVisual ? "configLight" : "default"}
        denseInventoryHeader={emb}
      >
        <p style={{ color: iceVisual ? "#64748b" : "#94a3b8", fontSize: 13 }}>
          No hay un restaurante asignado a tu usuario. Contacta con el administrador para vincular tu cuenta.
        </p>
      </ModulePageShell>
    );
  }

  const sharedProductModals = (
    <>
      {quickCreateOpen ? (
        <ProductQuickCreateDrawer
          open={quickCreateOpen}
          onClose={closeQuickCreate}
          categorias={categoriasForProductosSelector}
          quickCreate={quickCreate}
          t={t}
          addCategoryOpen={addCategoryOpen}
          onCreated={() => {
            /* El listado se actualiza vía listener; feedback inline en el drawer. */
          }}
          onOpenAdvancedConfig={openAdvancedCreateFromQuickDraft}
          onOpenAddCategory={() => {
            openAddCategoryDialog(() => {
              setAddCatType(
                defaultCartaCategoriaTipoForTipoProducto(quickCreate.inheritedDraft.tipoVenta),
              );
              const menuFamId = quickCreate.inheritedDraft.cartaMenuFamiliaId;
              setAddCatCartaFamiliaId(
                menuFamId && menuFamId !== CARTA_MENU_FAMILIA_FILTER_UNASSIGNED
                  ? menuFamId
                  : undefined,
              );
            });
          }}
        />
      ) : null}
      {formOpen ? (
        <div
          className="hostly-product-form-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? t("carta.editProduct") : t("carta.newProduct")}
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) requestCloseForm();
          }}
        >
          <aside
            ref={advancedFormDrawerRef}
            tabIndex={-1}
            className="hostly-product-form-drawer hostly-product-form-drawer--v3"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="hostly-product-form-drawer__header">
              <div className="hostly-product-form-drawer__header-text">
                <span className="hostly-product-form-drawer__eyebrow">
                  {editingId
                    ? t("carta.productFormEyebrowEdit")
                    : t("carta.productFormEyebrowNew")}
                </span>
                <h2 className="hostly-product-form-drawer__title">
                  {editingId && draftNombre.trim()
                    ? draftNombre.trim()
                    : editingId
                      ? t("carta.editProduct")
                      : t("carta.newProduct")}
                </h2>
                <p className="hostly-product-form-drawer__subtitle">
                  Venta, cocina y costes en una sola ficha.
                </p>
                <div className="hostly-product-form-drawer__context" aria-label="Resumen del producto">
                  <span>{draftSelectedCategory?.name || "Sin categoría"}</span>
                  <span>{draftPrecio.trim() ? `${draftPrecio.trim()} €` : "Sin precio"}</span>
                  <span
                    className={
                      draftActivo
                        ? "hostly-product-form-drawer__context-status is-active"
                        : "hostly-product-form-drawer__context-status"
                    }
                  >
                    {draftActivo ? "A la venta" : "No disponible"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="hostly-product-form-drawer__close"
                onClick={requestCloseForm}
                aria-label={t("carta.productFormClose")}
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span>{t("carta.productFormClose")}</span>
              </button>
            </div>

            <ProductFormDrawerTabs activeTab={productFormTab} onTabChange={setProductFormTab} />

            <div className="hostly-product-form-drawer__body hostly-product-form-drawer__body--tabbed">
              <ProductFormDrawerTabPanel tabId="producto" activeTab={productFormTab}>
                <div className="hostly-product-form-drawer-tab-panel__stack">
                  <ProductFormDrawerZone
                    title={t("carta.productFormBlockProduct")}
                    description={t("carta.productFormBlockProductHint")}
                  >
                    <div className="hostly-product-form-drawer-primary__grid">
                      <label className="hostly-carta-config-form-field hostly-product-form-drawer-grid__full">
                        <span className="hostly-carta-config-form-label">{t("carta.fieldNombre")}</span>
                        <input
                          ref={nombreInputRef}
                          className={drawerInputProminentClass}
                          value={draftNombre}
                          onChange={(e) => setDraftNombre(e.target.value)}
                        />
                      </label>

                      <label className="hostly-carta-config-form-field hostly-product-form-drawer-grid__cell">
                        <span className="hostly-carta-config-form-label">{t("carta.fieldPrecio")}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min={0}
                          className={`${drawerInputProminentClass} tabular-nums`}
                          value={draftPrecio}
                          onChange={(e) => setDraftPrecio(e.target.value)}
                        />
                      </label>

                      <div className="hostly-product-form-drawer-grid__cell hostly-product-form-drawer-grid__cell--tipo">
                        <div className="hostly-carta-config-form-field">
                          <span className="hostly-carta-config-form-label">{t("carta.fieldTipo")}</span>
                          <div
                            className="hostly-product-form-drawer-radio-group hostly-product-form-drawer-radio-group--inline"
                            role="radiogroup"
                            aria-label={t("carta.fieldFormatManualPrompt")}
                          >
                            {TIPOS_PRODUCTO_VENTA.map((tipo) => (
                              <label key={tipo} className="hostly-product-form-drawer-radio">
                                <input
                                  type="radio"
                                  name="product-form-draft-tipo"
                                  checked={draftTipo === tipo}
                                  onChange={() => handleDraftTipoChange(tipo)}
                                />
                                {labelTipoVenta(t, tipo)}
                              </label>
                            ))}
                          </div>
                          <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                            El tipo filtra las categorías disponibles.
                          </p>
                        </div>
                      </div>
                    </div>
                    <label className="hostly-product-form-sale-status">
                      <input
                        type="checkbox"
                        checked={draftActivo}
                        onChange={(e) => setDraftActivo(e.target.checked)}
                      />
                      <span className="hostly-product-form-sale-status__copy">
                        <strong>Disponible para la venta</strong>
                        <small>Se muestra en el catálogo operativo y puede añadirse a comandas.</small>
                      </span>
                      <span
                        className={
                          draftActivo
                            ? "hostly-product-form-sale-status__badge is-active"
                            : "hostly-product-form-sale-status__badge"
                        }
                      >
                        {draftActivo ? "Activo" : "Inactivo"}
                      </span>
                    </label>
                  </ProductFormDrawerZone>

                  <ProductFormDrawerZone
                    title={t("carta.productFormBlockCarta")}
                    description={t("carta.productFormBlockCartaHint")}
                  >
                    <div className="hostly-product-form-catalog-hierarchy hostly-product-form-catalog-hierarchy--embedded hostly-product-form-catalog-hierarchy--category-first">
                      <div className="hostly-product-form-catalog-hierarchy__child">
                        <CategoriaCartaFormField
                          t={t}
                          categorias={categoriasForForm}
                          selectedId={draftCategoriaCartaId}
                          onSelectId={applyCategorySelection}
                          hintClassName="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint"
                          onOpenAddCategory={() => {
                            openAddCategoryDialog(
                              () => {
                                setAddCatType(defaultCartaCategoriaTipoForTipoProducto(draftTipo));
                                const fid =
                                  draftSelectedCategory?.cartaFamiliaId?.trim() ||
                                  draftCartaMenuFamiliaId;
                                setAddCatCartaFamiliaId(
                                  fid && fid !== CARTA_MENU_FAMILIA_FILTER_UNASSIGNED
                                    ? fid
                                    : undefined,
                                );
                              },
                              { restoreViaDrawerFallback: true },
                            );
                          }}
                        />
                      </div>

                      <div className="hostly-product-form-derived-family" role="note">
                        <span className="hostly-carta-config-form-label">{t("carta.fieldCartaFamilia")}</span>
                        <div className="hostly-product-form-derived-family__card">
                          <span className="hostly-product-form-derived-family__value">
                            {draftDerivedMenuFamilyLabel}
                          </span>
                          <span className="hostly-product-form-derived-family__hint">
                            {draftDerivedMenuFamilyHint}
                          </span>
                        </div>
                      </div>

                      <details
                        className="hostly-product-form-family-override"
                        open={draftFamilyOverrideOpen}
                        onToggle={(event) =>
                          setDraftFamilyOverrideOpen(event.currentTarget.open)
                        }
                      >
                        <summary className="hostly-product-form-family-override__summary">
                          Caso especial: cambiar filtro de familia
                        </summary>
                        <label className="hostly-carta-config-form-field hostly-product-form-catalog-hierarchy__parent">
                          <span className="hostly-carta-config-form-label">{t("carta.fieldCartaFamilia")}</span>
                          <select
                            className={drawerInputClass}
                            value={draftCartaMenuFamiliaId === null ? "" : draftCartaMenuFamiliaId}
                            onChange={(e) => {
                              const v = e.target.value;
                              const nextFilter = v === "" ? null : v;
                              setDraftCartaMenuFamiliaId(nextFilter);
                              setDraftCategoriaCartaId((cur) => {
                                if (!cur) return null;
                                const allowed = cartaCategoriasForProductForm(
                                  cartaCategorias,
                                  draftTipo,
                                  nextFilter,
                                  { currentCategoryId: cur },
                                );
                                return allowed.some((x) => x.id === cur) ? cur : null;
                              });
                            }}
                          >
                            <option value="">{t("carta.familiaFilterAll")}</option>
                            <option value={CARTA_MENU_FAMILIA_FILTER_UNASSIGNED}>
                              {t("carta.familiaFilterUnassigned")}
                            </option>
                            {[...cartaFamilias]
                              .filter((f) => f.isActive !== false)
                              .sort(
                                (a, b) =>
                                  a.sortOrder - b.sortOrder ||
                                  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
                              )
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                </option>
                              ))}
                          </select>
                          <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                            Úsalo solo para categorías heredadas o casos de compatibilidad.
                          </p>
                        </label>
                      </details>
                    </div>
                  </ProductFormDrawerZone>
                </div>
              </ProductFormDrawerTabPanel>

              <ProductFormDrawerTabPanel tabId="operacion" activeTab={productFormTab}>
                <div className="hostly-product-form-drawer-tab-panel__stack">
                  <ProductFormDrawerZone
                    title={t("carta.productFormBlockProduction")}
                    description={t("carta.productFormBlockProductionHint")}
                  >
                    <div
                      ref={routingFocusRef}
                      className={[
                        "hostly-product-form-routing-focus",
                        editFocus === "routing" ? "hostly-product-form-routing-focus--active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {editFocus === "routing" ? (
                        <p className="hostly-product-form-routing-focus__banner" role="status">
                          {t("productos.routingEditFocusHint")}
                        </p>
                      ) : null}
                      <div className="hostly-product-form-drawer-primary__grid">
                        <label
                          className={`hostly-carta-config-form-field hostly-product-form-drawer-grid__cell${!isCentralCatalog ? " hostly-product-form-drawer-grid__full" : ""}`}
                        >
                          <span className="hostly-carta-config-form-label">{t("carta.fieldOperationStation")}</span>
                          <OperationStationProductSelect
                            restaurantId={operationalRestaurantId}
                            value={draftOperationStationSelect}
                            onChange={setDraftOperationStationSelect}
                            disabled={drawerSyncing}
                            className={drawerInputClass}
                          />
                          {isLegacyOperationStationSelectValue(draftOperationStationSelect) ? (
                            <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                              {t("carta.fieldOperationStationLegacyHint")}
                            </p>
                          ) : null}
                          {preventiveFieldWarnings.destination.length > 0 ? (
                            <div className="hostly-product-form-field-warning" role="status">
                              {preventiveFieldWarnings.destination.map((message) => (
                                <p key={message} className="hostly-product-form-field-warning__line">
                                  {message}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </label>

                        {isCentralCatalog ? (
                          draftSkipsMenuCourse ? (
                            <label className="hostly-carta-config-form-field hostly-product-form-drawer-grid__cell">
                              <span className="hostly-carta-config-form-label">{t("carta.fieldDefaultCourse")}</span>
                              <div
                                className={`${drawerInputClass} hostly-product-form-drawer-readonly`}
                                aria-readonly
                              >
                                {t("carta.productFormCourseLockedLabel")}
                              </div>
                            </label>
                          ) : (
                            <label className="hostly-carta-config-form-field hostly-product-form-drawer-grid__cell">
                              <span className="hostly-carta-config-form-label">{t("carta.fieldDefaultCourse")}</span>
                              <select
                                className={drawerInputClass}
                                value={draftCourse}
                                onChange={(e) => setDraftCourse(e.target.value)}
                                disabled={drawerSyncing}
                              >
                                <option value="">Sin pase</option>
                                <option value="1">Entrante</option>
                                <option value="2">Primero</option>
                                <option value="3">Segundo</option>
                                <option value="4">Postre</option>
                              </select>
                            </label>
                          )
                        ) : null}
                      </div>
                    </div>
                  </ProductFormDrawerZone>

                  <ProductFormDrawerZone
                    title={t("carta.productFormSubgroupBehavior")}
                    description={t("carta.productFormSubgroupBehaviorHint")}
                  >
                    <div className="hostly-product-form-drawer-primary__grid">
                      {isCentralCatalog ? (
                        <div className="hostly-carta-config-form-field hostly-product-form-drawer-grid__cell hostly-product-form-drawer-grid__cell--composition">
                          <span className="hostly-carta-config-form-label">
                            {t("carta.fieldProductCompositionType")}
                          </span>
                          <div
                            className="hostly-product-form-drawer-radio-group hostly-product-form-drawer-radio-group--inline"
                            role="radiogroup"
                            aria-label={t("carta.fieldProductCompositionType")}
                          >
                            {PRODUCT_COMPOSITION_TYPE_VALUES.map((compositionType) => (
                              <label
                                key={compositionType}
                                className="hostly-product-form-drawer-radio"
                              >
                                <input
                                  type="radio"
                                  name="product-form-draft-composition-type"
                                  checked={draftProductCompositionType === compositionType}
                                  onChange={() => setDraftProductCompositionType(compositionType)}
                                  disabled={drawerSyncing}
                                />
                                {compositionType === "simple"
                                  ? t("carta.fieldProductCompositionSimple")
                                  : t("carta.fieldProductCompositionComposed")}
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : null}

                    </div>
                  </ProductFormDrawerZone>

                  <details
                    className="hostly-product-form-internal-classification"
                    open={preventiveFieldWarnings.family.length > 0}
                  >
                    <summary className="hostly-product-form-internal-classification__summary">
                      Clasificación interna
                    </summary>
                    <div className="hostly-product-form-drawer-primary__grid">
                      <label className="hostly-carta-config-form-field hostly-product-form-drawer-grid__cell hostly-product-form-drawer-grid__full">
                        <span className="hostly-carta-config-form-label">Familia de producto</span>
                        <CategoryProductFamilySelect
                          restaurantId={operationalRestaurantId}
                          value={draftProductFamilyId}
                          onChange={setDraftProductFamilyId}
                          disabled={drawerSyncing}
                          className={drawerInputClass}
                        />
                        {preventiveFieldWarnings.family.length > 0 ? (
                          <div className="hostly-product-form-field-warning" role="status">
                            {preventiveFieldWarnings.family.map((message) => (
                              <p key={message} className="hostly-product-form-field-warning__line">
                                {message}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </label>
                    </div>
                  </details>
                </div>
              </ProductFormDrawerTabPanel>

              <ProductFormDrawerTabPanel tabId="modificadores" activeTab={productFormTab}>
                <div className="hostly-product-form-drawer-tab-panel__stack">
                  <ProductFormDrawerZone title="Modificadores" description="Los de categoría se aplican automáticamente; los propios solo afectan a este producto.">
                      {activeModifierGroups.length === 0 ? (
                        <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                          Sin grupos activos.{" "}
                          <Link
                            href="/dashboard/configuracion/modificadores"
                            className="hostly-carta-config-text-link"
                          >
                            Crear modificadores
                          </Link>
                        </p>
                      ) : (
                        <div
                          className="hostly-carta-config-form-field"
                          style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}
                        >
                          <div className="hostly-carta-config-form-field">
                            <span className="hostly-carta-config-form-label">
                              Modificadores heredados de la categoría
                            </span>
                            <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                              Estos modificadores vienen de la categoría del producto.
                              {draftSelectedCategory?.name
                                ? ` (${draftSelectedCategory.name})`
                                : ""}
                            </p>
                            {inheritedModifierGroups.length === 0 ? (
                              <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                                {draftSelectedCategory
                                  ? "La categoría no tiene modificadores asignados."
                                  : "Asigna una categoría para ver modificadores heredados."}
                              </p>
                            ) : (
                              <div
                                className="hostly-carta-category-form-drawer__chips"
                                aria-readonly
                              >
                                {inheritedModifierGroups.map((group) => (
                                  <span
                                    key={group.id}
                                    className="hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--category is-active"
                                    aria-disabled="true"
                                    style={{
                                      opacity: 0.72,
                                      cursor: "default",
                                      pointerEvents: "none",
                                      filter: "saturate(0.82)",
                                    }}
                                  >
                                    {group.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="hostly-carta-config-form-field">
                            <span className="hostly-carta-config-form-label">
                              Modificadores propios del producto
                            </span>
                            <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                              Estos modificadores solo se aplican a este producto.
                            </p>
                            {ownSelectableModifierGroups.length === 0 ? (
                              <p className="hostly-carta-config-form-hint hostly-product-form-drawer-primary__hint">
                                No hay grupos adicionales disponibles fuera de la categoría.
                              </p>
                            ) : (
                              <div className="hostly-carta-category-form-drawer__chips">
                                {ownSelectableModifierGroups.map((group) => {
                                  const selected = draftModifierGroupIds.includes(
                                    group.id,
                                  );
                                  return (
                                    <label
                                      key={group.id}
                                      className={`hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--category${selected ? " is-active" : ""}`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={selected}
                                        disabled={drawerSyncing}
                                        onChange={() =>
                                          toggleProductOwnModifierGroup(group.id)
                                        }
                                      />
                                      {group.name}
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                  </ProductFormDrawerZone>
                </div>
              </ProductFormDrawerTabPanel>

              <ProductFormDrawerTabPanel tabId="escandallo" activeTab={productFormTab}>
                <div className="hostly-product-form-drawer-tab-panel__stack">
                  {isCentralCatalog ? (
                    <ProductFormEscandalloSummaryCard
                      recipeEnabled={draftRecipeEnabled}
                      recipeRows={draftRecipeRows}
                      saleProductId={editingId}
                      salePrice={draftSalePriceForProfitability}
                      productDocumentsById={centralDocsById}
                      disabled={drawerSyncing}
                      onEdit={() => setEscandalloModalOpen(true)}
                    />
                  ) : (
                    <p className="hostly-carta-config-form-hint">
                      Escandallo disponible con catálogo central.
                    </p>
                  )}
                </div>
              </ProductFormDrawerTabPanel>

              <ProductFormDrawerTabPanel tabId="comercial" activeTab={productFormTab}>
                <div className="hostly-product-form-drawer-tab-panel__stack">
                  <ProductFormCommercialInfoSummaryCard
                    description={draftDesc}
                    hasImage={draftCommercialHasImage}
                    imagePreviewUrl={draftCommercialImagePreviewUrl}
                    disabled={drawerSyncing}
                    onEdit={() => setCommercialInfoModalOpen(true)}
                  />
                </div>
              </ProductFormDrawerTabPanel>

              {formError ? (
                <div
                  className="hostly-carta-config-alert hostly-carta-config-alert--error hostly-product-form-drawer__inline-error"
                  role="alert"
                >
                  {formError}
                </div>
              ) : null}
            </div>

            <div className="hostly-product-form-drawer__footer">
              <p className="hostly-product-form-drawer__footer-hint">
                {t("carta.productFormRestaurantScopeHint")}
              </p>
              <ConfigBtnPrimary
                type="button"
                className="hostly-product-form-drawer__footer-primary"
                disabled={drawerSyncing}
                onClick={() => void submitForm()}
              >
                {drawerSyncing ? t("common.preparing") : t("common.save")}
              </ConfigBtnPrimary>
              <ConfigBtnSecondary type="button" onClick={requestCloseForm}>
                {t("common.cancel")}
              </ConfigBtnSecondary>
            </div>
          </aside>
        </div>
      ) : null}

      {formOpen ? (
        <ProductAdvancedFormDiscardConfirm
          open={discardFormConfirmOpen}
          saving={drawerSyncing}
          onKeepEditing={dismissDiscardFormConfirm}
          onDiscard={confirmDiscardForm}
        />
      ) : null}

      {formOpen ? (
        <ProductFormCommercialInfoModal
          open={commercialInfoModalOpen}
          productId={editingId}
          productName={draftNombre}
          isCentralCatalog={isCentralCatalog}
          description={draftDesc}
          onDescriptionChange={setDraftDesc}
          fotoUrl={draftFoto}
          onFotoUrlChange={setDraftFoto}
          imagePreviewUrl={draftImagePreviewUrl}
          imageFileInputRef={draftImageFileInputRef}
          onImageFileChange={handleDraftImageFileChange}
          onRemoveImage={handleRemoveDraftImage}
          showImagePreview={Boolean(draftImagePreviewUrl && !draftRemoveImage)}
          disabled={drawerSyncing}
          drawerInputClass={drawerInputClass}
          t={t}
          onClose={() => setCommercialInfoModalOpen(false)}
        />
      ) : null}

      {isCentralCatalog && formOpen ? (
        <ProductFormEscandalloModal
          open={escandalloModalOpen}
          productName={draftNombre}
          saleProductId={editingId}
          recipeEnabled={draftRecipeEnabled}
          onRecipeEnabledChange={setDraftRecipeEnabled}
          recipeRows={draftRecipeRows}
          onRecipeRowsChange={setDraftRecipeRows}
          salePrice={draftSalePriceForProfitability}
          productDocumentsById={centralDocsById}
          inventoryProducts={inventoryLookup}
          recipeWarnings={draftRecipeWarnings}
          disabled={drawerSyncing}
          labelStyle={labelStyle}
          inputStyle={inputStyle}
          onClose={() => setEscandalloModalOpen(false)}
        />
      ) : null}

      {addCategoryOpen ? (
        <div
          className={[
            "hostly-carta-config-drawer-backdrop",
            "hostly-carta-config-drawer-backdrop--elevated",
            quickCreateOpen ? "hostly-carta-config-drawer-backdrop--over-quick-create" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label={t("cartaCategories.quickAddTitle")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeAddCategoryDialog();
          }}
        >
          <ConfigCard className="hostly-carta-config-drawer">
            <h2 className="hostly-carta-config-drawer__title">{t("cartaCategories.quickAddTitle")}</h2>
            <div className="hostly-carta-config-form hostly-carta-config-drawer__body">
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">{t("cartaCategories.name")}</span>
                <input
                  className={drawerInputClass}
                  value={addCatName}
                  onChange={(e) => setAddCatName(e.target.value)}
                />
              </label>
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">{t("cartaCategories.typeField")}</span>
                <select
                  className={drawerInputClass}
                  value={addCatType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAddCatType(isCartaCategoriaTipo(v) ? v : "general");
                  }}
                >
                  <option value="food">{t("cartaCategories.type.food")}</option>
                  <option value="drink">{t("cartaCategories.type.drink")}</option>
                  <option value="general">{t("cartaCategories.type.general")}</option>
                </select>
              </label>
            </div>
            <div className="hostly-carta-config-drawer__footer">
              <ConfigBtnPrimary type="button" disabled={addCatSaving} onClick={() => void saveQuickCategory()}>
                {t("common.save")}
              </ConfigBtnPrimary>
              <ConfigBtnSecondary type="button" onClick={closeAddCategoryDialog}>
                {t("common.cancel")}
              </ConfigBtnSecondary>
            </div>
          </ConfigCard>
        </div>
      ) : null}
      <ProductosBulkAssignCourseModal
        open={bulkAssignCourseOpen}
        count={selectedIds.size}
        saving={bulkAssignCourseSaving}
        initialSelectValue={bulkInitialCourseSelectValue}
        onClose={() => {
          if (!bulkAssignCourseSaving) setBulkAssignCourseOpen(false);
        }}
        onConfirm={(value) => void confirmBulkAssignCourse(value)}
        t={t}
      />
      <ProductosBulkAssignDestinationModal
        open={bulkAssignDestinationOpen}
        count={selectedIds.size}
        saving={bulkAssignDestinationSaving}
        initialSelectValue={bulkInitialDestinationSelectValue}
        onClose={() => {
          if (!bulkAssignDestinationSaving) setBulkAssignDestinationOpen(false);
        }}
        onConfirm={(value) => void confirmBulkAssignDestination(value)}
        t={t}
      />
      <ProductosBulkAssignCategoryModal
        open={bulkAssignCategoryOpen}
        count={selectedIds.size}
        saving={bulkAssignCategorySaving}
        categorias={cartaCategorias}
        initialSelectValue={bulkInitialCategorySelectValue}
        onClose={() => {
          if (!bulkAssignCategorySaving) setBulkAssignCategoryOpen(false);
        }}
        onConfirm={(categoryId, categoryName) =>
          void confirmBulkAssignCategory(categoryId, categoryName)
        }
        t={t}
      />
      <ProductosBulkAssignFamilyModal
        open={bulkAssignFamilyOpen}
        count={selectedIds.size}
        saving={bulkAssignFamilySaving}
        families={productFamilies}
        initialSelectValue={bulkInitialFamilySelectValue}
        onClose={() => {
          if (!bulkAssignFamilySaving) setBulkAssignFamilyOpen(false);
        }}
        onConfirm={(familyId) => void confirmBulkAssignFamily(familyId)}
        t={t}
      />
      <ProductosBulkDeleteModal
        open={bulkDeleteOpen}
        count={selectedIds.size}
        saving={bulkDeleteSaving}
        onClose={() => {
          if (!bulkDeleteSaving) setBulkDeleteOpen(false);
        }}
        onConfirm={() => void confirmBulkDelete()}
        t={t}
      />
      <CartaDeleteChoiceModal
        open={deleteChoiceProduct != null}
        title={t("productos.deleteChoiceTitle")}
        message={t("productos.deleteChoiceMessage")}
        deactivateLabel={t("productos.deactivateChoice")}
        deletePermanentLabel={t("productos.deletePermanentChoice")}
        deletePermanentHint={t("productos.deletePermanentHint")}
        cancelLabel={t("common.cancel")}
        busy={deleteChoiceBusy}
        onCancel={closeProductDeleteChoice}
        onDeactivate={() => void deactivateProductChoice()}
        onDeletePermanent={() => void deleteProductPermanently()}
      />
    </>
  );

  if (configCartaProductosChrome && reorderMode) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: productosTableInteractionStyles }} />
        <div className="hostly-reorder-mode-shell flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col">
          <ModulePageShell
            title=""
            maxWidth={1280}
            compactLayout
            operationalFocus
            denseWorkbench
            lockViewport
            lockViewportFillParent={lockViewportFillParent}
            shellSurface="configLight"
            hideBackLink
            hideLogoutButton
          >
            <div
              className="hostly-reorder-mode flex min-h-0 flex-1 flex-col"
              role="region"
              aria-label={t("productos.orderModeTitle")}
            >
              <header className="hostly-reorder-mode__header">
                <button type="button" className="hostly-reorder-mode__back" onClick={exitReorderMode}>
                  <span aria-hidden>←</span> {t("productos.orderModeExit")}
                </button>
                <h1 className="hostly-reorder-mode__title">{t("productos.orderModeTitle")}</h1>
                {activeReorderCategoryLabel ? (
                  <p className="hostly-reorder-mode__category">
                    {t("productos.orderModeCategoryLabel", { name: activeReorderCategoryLabel })}
                  </p>
                ) : null}
                <p className="hostly-reorder-mode__hint">{t("productos.orderModeDragHint")}</p>
              </header>
              <div className="hostly-reorder-mode__body flex min-h-0 flex-1 flex-col">
                {formError && !formOpen ? (
                  <div className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">
                    {formError}
                  </div>
                ) : null}
                {items.length === 0 ? (
                  <div className="hostly-productos-carta-empty">
                    <p className="hostly-productos-carta-empty__title">{t("carta.emptyTitle")}</p>
                    <p className="hostly-productos-carta-empty__body">{t("carta.emptyBody")}</p>
                  </div>
                ) : tabFilteredSorted.length === 0 ? (
                  <div className="hostly-productos-carta-muted-empty">{t("stock.filterEmpty")}</div>
                ) : (
                  <>
                  <ProductosResolverParitySummaryStrip
                    summary={resolverParitySummaryForTab}
                    loading={!parityCatalogsLoaded}
                    activeFilter={resolverParityFilter}
                    onFilterChange={handleResolverParityFilterChange}
                    filteredCount={parityFilteredSorted.length}
                    t={t}
                  />
                  <ProductosCartaDataView
                    displayed={tabFilteredSorted}
                    groupedByCategoria={groupedByCategoria}
                    viewMode="list"
                    selectedIds={selectedIds}
                    selectAllRef={selectAllRef}
                    isLegacyReadOnly={isLegacyReadOnly}
                    meta={meta}
                    centralDocsById={centralDocsById}
                    escNavId={escNavId}
                    locale={locale as Locale}
                    t={t}
                    toggleRowSelected={toggleRowSelected}
                    toggleSelectAllDisplayed={toggleSelectAllDisplayed}
                    openEdit={openEdit}
                    toggleActivo={toggleActivo}
                    activateProducto={activateProducto}
                    goToEscandallo={goToEscandallo}
                    deleteProducto={deleteProducto}
                    clearSelection={clearSelection}
                    reorderMode
                    reorderBusyId={reorderBusyId}
                    onReorderProducts={(orderedIds) => void reorderProductsInCategory(orderedIds)}
                    reorderFocusLayout
                    activeCategoryLabel={activeReorderCategoryLabel}
                    operationStations={operationStations}
                    productionStations={productionStations}
                    cartaCategorias={cartaCategorias}
                    cartaFamilias={cartaFamilias}
                    inlineEdit={productTableInlineEdit}
                  />
                  </>
                )}
              </div>
            </div>
          </ModulePageShell>
          </div>
        </div>
        {sharedProductModals}
      </>
    );
  }

  if (configCartaProductosChrome) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: productosTableInteractionStyles }} />
        <ConfigCartaWorkbench
          title="Productos"
          description="Catálogo, precios y configuración de venta del restaurante."
          compactSectionHeader={false}
          lockViewport
          lockViewportFillParent={lockViewportFillParent}
          visualVariant="productos"
          headerActions={renderConfigCartaHeaderActions()}
        >
          <HostlySection
            stack="sm"
            className="hostly-productos-config-skin hostly-productos-config-skin--simplified hostly-productos-v3 hostly-productos-v3--operations min-h-0 min-w-0 flex-1 overflow-hidden !gap-0"
            style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 }}
          >
            {notice ? (
              <p className="hostly-carta-config-alert hostly-carta-config-alert--success" role="status">
                {notice}
              </p>
            ) : null}
            {formError && !formOpen ? (
              <div className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">
                {formError}
              </div>
            ) : null}
            <ProductosTableChrome iceVisual embedFlatChrome>
              <>
              <div className="hostly-productos-v3__command-bar">
              <div className="hostly-productos-v3__command-bar-primary">
              <div className="hostly-productos-carta-toolbar hostly-productos-carta-toolbar--radical hostly-productos-carta-toolbar--config-primary hostly-productos-carta-toolbar--hero-search hostly-productos-v3__search">
              <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Buscar producto..."
              aria-label="Buscar producto"
              className="hostly-config-canonical-search hostly-productos-carta-search hostly-productos-carta-search--prominent hostly-productos-carta-search--field"
              />
              </div>
              <div className="hostly-productos-v3__status-wrap">
                {renderConfigCartaStatusFilterSelect()}
              </div>
              </div>
              <div className="hostly-productos-v3__command-bar-filters">
                <ProductosCategoryNavigation
                  options={tabOptions}
                  value={categoryTab}
                  onChange={setCategoryTab}
                  categoriesLabel={t("cartaCategories.title")}
                />
                {renderCategoryReorderControl()}
              </div>
              </div>
              {configCartaAdvancedOpen ? (
              <div
              id="hostly-productos-carta-advanced-panel"
              className="hostly-productos-carta-advanced-panel hostly-productos-carta-advanced-panel--inline hostly-productos-v3__advanced-panel"
              >
              <div className="hostly-productos-v3__advanced-tools-row">
              <nav className="hostly-productos-carta-advanced-nav hostly-productos-v3__advanced-tools" aria-label="Navegación avanzada de carta">
              <Link href="/dashboard/configuracion/carta/categorias">{t("cartaCategories.manageLink")}</Link>
              <button
              type="button"
              onClick={() => router.push("/dashboard/configuracion/carta/modificadores")}
              >
              {t("carta.ctaModifiers")}
              </button>
              <Link href="/dashboard/configuracion/carta/escandallos">Escandallos</Link>
              <ProductCatalogImageBulkPanel />
              <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push("/dashboard/configuracion/carta/importacion");
              }}
              >
              Importar IA
              </button>
              </nav>
              {renderCatalogFoodDrinkSegment(true)}
              </div>
              <div className="hostly-productos-v3__advanced-controls-row">
              <div className="hostly-productos-v3__advanced-group">
              <span className="hostly-productos-v3__advanced-label">Escandallo</span>
              <div className="hostly-productos-carta-filter-chips hostly-productos-v3__advanced-chips">
              {iceToolbarFilterButtons(true, CONFIG_CARTA_ADVANCED_ESC_FILTER_IDS)}
              </div>
              </div>
              <div className="hostly-productos-v3__advanced-group">
              <span className="hostly-productos-v3__advanced-label">Vista</span>
              <div className="hostly-productos-carta-view-discreet hostly-productos-v3__advanced-chips" role="group" aria-label="Modo de vista">
              {iceToolbarViewControls(true)}
              </div>
              </div>
              {items.length > 0 ? (
              <div className="hostly-productos-v3__advanced-group hostly-productos-v3__advanced-group--kpis">
              <span className="hostly-productos-v3__advanced-label">KPIs</span>
              <div
                className="hostly-filter-card-grid hostly-filter-card-grid--metrics"
                role="group"
                aria-label={t("productos.resolverParitySummaryAria")}
              >
              {renderCompactResolverParityCards()}
              </div>
              </div>
              ) : null}
              </div>
              <CatalogMigrationPreviewPanel
                restaurantId={operationalRestaurantId}
                catalogSource={operationalCatalog.source}
                iceVisual={iceVisual}
              />
              <LegacyPlatosArchivePanel
                restaurantId={operationalRestaurantId}
                catalogSource={operationalCatalog.source}
                iceVisual={iceVisual}
                onArchived={() => {
                  setNotice("Copia local archivada");
                  window.setTimeout(() => setNotice(null), 3200);
                }}
              />
              </div>
              ) : null}
              <div
              className="hostly-productos-carta-list-host hostly-productos-carta-list-host--config-table"
              style={{ flexGrow: 1, minHeight: 0, minWidth: 0, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
              >
              {items.length === 0 ? (
              <div className="hostly-productos-carta-empty">
              <p className="hostly-productos-carta-empty__title">{t("carta.emptyTitle")}</p>
              <p className="hostly-productos-carta-empty__body">{t("carta.emptyBody")}</p>
              <button
              type="button"
              disabled={isLegacyReadOnly}
              title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
              onClick={openCreate}
              className="hostly-button-primary hostly-button-compact"
              style={isLegacyReadOnly ? { opacity: 0.48, cursor: "not-allowed" } : undefined}
              >
              {t("carta.emptyCta")}
              </button>
              </div>
              ) : filteredSorted.length === 0 ? (
              <div className="hostly-productos-carta-muted-empty">{t("stock.filterEmpty")}</div>
              ) : displayed.length === 0 ? (
              <div className="hostly-productos-carta-muted-empty">
              {resolverParityFilter !== "all" && !listSearch.trim()
                ? t("productos.resolverParityFilterEmpty")
                : t("carta.searchNoResults")}
              </div>
              ) : (
              <ProductosCartaDataView
              displayed={displayed}
              groupedByCategoria={groupedByCategoria}
              viewMode={viewMode}
              selectedIds={selectedIds}
              selectAllRef={selectAllRef}
              isLegacyReadOnly={isLegacyReadOnly}
              meta={meta}
              centralDocsById={centralDocsById}
              escNavId={escNavId}
              locale={locale as Locale}
              t={t}
              toggleRowSelected={toggleRowSelected}
              toggleSelectAllDisplayed={toggleSelectAllDisplayed}
              openEdit={openEdit}
              toggleActivo={toggleActivo}
              activateProducto={activateProducto}
              goToEscandallo={goToEscandallo}
              deleteProducto={deleteProducto}
              clearSelection={clearSelection}
              onAssignPass={() => setBulkAssignCourseOpen(true)}
              assignPassDisabled={bulkAssignPassDisabled}
              assignPassDisabledTitle={bulkAssignPassDisabledTitle}
              onAssignDestination={() => setBulkAssignDestinationOpen(true)}
              assignDestinationDisabled={bulkAssignDestinationDisabled}
              assignDestinationDisabledTitle={bulkAssignDestinationDisabledTitle}
              onAssignCategory={() => setBulkAssignCategoryOpen(true)}
              assignCategoryDisabled={bulkAssignCategoryDisabled}
              assignCategoryDisabledTitle={bulkAssignCategoryDisabledTitle}
              onAssignFamily={() => setBulkAssignFamilyOpen(true)}
              assignFamilyDisabled={bulkAssignFamilyDisabled}
              assignFamilyDisabledTitle={bulkAssignFamilyDisabledTitle}
              onBulkDelete={() => setBulkDeleteOpen(true)}
              bulkDeleteDisabled={bulkDeleteDisabled}
              bulkDeleteDisabledTitle={bulkDeleteDisabledTitle}
              compactBulkBar
              activeCategoryLabel={activeReorderCategoryLabel}
              operationStations={operationStations}
              productionStations={productionStations}
              cartaCategorias={cartaCategorias}
              cartaFamilias={cartaFamilias}
              inlineEdit={productTableInlineEdit}
              />
              )}
              </div>
              </>
            </ProductosTableChrome>
          </HostlySection>
          {sharedProductModals}
        </ConfigCartaWorkbench>
      </>
    );
  }


  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: productosTableInteractionStyles }} />
      <ModulePageShell
      title={dashboardListIceVisual ? "Productos" : t("productos.title")}
      subtitle={dashboardListIceVisual ? "Gestiona el catálogo maestro del restaurante." : t("productos.subtitle")}
      maxWidth={PRODUCTOS_SHELL_MAX_WIDTH}
      compactLayout
      operationalFocus
      denseWorkbench
      lockViewport
      lockViewportFillParent={lockViewportFillParent}
      shellSurface={iceVisual ? "configLight" : "default"}
      denseInventoryHeader={emb}
      headerBelow={
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: configCartaProductosChrome ? 4 : 8,
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
          }}
        >
          <nav
            aria-label={t("productos.subtitle")}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: configCartaProductosChrome ? 3 : 6,
              minWidth: 0,
              flex: "1 1 200px",
            }}
          >
            <Link
              href={emb ? "/dashboard/configuracion/carta/categorias" : "/dashboard/carta/categorias"}
              style={{
                border: iceVisual ? "1px solid var(--hostly-line)" : "1px solid rgba(148, 163, 184, 0.14)",
                background: iceVisual ? "rgba(255,255,255,0.92)" : "rgba(15, 23, 42, 0.28)",
                color: iceVisual ? "#475569" : "#94a3b8",
                padding: configCartaProductosChrome ? "3px 8px" : "5px 10px",
                borderRadius: configCartaProductosChrome ? 6 : 8,
                fontWeight: 600,
                fontSize: configCartaProductosChrome ? 9 : 11,
                lineHeight: configCartaProductosChrome ? 1.08 : 1.2,
                minHeight: configCartaProductosChrome ? 26 : 30,
                whiteSpace: "nowrap",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                letterSpacing: "-0.01em",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              {t("cartaCategories.manageLink")}
            </Link>
            <button
              type="button"
              onClick={() =>
                router.push(emb ? "/dashboard/configuracion/carta/modificadores" : "/dashboard/carta/modificadores")
              }
              style={{
                border: iceVisual ? "1px solid var(--hostly-line)" : "1px solid rgba(148, 163, 184, 0.14)",
                background: iceVisual ? "rgba(255,255,255,0.92)" : "rgba(15, 23, 42, 0.28)",
                color: iceVisual ? "#475569" : "#94a3b8",
                padding: configCartaProductosChrome ? "3px 8px" : "5px 10px",
                borderRadius: configCartaProductosChrome ? 6 : 8,
                fontWeight: 600,
                cursor: "pointer",
                fontSize: configCartaProductosChrome ? 9 : 11,
                lineHeight: configCartaProductosChrome ? 1.08 : 1.2,
                minHeight: configCartaProductosChrome ? 26 : 30,
                whiteSpace: "nowrap",
                letterSpacing: "-0.01em",
                maxWidth: "100%",
                boxSizing: "border-box",
              }}
            >
              {t("carta.ctaModifiers")}
            </button>
          </nav>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: configCartaProductosChrome ? 5 : 8,
              minWidth: 0,
              marginLeft: "auto",
            }}
          >
            <ProductCatalogImageBulkPanel />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(emb ? "/dashboard/configuracion/carta/importacion" : "/dashboard/carta/importar");
              }}
              style={
                configCartaProductosChrome
                  ? {
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "transparent",
                      color: "var(--hostly-ink-muted)",
                      padding: "3px 8px",
                      borderRadius: 6,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: 9,
                      lineHeight: 1.1,
                      minHeight: 26,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                    }
                  : {
                      border: iceVisual ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid rgba(251, 191, 36, 0.22)",
                      background: iceVisual ? "rgba(255, 251, 235, 0.95)" : "rgba(120, 53, 15, 0.12)",
                      color: iceVisual ? "#92400e" : "#fcd34d",
                      padding: "5px 11px",
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontSize: 11,
                      lineHeight: 1.2,
                      minHeight: 30,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                    }
              }
            >
              {t("carta.ctaImportMenu")}
            </button>
            <button
              type="button"
              disabled={isLegacyReadOnly}
              title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
              onClick={openCreate}
              style={
                configCartaProductosChrome
                  ? {
                      border: "1px solid rgba(34, 197, 94, 0.5)",
                      background: "rgba(220, 252, 231, 0.98)",
                      color: "#15803d",
                      padding: "5px 12px",
                      borderRadius: 8,
                      fontWeight: 760,
                      cursor: isLegacyReadOnly ? "not-allowed" : "pointer",
                      fontSize: 11,
                      lineHeight: 1.15,
                      minHeight: 28,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.02em",
                      boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)",
                      opacity: isLegacyReadOnly ? 0.48 : 1,
                    }
                  : {
                      border: iceVisual ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(34, 197, 94, 0.42)",
                      background: iceVisual ? "rgba(220, 252, 231, 0.9)" : "rgba(6, 78, 59, 0.22)",
                      color: iceVisual ? "#166534" : "#bbf7d0",
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: isLegacyReadOnly ? "not-allowed" : "pointer",
                      fontSize: 12,
                      lineHeight: 1.2,
                      minHeight: 30,
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                      opacity: isLegacyReadOnly ? 0.48 : 1,
                    }
              }
            >
              {dashboardListIceVisual ? "Nuevo producto" : t("carta.ctaNew")}
            </button>
          </div>
        </div>
      }
    >
      <HostlySection
        stack="sm"
        className={
          dashboardListIceVisual
            ? "hostly-productos-config-skin hostly-productos-catalog-workspace min-h-0 min-w-0 flex-1 overflow-hidden"
            : iceVisual
              ? "hostly-productos-config-skin min-h-0 min-w-0 flex-1 overflow-hidden"
            : "min-h-0 min-w-0 flex-1 overflow-hidden"
        }
        style={{
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minHeight: 0,
        }}
      >
        {notice ? (
          <div
            style={{
              flexShrink: 0,
              padding: configCartaProductosChrome ? "5px 8px" : "8px 11px",
              borderRadius: 8,
              background: iceVisual ? "rgba(220, 252, 231, 0.85)" : "rgba(34, 197, 94, 0.12)",
              border: iceVisual ? "1px solid rgba(34, 197, 94, 0.35)" : "1px solid rgba(34, 197, 94, 0.3)",
              color: iceVisual ? "#166534" : "#bbf7d0",
              fontSize: configCartaProductosChrome ? 11 : 13,
              lineHeight: 1.32,
            }}
          >
            {notice}
          </div>
        ) : null}

        <>
        <CatalogMigrationPreviewPanel
          restaurantId={operationalRestaurantId}
          catalogSource={operationalCatalog.source}
          iceVisual={iceVisual}
        />

        <LegacyPlatosArchivePanel
          restaurantId={operationalRestaurantId}
          catalogSource={operationalCatalog.source}
          iceVisual={iceVisual}
          onArchived={() => {
            setNotice("Copia local archivada");
            window.setTimeout(() => setNotice(null), 3200);
          }}
        />
        </>

        {formError && !formOpen ? (
          <div
            style={{
              flexShrink: 0,
              padding: configCartaProductosChrome ? "5px 8px" : "8px 11px",
              borderRadius: 8,
              background: iceVisual ? "rgba(254, 242, 242, 0.95)" : "rgba(248, 113, 113, 0.12)",
              border: iceVisual ? "1px solid rgba(248, 113, 113, 0.4)" : "1px solid rgba(248, 113, 113, 0.35)",
              color: iceVisual ? "#b91c1c" : "#fecaca",
              fontSize: configCartaProductosChrome ? 11 : 13,
            }}
          >
            {formError}
          </div>
        ) : null}

        {iceVisual && !dashboardListIceVisual ? (
            <div
              className="grid shrink-0 gap-1.5"
              style={{ gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}
            >
              {kpiPills.map((m) => (
                <HostlyKpiCard key={m.key} title={m.label} value={m.value} className="px-3 py-2" />
              ))}
            </div>
        ) : (
          <div style={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 2 }}>
            {kpiPills.map((m) => (
              <span
                key={m.key}
                style={{
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "baseline",
                  padding: "4px 9px",
                  borderRadius: 999,
                  border: "1px solid rgba(51, 65, 85, 0.65)",
                  background: "rgba(15, 23, 42, 0.28)",
                  minHeight: 26,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#64748b",
                  }}
                >
                  {m.label}
                </span>
                <span style={{ ...metricNum, fontSize: 14, lineHeight: 1, color: "#e2e8f0" }}>{m.value}</span>
              </span>
            ))}
          </div>
        )}

        <ProductosTableChrome iceVisual={iceVisual}>
          <>
          {iceVisual ? (
            <HostlySectionHeader
              title={dashboardListIceVisual ? "Centro de catálogo" : t("carta.listTitle")}
              description={t("carta.listCount", { shown: displayed.length, total: items.length })}
              descriptionClassName="!text-[10px] !font-semibold !leading-snug !m-0"
              className={dashboardListIceVisual
                ? "hostly-productos-catalog-toolbar shrink-0 border-b border-[var(--hostly-line)]"
                : "shrink-0 border-b border-[var(--hostly-line)] px-1.5 py-0.5"}
            >
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={dashboardListIceVisual ? "Buscar producto, categoría, familia, alérgeno..." : t("carta.searchPlaceholder")}
                aria-label={dashboardListIceVisual ? "Buscar producto, categoría, familia, alérgeno..." : t("carta.searchPlaceholder")}
                className="hostly-config-canonical-search"
                style={{
                  minWidth: 160,
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: dashboardListIceVisual ? "min(100%, 520px)" : "220px",
                  maxWidth: dashboardListIceVisual ? 720 : 360,
                  padding: dashboardListIceVisual ? "11px 16px" : "5px 10px",
                  borderRadius: dashboardListIceVisual ? 18 : 999,
                  border: "1px solid var(--hostly-line)",
                  background: dashboardListIceVisual ? "rgba(255, 255, 255, 0.94)" : "var(--hostly-surface-page-soft)",
                  color: "var(--hostly-ink-strong)",
                  fontSize: dashboardListIceVisual ? 15 : 12,
                  outline: "none",
                  boxSizing: "border-box",
                  minHeight: dashboardListIceVisual ? 50 : 32,
                  boxShadow: dashboardListIceVisual ? "0 16px 36px rgba(15, 23, 42, 0.06)" : undefined,
                }}
              />
            </HostlySectionHeader>
          ) : (
          <div
            style={{
              flexShrink: 0,
              padding: "3px 6px",
              borderBottom: "1px solid #334155",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 200px" }}>
              <h2 style={{ ...OPER_PRIMARY_SECTION_TITLE, fontSize: "clamp(13px, 1.35vw, 16px)", lineHeight: 1.06 }}>{t("carta.listTitle")}</h2>
              <p style={{ ...OPER_PRIMARY_COUNT_META, margin: "1px 0 0", fontSize: 10 }}>{t("carta.listCount", { shown: displayed.length, total: items.length })}</p>
            </div>
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder={t("carta.searchPlaceholder")}
              aria-label={t("carta.searchPlaceholder")}
              className="hostly-config-canonical-search"
              style={{
                minWidth: 160,
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: "220px",
                maxWidth: 360,
                padding: "6px 11px",
                borderRadius: 999,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "#f8fafc",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                minHeight: 34,
              }}
            />
          </div>
          )}

          {renderCatalogFoodDrinkSegment()}

          <div
            className={dashboardListIceVisual ? "hostly-productos-catalog-filterbar" : undefined}
            style={{
              flexShrink: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: 5,
              padding: "2px 5px",
              alignItems: "center",
              borderBottom: iceVisual ? "1px solid var(--hostly-line)" : "1px solid #334155",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
                marginRight: 2,
              }}
            >
              {t("stock.filterHint")}
            </span>
            {iceToolbarFilterButtons(false)}
            {iceToolbarViewControls(false)}
          </div>

          <div
            className={dashboardListIceVisual ? "hostly-productos-catalog-categorybar" : undefined}
            style={{
              flexShrink: 0,
              padding: "1px 5px 2px",
              borderBottom: iceVisual ? "1px solid var(--hostly-line)" : "1px solid rgba(51, 65, 85, 0.75)",
              display: "flex",
              gap: 6,
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
            aria-label="Pestañas de categoría"
          >
            {tabOptions
              .filter((tab) => tab.id !== "__all__")
              .map((tab) => {
              const active = categoryTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryTab(tab.id)}
                  style={{
                    flexShrink: 0,
                    border: active
                      ? "1px solid rgba(56, 189, 248, 0.55)"
                      : configCartaProductosChrome
                        ? "1px solid rgba(148, 163, 184, 0.18)"
                        : iceVisual
                          ? "1px solid var(--hostly-line)"
                          : "1px solid rgba(51, 65, 85, 0.8)",
                    background: active
                      ? iceVisual
                        ? "rgba(224, 242, 254, 0.95)"
                        : "rgba(8,47,73,0.35)"
                      : configCartaProductosChrome && iceVisual
                        ? "rgba(255, 255, 255, 0.5)"
                        : iceVisual
                          ? "rgba(248,250,252,0.9)"
                          : "rgba(2,6,23,0.12)",
                    color: active
                      ? iceVisual
                        ? "#0369a1"
                        : "#bae6fd"
                      : configCartaProductosChrome
                        ? "var(--hostly-ink-muted)"
                        : "#94a3b8",
                    padding: configCartaProductosChrome ? "3px 7px" : "4px 9px",
                    borderRadius: 999,
                    fontWeight: 820,
                    cursor: "pointer",
                    fontSize: configCartaProductosChrome ? 9 : 11,
                    lineHeight: configCartaProductosChrome ? 1.06 : 1.15,
                    minHeight: configCartaProductosChrome ? 22 : 26,
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div
            className={dashboardListIceVisual ? "hostly-productos-catalog-list" : undefined}
            style={{ flexGrow: 1, minHeight: 0, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}
          >
            {items.length === 0 ? (
              iceVisual ? (
                <div className="hostly-productos-carta-empty">
                  <p className="hostly-productos-carta-empty__title">{t("carta.emptyTitle")}</p>
                  <p className="hostly-productos-carta-empty__body">{t("carta.emptyBody")}</p>
                  <button
                    type="button"
                    disabled={isLegacyReadOnly}
                    title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
                    onClick={openCreate}
                    className="hostly-button-primary hostly-button-compact"
                    style={isLegacyReadOnly ? { opacity: 0.48, cursor: "not-allowed" } : undefined}
                  >
                    {t("carta.emptyCta")}
                  </button>
                </div>
              ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "28px 16px",
                  textAlign: "center",
                  color: "#94a3b8",
                }}
              >
                <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>{t("carta.emptyTitle")}</p>
                <p style={{ margin: "12px 0 0", maxWidth: 400, fontSize: 14, lineHeight: 1.5 }}>{t("carta.emptyBody")}</p>
                <button
                  type="button"
                  disabled={isLegacyReadOnly}
                  title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
                  onClick={openCreate}
                  style={{
                    marginTop: 20,
                    border: "none",
                    background: "#16a34a",
                    color: "#fff",
                    padding: "12px 22px",
                    borderRadius: 10,
                    fontWeight: 700,
                    cursor: isLegacyReadOnly ? "not-allowed" : "pointer",
                    fontSize: 15,
                    minHeight: 48,
                    opacity: isLegacyReadOnly ? 0.48 : 1,
                  }}
                >
                  {t("carta.emptyCta")}
                </button>
              </div>
              )
            ) : filteredSorted.length === 0 ? (
              <div className={iceVisual ? "hostly-productos-carta-muted-empty" : undefined} style={iceVisual ? undefined : { padding: "24px 8px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>{t("stock.filterEmpty")}</div>
            ) : displayed.length === 0 ? (
              <div className={iceVisual ? "hostly-productos-carta-muted-empty" : undefined} style={iceVisual ? undefined : { padding: "24px 8px", textAlign: "center", color: iceVisual ? "#64748b" : "#94a3b8", fontSize: 14 }}>{t("carta.searchNoResults")}</div>
            ) : (
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  background: iceVisual ? "var(--hostly-surface-operational)" : "rgba(2, 6, 23, 0.18)",
                  border: "none",
                  borderRadius: 0,
                  boxShadow: "none",
                }}
              >
                <ProductosSelectionBar
                  count={selectedIds.size}
                  onClear={clearSelection}
                  onAssignPass={() => setBulkAssignCourseOpen(true)}
                  assignPassDisabled={bulkAssignPassDisabled}
                  assignPassDisabledTitle={bulkAssignPassDisabledTitle}
                  onAssignDestination={() => setBulkAssignDestinationOpen(true)}
                  assignDestinationDisabled={bulkAssignDestinationDisabled}
                  assignDestinationDisabledTitle={bulkAssignDestinationDisabledTitle}
                  onAssignCategory={() => setBulkAssignCategoryOpen(true)}
                  assignCategoryDisabled={bulkAssignCategoryDisabled}
                  assignCategoryDisabledTitle={bulkAssignCategoryDisabledTitle}
                  onAssignFamily={() => setBulkAssignFamilyOpen(true)}
                  assignFamilyDisabled={bulkAssignFamilyDisabled}
                  assignFamilyDisabledTitle={bulkAssignFamilyDisabledTitle}
                  onBulkDelete={() => setBulkDeleteOpen(true)}
                  bulkDeleteDisabled={bulkDeleteDisabled}
                  bulkDeleteDisabledTitle={bulkDeleteDisabledTitle}
                  t={t}
                />
                <div style={{ overflowX: "auto", flex: 1, minHeight: 0, width: "100%", WebkitOverflowScrolling: "touch" }}>
                  <div style={{ width: "100%", minWidth: productosTableMinInnerWidthPx, minHeight: 0, boxSizing: "border-box" }}>
                    <div
                      className={iceVisual ? "hostly-config-table-head sticky top-0 z-[2]" : undefined}
                      style={{
                        ...(iceProductosDataGridStyle),
                        padding: iceVisual ? productTableRowPaddingIce : productTableRowPadding,
                        ...(iceVisual
                          ? {
                              background: "var(--hostly-table-head-surface)",
                              borderBottom: "1px solid var(--hostly-table-divider-soft)",
                              boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.52)",
                            }
                          : {
                              background: "rgba(2, 6, 23, 0.35)",
                              borderBottom: "1px solid var(--hostly-table-divider-faint)",
                            }),
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          margin: 0,
                          cursor:
                            displayed.length === 0 || isLegacyReadOnly ? "default" : "pointer",
                          minWidth: 0,
                        }}
                        title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
                      >
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          disabled={displayed.length === 0 || isLegacyReadOnly}
                          checked={displayed.length > 0 && displayed.every((p) => selectedIds.has(p.id))}
                          onChange={toggleSelectAllDisplayed}
                          aria-label={t("productos.selectAllVisible")}
                          style={{
                            width: iceVisual ? 14 : 16,
                            height: iceVisual ? 14 : 16,
                            cursor:
                              displayed.length === 0 || isLegacyReadOnly ? "not-allowed" : "pointer",
                            accentColor: "#38bdf8",
                          }}
                        />
                      </label>
                      <span style={{ ...colHeadStyleResolved, textAlign: "left" }}>{t("carta.colNombre")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "left" }}>{t("carta.colTipo")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "left" }}>{t("carta.colCategoria")}</span>
                      <div style={productGridPriceCell}>
                        <span style={{ ...colHeadStyleResolved, textAlign: "right", width: "100%" }}>{t("carta.colPrecio")}</span>
                      </div>
                      <span style={{ ...colHeadStyleResolved, textAlign: "center" }}>{t("productos.colCarta")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "center" }}>{t("productos.colEscandallo")}</span>
                      <span style={{ ...colHeadStyleResolved, textAlign: "right" }}>{t("carta.colActions")}</span>
                    </div>
                    <div>
                      {viewMode === "grouped"
                        ? groupedByCategoria.map((g, gi) => (
                            <div key={`cat-${g.sectionKey}-${gi}`}>
                              <div
                                role="presentation"
                                style={{
                                  ...(iceProductosGroupBarGridStyle),
                                  marginTop: gi === 0 ? 0 : 6,
                                  paddingTop: gi === 0 ? 4 : 8,
                                  paddingBottom: 2,
                                  paddingLeft: 8,
                                  paddingRight: 8,
                                  borderTop: gi === 0 ? "none" : iceVisual ? PRODUCTOS_ROW_DIVIDER_ICE : "1px solid var(--hostly-table-divider-faint)",
                                  background: "transparent",
                                }}
                              >
                                <div
                                  style={{
                                    gridColumn: "1 / -1",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    minWidth: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: iceVisual ? 9 : 10,
                                      fontWeight: 600,
                                      letterSpacing: iceVisual ? "0.1em" : "0.12em",
                                      textTransform: "uppercase",
                                      color: iceVisual ? "rgba(71, 85, 105, 0.72)" : "#94a3b8",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      minWidth: 0,
                                    }}
                                  >
                                    {g.categoria}
                                  </div>
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      fontSize: 9,
                                      fontWeight: 600,
                                      letterSpacing: "0.06em",
                                      color: "#64748b",
                                      fontVariantNumeric: "tabular-nums",
                                      padding: "2px 7px",
                                      borderRadius: 999,
                                      border: iceVisual ? "1px solid var(--hostly-table-divider-soft)" : "1px solid var(--hostly-table-divider-faint)",
                                      background: iceVisual ? "rgba(255, 255, 255, 0.4)" : "rgba(248, 250, 252, 0.03)",
                                    }}
                                  >
                                    {g.items.length}
                                  </span>
                                </div>
                              </div>
                              {g.items.map((p, idx) => {
                                const tiene = tieneEscandalloForPlato(p, meta);
                                const busyEsc = escNavId === p.id;
                                const isLastInCat = idx === g.items.length - 1;
                                return (
                                  <div
                                    key={p.id}
                                    className={PRODUCTOS_ROW_HOVER_CLASS}
                                    style={{
                                      ...(iceProductosDataGridStyle),
                                      padding: iceVisual ? productTableRowPaddingIce : productTableRowPadding,
                                      borderBottom:
                                        isLastInCat && gi === groupedByCategoria.length - 1
                                          ? "none"
                                          : iceVisual
                                            ? PRODUCTOS_ROW_DIVIDER_ICE
                                            : "1px solid rgba(148, 163, 184, 0.06)",
                                      background: "transparent",
                                      minHeight: iceVisual ? productRowMinHeightIce : productRowMinHeight,
                                    }}
                                  >
                                    <label
                                      style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        alignItems: "center",
                                        margin: 0,
                                        cursor: isLegacyReadOnly ? "default" : "pointer",
                                        justifySelf: "center",
                                      }}
                                      title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
                                    >
                                      <input
                                        type="checkbox"
                                        disabled={isLegacyReadOnly}
                                        checked={selectedIds.has(p.id)}
                                        onChange={() => toggleRowSelected(p.id)}
                                        aria-label={t("productos.selectRowAria", { name: p.nombre })}
                                        style={{
                                          width: iceVisual ? 14 : 16,
                                          height: iceVisual ? 14 : 16,
                                          accentColor: "#38bdf8",
                                          cursor: isLegacyReadOnly ? "not-allowed" : "pointer",
                                        }}
                                      />
                                    </label>
                                    <div style={{ minWidth: 0, overflow: "hidden", width: "100%" }}>
                                      <div
                                        className="hostly-productos-row-name-cell"
                                        style={{
                                          paddingTop: iceVisual ? 1 : 0,
                                        }}
                                        title={p.nombre}
                                      >
                                        <ProductosCartaNameThumb p={p} />
                                        <div className="hostly-productos-row-name-cell__stack">
                                          <span style={rowNombreStyleResolved}>{p.nombre}</span>
                                          {p.origenAlta === "importacion_ia" ? (
                                            <span
                                              style={{
                                                flexShrink: 0,
                                                alignSelf: "flex-start",
                                                fontSize: iceVisual ? 7 : 9,
                                                fontWeight: iceVisual ? 600 : 900,
                                                letterSpacing: "0.08em",
                                                textTransform: "uppercase",
                                                padding: iceVisual ? "0px 4px" : "2px 6px",
                                                borderRadius: iceVisual ? 4 : 999,
                                                border: iceVisual
                                                  ? "1px solid rgba(148, 163, 184, 0.2)"
                                                  : "1px solid rgba(56,189,248,0.28)",
                                                background: iceVisual ? "transparent" : "rgba(8,47,73,0.18)",
                                                color: iceVisual ? "#94a3b8" : "#7dd3fc",
                                              }}
                                            >
                                              IA
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                    <span style={rowTipoStyleResolved} title={labelTipoVenta(t, p.tipoVenta)}>
                                      {labelTipoVenta(t, p.tipoVenta)}
                                    </span>
                                    <span style={rowCategoriaStyleResolved} title={p.categoria}>
                                      {p.categoria}
                                    </span>
                                    <div style={productGridPriceCell}>
                                      <span style={rowPrecioStyleResolved}>{formatEuro(p.precioVenta, locale as Locale)}</span>
                                    </div>
                                    <ProductRowPublicationCell p={p} t={t} embedLight={iceVisual} />
                                    <ProductRowEscandalloCell tiene={tiene} t={t} embedLight={iceVisual} />
                                    <ProductRowActions
                                      p={p}
                                      busyEsc={busyEsc}
                                      t={t}
                                      embedLight={iceVisual}
                                      inventoryIconToolbar={configCartaProductosChrome}
                                      legacyReadOnly={isLegacyReadOnly}
                                      onEdit={() => openEdit(p)}
                                      onToggleCarta={() => toggleActivo(p)}
                                      onActivateProduct={() => activateProducto(p)}
                                      onEsc={() => void goToEscandallo(p)}
                                      onDelete={() => deleteProducto(p)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ))
                        : displayed.map((p, idx) => {
                            const tiene = tieneEscandalloForPlato(p, meta);
                            const busyEsc = escNavId === p.id;
                            const isLast = idx === displayed.length - 1;
                            return (
                              <div
                                key={p.id}
                                className={PRODUCTOS_ROW_HOVER_CLASS}
                                style={{
                                  ...(iceProductosDataGridStyle),
                                  padding: iceVisual ? productTableRowPaddingIce : productTableRowPadding,
                                  borderBottom: isLast ? "none" : iceVisual ? PRODUCTOS_ROW_DIVIDER_ICE : "1px solid var(--hostly-table-divider-faint)",
                                  background: "transparent",
                                  minHeight: iceVisual ? productRowMinHeightIce : productRowMinHeight,
                                }}
                              >
                                <label
                                  style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    margin: 0,
                                    cursor: isLegacyReadOnly ? "default" : "pointer",
                                    justifySelf: "center",
                                  }}
                                  title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={isLegacyReadOnly}
                                    checked={selectedIds.has(p.id)}
                                    onChange={() => toggleRowSelected(p.id)}
                                    aria-label={t("productos.selectRowAria", { name: p.nombre })}
                                    style={{
                                      width: iceVisual ? 14 : 16,
                                      height: iceVisual ? 14 : 16,
                                      accentColor: "#38bdf8",
                                      cursor: isLegacyReadOnly ? "not-allowed" : "pointer",
                                    }}
                                  />
                                </label>
                                <div style={{ minWidth: 0, overflow: "hidden", width: "100%" }}>
                                  <div
                                    className="hostly-productos-row-name-cell"
                                    style={{
                                      paddingTop: iceVisual ? 1 : 0,
                                    }}
                                    title={p.nombre}
                                  >
                                    <ProductosCartaNameThumb p={p} />
                                    <div className="hostly-productos-row-name-cell__stack">
                                      <span style={rowNombreStyleResolved}>{p.nombre}</span>
                                      {p.origenAlta === "importacion_ia" ? (
                                        <span
                                          style={{
                                            flexShrink: 0,
                                            alignSelf: "flex-start",
                                            fontSize: iceVisual ? 7 : 9,
                                            fontWeight: iceVisual ? 600 : 900,
                                            letterSpacing: "0.08em",
                                            textTransform: "uppercase",
                                            padding: iceVisual ? "0px 4px" : "2px 6px",
                                            borderRadius: iceVisual ? 4 : 999,
                                            border: iceVisual
                                              ? "1px solid rgba(148, 163, 184, 0.2)"
                                              : "1px solid rgba(56,189,248,0.28)",
                                            background: iceVisual ? "transparent" : "rgba(8,47,73,0.18)",
                                            color: iceVisual ? "#94a3b8" : "#7dd3fc",
                                          }}
                                        >
                                          IA
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                                <span style={rowTipoStyleResolved} title={labelTipoVenta(t, p.tipoVenta)}>
                                  {labelTipoVenta(t, p.tipoVenta)}
                                </span>
                                <span style={rowCategoriaStyleResolved} title={p.categoria}>
                                  {p.categoria}
                                </span>
                                <div style={productGridPriceCell}>
                                  <span style={rowPrecioStyleResolved}>{formatEuro(p.precioVenta, locale as Locale)}</span>
                                </div>
                                <ProductRowPublicationCell p={p} t={t} embedLight={iceVisual} />
                                <ProductRowEscandalloCell tiene={tiene} t={t} embedLight={iceVisual} />
                                <ProductRowActions
                                  p={p}
                                  busyEsc={busyEsc}
                                  t={t}
                                  embedLight={iceVisual}
                                  inventoryIconToolbar={configCartaProductosChrome}
                                  legacyReadOnly={isLegacyReadOnly}
                                  onEdit={() => openEdit(p)}
                                  onToggleCarta={() => toggleActivo(p)}
                                  onActivateProduct={() => activateProducto(p)}
                                  onEsc={() => void goToEscandallo(p)}
                                  onDelete={() => deleteProducto(p)}
                                />
                              </div>
                            );
                          })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          </>
        </ProductosTableChrome>
      </HostlySection>
      {sharedProductModals}
    </ModulePageShell>
    </>
  );
}
