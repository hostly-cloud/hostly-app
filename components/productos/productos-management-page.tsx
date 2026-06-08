"use client";

import type { CSSProperties, ReactNode, SVGProps } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { CategoriaCartaFormField } from "@/components/carta/categoria-carta-form-field";
import { ConfigCartaWorkbench, ConfigBtnPrimary, ConfigBtnSecondary, ConfigCard } from "@/app/dashboard/configuracion/_components/config-carta-workbench";
import ModulePageShell from "@/components/module-page-shell";
import { ProductosCartaDataView } from "@/components/productos/productos-carta-data-view";
import {
  ConfigCartaCompactFilterRow,
  ConfigCartaStatusFilterSelect,
  type ConfigCartaListFilterId,
} from "@/components/productos/productos-config-carta-compact-controls";
import { ProductosBulkAssignCourseModal } from "@/components/productos/productos-bulk-assign-course-modal";
import { ProductosBulkAssignDestinationModal } from "@/components/productos/productos-bulk-assign-destination-modal";
import { ProductosBulkAssignCategoryModal } from "@/components/productos/productos-bulk-assign-category-modal";
import { ProductosBulkAssignFamilyModal } from "@/components/productos/productos-bulk-assign-family-modal";
import { ProductosBulkDeleteModal } from "@/components/productos/productos-bulk-delete-modal";
import {
  computeBulkCategoryInitialSelectValue,
  computeBulkCourseInitialSelectValue,
  computeBulkDestinationInitialSelectValue,
  computeBulkFamilyInitialSelectValue,
} from "@/components/productos/productos-bulk-initial-values";
import { ProductosSelectionBar } from "@/components/productos/productos-selection-bar";
import { useProductosSelection } from "@/components/productos/use-productos-selection";
import { HostlyKpiCard, HostlySection, HostlySectionHeader, HostlySurface, hostlySegmentTabClassName, HostlySegmentedControl } from "@/components/ui/hostly";
import { fetchCartaCategorias, fetchCartaFamilias, createCartaCategoriaApi } from "@/lib/carta-categorias/api-client";
import { buildCartaGroupedSections } from "@/lib/carta-categorias/grouping";
import { comparePlatoCarta } from "@/lib/carta/product-sort-order";
import { CARTA_CATEGORIAS_CHANGED_EVENT } from "@/lib/carta-categorias/local-store";
import {
  cartaCategoriasForMenuFamiliaFiltro,
  categoryRequiresManualTipoVenta,
  defaultCartaCategoriaTipoForTipoProducto,
  inferTipoVentaFromCategory,
  isCartaCategoriaCompatibleWithTipoProducto,
} from "@/lib/carta-categorias/filter-for-tipo-producto";
import {
  buildProductFamilyPatchFromCategoryId,
  getProductFamilyLabel,
} from "@/lib/carta/product-category-family-resolver";
import {
  matchesCatalogFoodDrinkSegment,
  productFamilyDenormFromPlato,
  readProductFamilyTypeForFilter,
  type CatalogFoodDrinkSegment,
} from "@/lib/carta/product-family-list-filter";
import type { CartaCategoria, CartaCategoriaTipo, CartaFamilia } from "@/lib/carta-categorias/types";
import { CARTA_MENU_FAMILIA_FILTER_UNASSIGNED, isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { selectValueToPreparationArea } from "@/lib/carta/operational-station-options";
import {
  productCatalogCourseFromSelectValue,
  productCatalogCourseSelectValue,
  type ProductCatalogCourse,
} from "@/lib/carta/menu-course";
import {
  ProductFormDrawerCollapsibleSection,
} from "@/components/productos/product-form-drawer-section";
import { productFormSkipsMenuCourse } from "@/lib/carta/product-form-menu-course";
import { OperationStationProductSelect } from "@/components/operacion/operation-station-product-select";
import {
  ensureDefaultOperationStations,
  listenOperationStations,
} from "@/lib/firestore/operation-stations";
import {
  ensureDefaultProductFamilies,
  listenProductFamilies,
} from "@/lib/firestore/product-families";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import { listenModifierGroups } from "@/lib/firestore/modifier-groups";
import { resolveEffectiveModifierGroupLabels } from "@/lib/modifiers/effective-product-modifiers";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import {
  buildProductStationPatchFromSelectValue,
  isLegacyOperationStationSelectValue,
  isNoneOperationStationSelectValue,
  operationStationSelectValueFromProduct,
  resolveOperationStationFromSelectValue,
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
  createCentralProduct,
  formatCentralCatalogWriteError,
  listenCentralProducts,
  listenProductsForInventory,
  setCentralProductPublication,
  swapCentralProductSortOrderInCategory,
  updateCentralProduct,
  updateCentralProductRecipe,
  type CentralOperationalProductInput,
} from "@/lib/firestore/products";
import {
  buildInventoryProductLookupMap,
  buildRecipeSourceFromDraftRows,
  isRecipeInventoryUnit,
  normalizeProductRecipe,
  normalizedProductRecipeToWriteInput,
  productDocumentsToInventoryLookup,
} from "@/lib/recipes/product-recipe-helpers";
import type { InventoryProductLookup } from "@/lib/recipes/product-recipe-types";
import {
  ProductRecipeEditorSection,
  type RecipeIngredientDraftRow,
} from "@/components/productos/product-recipe-editor-section";
import { ProductProfitabilityPanel } from "@/components/carta/escandallos/product-profitability-panel";
import { parseNullableNumber } from "@/components/carta/escandallos/escandallo-display-utils";
import type { ProductDocument } from "@/lib/firestore/products";
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
  children,
}: {
  iceVisual: boolean;
  /** Menos “tarjeta sobre tarjeta” en Config → Carta → Productos */
  embedFlatChrome?: boolean;
  children: ReactNode;
}) {
  if (iceVisual) {
    if (embedFlatChrome) {
      return (
        <HostlySurface
          variant="flat"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-0 bg-transparent shadow-none"
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

function normCatKey(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const TIPO_VENTA_I18N: Record<TipoProductoVenta, string> = {
  plato: "carta.tipoPlato",
  bebida: "carta.tipoBebida",
};

function labelTipoVenta(t: (key: string) => string, tipo: TipoProductoVenta): string {
  return t(TIPO_VENTA_I18N[tipo]);
}

function defaultOperationStationSelectForTipoVenta(tipo: TipoProductoVenta): string {
  return tipo === "bebida" ? "default-bar" : "default-kitchen";
}

function operationStationLabelFromSelect(
  selectValue: string,
  stations: readonly OperationStationDocument[],
  tipoFallback: TipoProductoVenta,
): string {
  const resolved = resolveOperationStationFromSelectValue(selectValue, stations);
  if (resolved?.name?.trim()) return resolved.name.trim();
  return tipoFallback === "bebida" ? "Barra" : "Cocina";
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

const rowActionBtn: CSSProperties = {
  padding: "4px 7px",
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 630,
  cursor: "pointer",
  minHeight: 28,
  lineHeight: 1.18,
};

function tieneEscandalloForPlato(p: PlatoCarta, meta: EscandalloMetaMap): boolean {
  if (typeof p.tieneEscandallo === "boolean") return p.tieneEscandallo;
  const sid = p.escandalloSupabaseId;
  if (sid == null) return false;
  return meta.get(sid)?.tieneEscandallo === true;
}

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

function buildCentralInputFromDraft(args: {
  nombre: string;
  operationStationSelect: string;
  operationStations: readonly OperationStationDocument[];
  cartaCategorias: readonly CartaCategoria[];
  draftTipo: TipoProductoVenta;
  categoria: string;
  categoriaCartaIdPatch?: string;
  precioVenta: number;
  draftActivo: boolean;
  draftDesc: string;
  draftCourse: string;
  existingIsActive?: boolean;
}): CentralOperationalProductInput {
  const categoryId = args.categoriaCartaIdPatch ?? null;
  const familyPatch = buildProductFamilyPatchFromCategoryId(
    categoryId,
    args.cartaCategorias,
  );
  const familyFirestore =
    familyPatch.clearProductFamily
      ? {
          productFamilyId: null as string | null,
          productFamilyName: null as string | null,
          productFamilyType: null,
        }
      : familyPatch.productFamilyId
        ? {
            productFamilyId: familyPatch.productFamilyId,
            productFamilyName: familyPatch.productFamilyName ?? null,
            productFamilyType: familyPatch.productFamilyType ?? null,
          }
        : {};

  const base = {
    name: args.nombre,
    categoryName: args.categoria.trim() || "General",
    categoryId,
    price: args.precioVenta,
    tipoVenta: args.draftTipo,
    visibleOnMenu: args.draftActivo,
    active: args.existingIsActive !== false,
    course: productCatalogCourseFromSelectValue(args.draftCourse),
    ...(args.draftDesc.trim() ? { description: args.draftDesc.trim() } : {}),
    ...familyFirestore,
  };

  const resolved = resolveOperationStationFromSelectValue(
    args.operationStationSelect,
    args.operationStations,
  );
  if (resolved) {
    return {
      ...base,
      operationStationId: resolved.id,
      operationStationName: resolved.name,
      operationStationType: resolved.type,
    };
  }
  if (isNoneOperationStationSelectValue(args.operationStationSelect)) {
    return { ...base, operationStationId: null };
  }
  return {
    ...base,
    preparationArea: selectValueToPreparationArea(args.operationStationSelect),
  };
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
  const [categoryTab, setCategoryTab] = useState<string>("__all__");
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderBusyId, setReorderBusyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNombre, setDraftNombre] = useState("");
  const [draftTipo, setDraftTipo] = useState<TipoProductoVenta>("plato");
  const [cartaCategorias, setCartaCategorias] = useState<CartaCategoria[]>([]);
  const [productFamilies, setProductFamilies] = useState<ProductFamilyDocument[]>([]);
  const [cartaFamilias, setCartaFamilias] = useState<CartaFamilia[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupDocument[]>([]);
  const [modifierFamilies, setModifierFamilies] = useState<ModifierFamilyRow[]>([]);
  const [draftCategoriaCartaId, setDraftCategoriaCartaId] = useState<string | null>(null);
  const [draftCartaMenuFamiliaId, setDraftCartaMenuFamiliaId] = useState<string | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [addCatName, setAddCatName] = useState("");
  const [addCatType, setAddCatType] = useState<CartaCategoriaTipo>("general");
  const [addCatCartaFamiliaId, setAddCatCartaFamiliaId] = useState<string | undefined>(undefined);
  const [addCatSaving, setAddCatSaving] = useState(false);
  const [draftPrecio, setDraftPrecio] = useState("");
  const [draftActivo, setDraftActivo] = useState(true);
  const [draftFoto, setDraftFoto] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftOperationStationSelect, setDraftOperationStationSelect] =
    useState("default-kitchen");
  const [draftCourse, setDraftCourse] = useState("");
  const [operationStations, setOperationStations] = useState<
    OperationStationDocument[]
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
  /** Oculta al instante productos borrados hasta que el snapshot central confirme el delete. */
  const pendingRemovedProductIdsRef = useRef<Set<string>>(new Set());
  const configListFilterInitRef = useRef(false);
  const [drawerSyncing, setDrawerSyncing] = useState(false);
  const [draftRecipeEnabled, setDraftRecipeEnabled] = useState(false);
  const [draftRecipeRows, setDraftRecipeRows] = useState<RecipeIngredientDraftRow[]>([]);
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

  const persist = useCallback(
    (_next: PlatoCarta[]) => {
      if (isCentralCatalog) return;
      // Fase 10C: catálogo legacy solo lectura — no escribir localStorage.
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
      return;
    }
    let cancelled = false;
    const rid = tenantRestaurantId;
    void Promise.all([
      fetchCartaCategorias(rid),
      fetchCartaFamilias(rid),
      fetchModifierFamiliesForRestaurante(rid),
    ]).then(([list, fams, mods]) => {
      if (cancelled) return;
      queueMicrotask(() => {
        if (cancelled) return;
        setCartaCategorias(list);
        setCartaFamilias(fams);
        setModifierFamilies(mods);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [profileReady, tenantRestaurantId]);

  useEffect(() => {
    if (!profileReady || !tenantRestaurantId) return;
    let alive = true;
    const onCat = () => {
      const rid = tenantRestaurantId;
      void Promise.all([
        fetchCartaCategorias(rid),
        fetchCartaFamilias(rid),
        fetchModifierFamiliesForRestaurante(rid),
      ]).then(([list, fams, mods]) => {
        if (!alive) return;
        queueMicrotask(() => {
          if (!alive) return;
          setCartaCategorias(list);
          setCartaFamilias(fams);
          setModifierFamilies(mods);
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
  }, [items, meta]);

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
  }, [items, catalogListFilter, configCartaProductosChrome, meta]);

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

  const tabOptions = useMemo(() => {
    const sorted = [...cartaCategorias].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    const out: { id: string; label: string }[] = [{ id: "__all__", label: t("cartaVisual.categoryAll") }];
    for (const c of sorted) {
      out.push({ id: c.id, label: c.name });
    }
    let hasUncategorized = false;
    for (const p of filteredSorted) {
      if (!p.categoriaCartaId && !(p.categoria ?? "").trim()) hasUncategorized = true;
    }
    if (hasUncategorized) out.push({ id: "__uncat__", label: t("cartaCategories.filterUncat") });
    return out;
  }, [cartaCategorias, filteredSorted, t]);

  useEffect(() => {
    let alive = true;
    if (!tabOptions.some((o) => o.id === categoryTab)) {
      queueMicrotask(() => {
        if (!alive) return;
        setCategoryTab("__all__");
      });
    }
    return () => {
      alive = false;
    };
  }, [tabOptions, categoryTab]);

  const tabFilteredSorted = useMemo(() => {
    let rows: PlatoCarta[];
    if (categoryTab === "__all__") {
      rows = filteredSorted;
      return [...rows].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, undefined, { sensitivity: "base" }),
      );
    }
    if (categoryTab === "__uncat__") {
      rows = filteredSorted.filter(
        (p) => !p.categoriaCartaId && !(p.categoria ?? "").trim(),
      );
      return [...rows].sort(comparePlatoCarta);
    }
    const cat = cartaCategorias.find((c) => c.id === categoryTab);
    rows = filteredSorted.filter((p) => {
      if (p.categoriaCartaId === categoryTab) return true;
      if (cat && !p.categoriaCartaId) {
        const a = normCatKey(p.categoria ?? "");
        const b = normCatKey(cat.name);
        return a === b && a !== "";
      }
      return false;
    });
    return [...rows].sort(comparePlatoCarta);
  }, [filteredSorted, categoryTab, cartaCategorias]);

  const canUseProductReorder =
    isCentralCatalog &&
    !isLegacyReadOnly &&
    categoryTab !== "__all__" &&
    categoryTab !== "__uncat__";

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
      clearSelection();
      setViewMode("list");
      return true;
    });
  }, [canUseProductReorder, clearSelection]);

  const moveProductInCategory = useCallback(
    async (productId: string, direction: "up" | "down") => {
      if (!operationalRestaurantId || reorderBusyId || !canUseProductReorder) return;
      const orderedIds = tabFilteredSorted.map((p) => p.id);
      setReorderBusyId(productId);
      try {
        await swapCentralProductSortOrderInCategory(
          operationalRestaurantId,
          productId,
          direction,
          orderedIds,
        );
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

  const handleMoveProductUp = useCallback(
    (productId: string) => {
      void moveProductInCategory(productId, "up");
    },
    [moveProductInCategory],
  );

  const handleMoveProductDown = useCallback(
    (productId: string) => {
      void moveProductInCategory(productId, "down");
    },
    [moveProductInCategory],
  );

  const displayed = useMemo(() => {
    if (reorderMode) return tabFilteredSorted;
    const q = normalizeForSearch(listSearch);
    if (!q) return tabFilteredSorted;
    return tabFilteredSorted.filter(
      (p) =>
        normalizeForSearch(p.nombre).includes(q) ||
        normalizeForSearch(p.categoria).includes(q) ||
        normalizeForSearch(p.tipoVenta).includes(q) ||
        normalizeForSearch(labelTipoVenta(t, p.tipoVenta)).includes(q),
    );
  }, [reorderMode, tabFilteredSorted, listSearch, t]);

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
  }, [items]);

  useLayoutEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    if (displayed.length === 0) {
      el.indeterminate = false;
      return;
    }
    const nSel = displayed.filter((p) => selectedIds.has(p.id)).length;
    el.indeterminate = nSel > 0 && nSel < displayed.length;
  }, [displayed, selectedIds]);

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

  const editingPlato = useMemo(() => (editingId ? (items.find((p) => p.id === editingId) ?? null) : null), [editingId, items]);
  const editingHasEscandallo = useMemo(() => (editingPlato ? tieneEscandalloForPlato(editingPlato, meta) : false), [editingPlato, meta]);

  const draftSkipsMenuCourse = useMemo(
    () =>
      productFormSkipsMenuCourse({
        tipo: draftTipo,
        operationStationSelect: draftOperationStationSelect,
        operationStations,
      }),
    [draftTipo, draftOperationStationSelect, operationStations],
  );

  useEffect(() => {
    if (!formOpen || !draftSkipsMenuCourse) return;
    setDraftCourse("");
  }, [formOpen, draftSkipsMenuCourse]);

  const categoriasForForm = useMemo(
    () => cartaCategoriasForMenuFamiliaFiltro(cartaCategorias, draftCartaMenuFamiliaId),
    [cartaCategorias, draftCartaMenuFamiliaId],
  );

  const draftSelectedCategory = useMemo(
    () =>
      draftCategoriaCartaId
        ? cartaCategorias.find((c) => c.id === draftCategoriaCartaId)
        : undefined,
    [draftCategoriaCartaId, cartaCategorias],
  );

  const draftNeedsManualTipoVenta = useMemo(
    () => categoryRequiresManualTipoVenta(draftSelectedCategory),
    [draftSelectedCategory],
  );

  const draftFormMetaLine = useMemo(() => {
    if (!draftSelectedCategory || draftNeedsManualTipoVenta) return null;
    const stationLabel = operationStationLabelFromSelect(
      draftOperationStationSelect,
      operationStations,
      draftTipo,
    );
    return `${labelTipoVenta(t, draftTipo)} · ${stationLabel}`;
  }, [
    draftSelectedCategory,
    draftNeedsManualTipoVenta,
    draftOperationStationSelect,
    operationStations,
    draftTipo,
    t,
  ]);

  const applyCategorySelection = useCallback(
    (id: string | null) => {
      setDraftCategoriaCartaId(id);
      if (!id) return;
      const c = cartaCategorias.find((x) => x.id === id);
      if (!c) return;
      setDraftCartaMenuFamiliaId(
        c.cartaFamiliaId?.trim() ? c.cartaFamiliaId.trim() : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED,
      );
      const inferred = inferTipoVentaFromCategory(c);
      if (inferred) {
        setDraftTipo(inferred);
        setDraftOperationStationSelect(defaultOperationStationSelectForTipoVenta(inferred));
      }
    },
    [cartaCategorias],
  );

  const draftProductFamilyLabel = useMemo(() => {
    const patch = buildProductFamilyPatchFromCategoryId(
      draftCategoriaCartaId,
      cartaCategorias,
    );
    if (patch.clearProductFamily || !patch.productFamilyId) return "Sin familia";
    return getProductFamilyLabel({
      productFamilyId: patch.productFamilyId,
      productFamilyName: patch.productFamilyName,
      productFamilyType: patch.productFamilyType,
    });
  }, [draftCategoriaCartaId, cartaCategorias]);

  const draftEffectiveModifierLabel = useMemo(() => {
    const cat = draftCategoriaCartaId
      ? cartaCategorias.find((c) => c.id === draftCategoriaCartaId)
      : undefined;
    const labels = resolveEffectiveModifierGroupLabels(
      editingPlato,
      cat,
      modifierGroups,
    );
    return labels.length > 0 ? labels.join(", ") : "Ninguno";
  }, [draftCategoriaCartaId, cartaCategorias, editingPlato, modifierGroups]);

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

  const closeForm = useCallback(() => {
    setFormOpen(false);
    setEditingId(null);
    setFormError(null);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeForm();
      }
    };
    window.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => nombreInputRef.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [formOpen, closeForm]);

  const metricNum: CSSProperties = {
    ...tabularFigures,
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: iceVisual ? "#0f172a" : "#f8fafc",
    lineHeight: 1.1,
  };

  function openCreate() {
    if (isLegacyReadOnly) return;
    setEditingId(null);
    setDraftNombre("");
    setDraftTipo("plato");
    setDraftCategoriaCartaId(null);
    setDraftCartaMenuFamiliaId(null);
    setDraftPrecio("");
    setDraftActivo(true);
    setDraftFoto("");
    setDraftDesc("");
    setDraftOperationStationSelect("default-kitchen");
    setDraftCourse("");
    setDraftRecipeEnabled(false);
    setDraftRecipeRows([]);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(p: PlatoCarta) {
    if (isLegacyReadOnly) return;
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
    setDraftDesc(p.descripcion ?? "");
    setDraftOperationStationSelect(
      operationStationSelectValueFromProduct({
        operationStationId: p.operationStationId,
        operationStationName: p.operationStationName,
        preparationArea: p.preparationArea,
        station: p.preparationArea ?? null,
      }),
    );
    if (isCentralCatalog) {
      const centralDoc = centralDocsById.get(p.id);
      setDraftCourse(
        productCatalogCourseSelectValue(
          centralDoc?.course !== undefined ? centralDoc.course : undefined,
        ),
      );
      applyRecipeDraftFromDocument(centralDoc?.recipe);
    } else {
      setDraftCourse("");
      setDraftRecipeEnabled(false);
      setDraftRecipeRows([]);
    }
    setFormError(null);
    setFormOpen(true);
  }

  function parsePrecio(s: string): number | null {
    const x = s.trim().replace(",", ".");
    if (x === "") return null;
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function submitForm() {
    setFormError(null);
    const nombre = draftNombre.trim();
    if (!nombre) {
      setFormError(t("carta.errorNombre"));
      return;
    }
    const stationPatch = buildProductStationPatchFromSelectValue(
      draftOperationStationSelect,
      operationStations,
    );
    const preparationArea = stationPatch.preparationArea;
    const precioVenta = parsePrecio(draftPrecio);
    if (precioVenta == null) {
      setFormError(t("carta.errorPrecio"));
      return;
    }

    const restauranteId = operationalRestaurantId;
    const now = new Date().toISOString();
    const selectedCat = draftCategoriaCartaId ? cartaCategorias.find((c) => c.id === draftCategoriaCartaId) : undefined;
    if (selectedCat && !isCartaCategoriaCompatibleWithTipoProducto(selectedCat, draftTipo)) {
      setFormError(t("carta.errorCategoriaTipo"));
      return;
    }
    const categoria = selectedCat ? selectedCat.name : "";
    const categoriaCartaIdPatch = selectedCat ? selectedCat.id : undefined;
    const cartaFamiliaIdPatch = selectedCat?.cartaFamiliaId?.trim() || undefined;
    const selMenuFamId = selectedCat?.cartaFamiliaId?.trim();
    const menuFamName =
      selMenuFamId != null && selMenuFamId !== ""
        ? cartaFamilias.find((x) => x.id === selMenuFamId)?.name
        : undefined;

    if (isCentralCatalog) {
      const saleProductIdForRecipe = editingId?.trim() ?? "";
      const recipeValidation = normalizeProductRecipe(
        buildRecipeSourceFromDraftRows(draftRecipeEnabled, draftRecipeRows),
        { saleProductId: saleProductIdForRecipe, inventoryProductsById: inventoryLookupMap },
      );
      if (recipeValidation.errors.length > 0) {
        setFormError(recipeValidation.errors[0] ?? "Revisa el escandallo.");
        return;
      }

      setDrawerSyncing(true);
      try {
        const existingFlags = editingId
          ? getPublicationFlags(items.find((p) => p.id === editingId)!)
          : null;
        const centralInput = buildCentralInputFromDraft({
          nombre,
          operationStationSelect: draftOperationStationSelect,
          operationStations,
          cartaCategorias,
          draftTipo,
          categoria,
          categoriaCartaIdPatch,
          precioVenta,
          draftActivo,
          draftDesc,
          draftCourse,
          existingIsActive: existingFlags?.isActive,
        });
        let savedProductId = editingId?.trim() ?? "";
        if (editingId) {
          await updateCentralProduct(restauranteId, editingId, centralInput);
        } else {
          savedProductId = await createCentralProduct(restauranteId, centralInput);
        }
        await updateCentralProductRecipe(
          restauranteId,
          savedProductId,
          normalizedProductRecipeToWriteInput(recipeValidation.recipe),
        );
        setNotice("Guardado en catálogo central");
        closeForm();
        window.setTimeout(() => setNotice(null), 3200);
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      } finally {
        setDrawerSyncing(false);
      }
      return;
    }

    if (isLegacyReadOnly) return;

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
      setDraftCategoriaCartaId(newCat.id);
      setDraftCartaMenuFamiliaId(
        newCat.cartaFamiliaId?.trim() ? newCat.cartaFamiliaId.trim() : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED,
      );
      const inferred = inferTipoVentaFromCategory(newCat);
      if (inferred) {
        setDraftTipo(inferred);
        setDraftOperationStationSelect(defaultOperationStationSelectForTipoVenta(inferred));
      }
      setAddCategoryOpen(false);
      setAddCatName("");
      setAddCatType(defaultCartaCategoriaTipoForTipoProducto(draftTipo));
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

  async function deleteProducto(p: PlatoCarta) {
    if (isLegacyReadOnly) return;
    const restauranteId = operationalRestaurantId;

    if (isCentralCatalog) {
      const decision = await resolveCartaProductDeleteAction({
        p,
        meta,
        centralDoc: centralDocsById.get(p.id),
        restaurantId: restauranteId,
        tieneEscandallo: tieneEscandalloForPlato,
      });

      if (decision.action === "delete") {
        const confirmMessage =
          decision.reason === "disposable_test"
            ? `¿Eliminar definitivamente "${p.nombre}"? Es un producto de prueba sin histórico.`
            : `¿Eliminar definitivamente "${p.nombre}"? No tiene ventas ni escandallo asociado.`;
        const ok = window.confirm(confirmMessage);
        if (!ok) return;
      } else {
        const ok = window.confirm(
          `"${p.nombre}" tiene histórico o dependencias y no se puede eliminar.\n\n¿Desactivarlo para ocultarlo de la carta?`,
        );
        if (!ok) return;
      }

      try {
        const outcome = await applyResolvedCartaCentralProductDelete(
          restauranteId,
          p.id,
          decision,
        );
        applyCentralDeleteOutcomeToUi(p, outcome);
        setNotice(
          outcome === "deleted"
            ? "Producto eliminado."
            : "Producto desactivado para conservar el histórico.",
        );
      } catch (e) {
        setFormError(formatCentralCatalogWriteError(e));
      }
      window.setTimeout(() => setNotice(null), 2200);
      return;
    }

    const ok = window.confirm(`¿Borrar "${p.nombre}" del catálogo? Esta acción no se puede deshacer.`);
    if (!ok) return;
    const next = items.filter((x) => x.id !== p.id);
    persist(next);
    if (editingId === p.id) {
      setFormOpen(false);
      setEditingId(null);
      setFormError(null);
    }
    setNotice("Producto borrado.");
    window.setTimeout(() => setNotice(null), 2200);
  }

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

  function renderConfigCartaHeaderActions(): ReactNode {
    return (
      <div className="hostly-productos-carta-header-inline-actions">
        <button
          type="button"
          disabled={isLegacyReadOnly}
          title={isLegacyReadOnly ? LEGACY_CATALOG_EDIT_BLOCKED : undefined}
          onClick={openCreate}
          className="hostly-button-primary hostly-button-compact hostly-productos-carta-header-inline-actions__btn whitespace-nowrap"
          style={isLegacyReadOnly ? { opacity: 0.48, cursor: "not-allowed" } : undefined}
        >
          {t("carta.ctaNew")}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push("/dashboard/configuracion/carta/importacion");
          }}
          className="hostly-button-secondary hostly-button-compact hostly-productos-carta-header-inline-actions__btn whitespace-nowrap"
        >
          Importar carta IA
        </button>
      </div>
    );
  }

  if (!profileReady || !hydrated) {
    if (configCartaProductosChrome) {
      return (
        <ConfigCartaWorkbench
          title={t("productos.title")}
          description={t("productos.subtitle")}
          lockViewport
          lockViewportFillParent={lockViewportFillParent}
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
          title={t("productos.title")}
          description={t("productos.subtitle")}
          lockViewport
          lockViewportFillParent={lockViewportFillParent}
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
      {formOpen ? (
        <div
          className="hostly-product-form-drawer-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={editingId ? t("carta.editProduct") : t("carta.newProduct")}
          onMouseDown={(e) => {
            if (e.currentTarget === e.target) closeForm();
          }}
        >
          <aside className="hostly-product-form-drawer" onMouseDown={(e) => e.stopPropagation()}>
            <div className="hostly-product-form-drawer__header">
              <div className="hostly-product-form-drawer__header-text">
                <h2 className="hostly-product-form-drawer__title">
                  {editingId ? t("carta.editProduct") : t("carta.newProduct")}
                </h2>
                <p className="hostly-product-form-drawer__subtitle">
                  {editingId ? t("carta.productFormEditHint") : t("carta.productFormNewHint")}
                </p>
              </div>
              <ConfigBtnSecondary type="button" onClick={closeForm}>
                {t("common.cancel")}
              </ConfigBtnSecondary>
            </div>

            <div className="hostly-product-form-drawer__body">
              <div className="hostly-product-form-drawer__sections">
                <div className="hostly-product-form-drawer-block__fields">
                  <label className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">{t("carta.fieldNombre")}</span>
                    <input
                      ref={nombreInputRef}
                      className={drawerInputProminentClass}
                      value={draftNombre}
                      onChange={(e) => setDraftNombre(e.target.value)}
                    />
                  </label>

                  <CategoriaCartaFormField
                    t={t}
                    categorias={categoriasForForm}
                    selectedId={draftCategoriaCartaId}
                    onSelectId={applyCategorySelection}
                    onOpenAddCategory={() => {
                      setAddCatType(defaultCartaCategoriaTipoForTipoProducto(draftTipo));
                      const fid = draftCartaMenuFamiliaId;
                      setAddCatCartaFamiliaId(
                        fid && fid !== CARTA_MENU_FAMILIA_FILTER_UNASSIGNED ? fid : undefined,
                      );
                      setAddCategoryOpen(true);
                    }}
                  />

                  {draftFormMetaLine ? (
                    <p className="hostly-product-form-drawer-meta">
                      <strong>{draftFormMetaLine}</strong>
                    </p>
                  ) : null}

                  <label className="hostly-carta-config-form-field">
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
                </div>

                <ProductFormDrawerCollapsibleSection
                  key={editingId ?? "new"}
                  title={t("carta.productFormBlockAdvanced")}
                  hint={t("carta.productFormBlockAdvancedHint")}
                  defaultOpen={false}
                >
                  <label className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">{t("carta.fieldOperationStation")}</span>
                    <OperationStationProductSelect
                      restaurantId={operationalRestaurantId}
                      value={draftOperationStationSelect}
                      onChange={setDraftOperationStationSelect}
                      disabled={drawerSyncing}
                      className={drawerInputClass}
                    />
                    {isLegacyOperationStationSelectValue(draftOperationStationSelect) ? (
                      <p className="hostly-carta-config-form-hint">{t("carta.fieldOperationStationLegacyHint")}</p>
                    ) : null}
                  </label>

                  {isCentralCatalog && draftSkipsMenuCourse ? (
                    <label className="hostly-carta-config-form-field">
                      <span className="hostly-carta-config-form-label">{t("carta.fieldDefaultCourse")}</span>
                      <div className={`${drawerInputClass} hostly-product-form-drawer-readonly`} aria-readonly>
                        {t("carta.productFormCourseLockedLabel")}
                      </div>
                      <p className="hostly-carta-config-form-hint">{t("carta.productFormCourseNotApplicable")}</p>
                    </label>
                  ) : null}

                  {isCentralCatalog && !draftSkipsMenuCourse ? (
                    <label className="hostly-carta-config-form-field">
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
                      <p className="hostly-carta-config-form-hint">{t("carta.fieldDefaultCourseHint")}</p>
                    </label>
                  ) : null}

                  {draftSelectedCategory && draftNeedsManualTipoVenta ? (
                    <div className="hostly-carta-config-form-field">
                      <p className="hostly-carta-config-form-hint">{t("carta.fieldFormatManualPrompt")}</p>
                      <div
                        className="hostly-product-form-drawer-radio-group"
                        role="radiogroup"
                        aria-label={t("carta.fieldFormatManualPrompt")}
                      >
                        {TIPOS_PRODUCTO_VENTA.map((tipo) => (
                          <label key={tipo} className="hostly-product-form-drawer-radio">
                            <input
                              type="radio"
                              name="product-form-draft-tipo"
                              checked={draftTipo === tipo}
                              onChange={() => {
                                setDraftTipo(tipo);
                                setDraftOperationStationSelect(defaultOperationStationSelectForTipoVenta(tipo));
                              }}
                            />
                            {labelTipoVenta(t, tipo)}
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <label className="hostly-product-form-drawer-checkbox">
                    <input type="checkbox" checked={draftActivo} onChange={(e) => setDraftActivo(e.target.checked)} />
                    <span className="hostly-carta-config-form-label">{t("carta.fieldActivo")}</span>
                  </label>

                  <label className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">{t("carta.fieldDescripcion")}</span>
                    <textarea
                      className={`${drawerInputClass} hostly-product-form-drawer-textarea`}
                      value={draftDesc}
                      onChange={(e) => setDraftDesc(e.target.value)}
                      rows={3}
                    />
                  </label>

                  <label className="hostly-carta-config-form-field">
                    <span className="hostly-carta-config-form-label">{t("carta.fieldFoto")}</span>
                    <input
                      className={drawerInputClass}
                      value={draftFoto}
                      onChange={(e) => setDraftFoto(e.target.value)}
                      placeholder="https://…"
                    />
                    <p className="hostly-carta-config-form-hint">{t("carta.fieldFotoHint")}</p>
                  </label>

                  {isCentralCatalog ? (
                    <>
                      {editingId && editingPlato ? (
                        <p className="hostly-carta-config-form-hint">
                          {t("carta.colEscandallo")}:{" "}
                          <span
                            className={
                              editingHasEscandallo
                                ? "hostly-carta-config-status-chip hostly-carta-config-status-chip--active"
                                : "hostly-carta-config-status-chip hostly-carta-config-status-chip--inactive"
                            }
                          >
                            {editingHasEscandallo ? t("carta.escSi") : t("carta.escNo")}
                          </span>
                        </p>
                      ) : null}
                      <ProductProfitabilityPanel
                        recipeEnabled={draftRecipeEnabled}
                        recipeRows={draftRecipeRows}
                        saleProductId={editingId}
                        salePrice={draftSalePriceForProfitability}
                        productDocumentsById={centralDocsById}
                      />
                      <ProductRecipeEditorSection
                        saleProductId={editingId}
                        enabled={draftRecipeEnabled}
                        onEnabledChange={setDraftRecipeEnabled}
                        rows={draftRecipeRows}
                        onRowsChange={setDraftRecipeRows}
                        inventoryProducts={inventoryLookup}
                        warnings={draftRecipeWarnings}
                        disabled={drawerSyncing}
                        labelStyle={labelStyle}
                        inputStyle={inputStyle}
                      />
                    </>
                  ) : null}

                  <label className="hostly-carta-config-form-field">
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
                          const allowed = cartaCategoriasForMenuFamiliaFiltro(cartaCategorias, nextFilter);
                          return allowed.some((x) => x.id === cur) ? cur : null;
                        });
                      }}
                    >
                      <option value="">{t("carta.familiaFilterAll")}</option>
                      <option value={CARTA_MENU_FAMILIA_FILTER_UNASSIGNED}>{t("carta.familiaFilterUnassigned")}</option>
                      {[...cartaFamilias]
                        .filter((f) => f.isActive !== false)
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                    <p className="hostly-carta-config-form-hint">{t("carta.fieldCartaFamiliaHint")}</p>
                  </label>

                  <p className="hostly-product-form-drawer-meta">
                    {t("carta.fieldProductFamilyInherited")}: <strong>{draftProductFamilyLabel}</strong>
                  </p>
                  <p className="hostly-carta-config-form-hint">{t("carta.fieldProductFamilyInheritedHint")}</p>
                  <p className="hostly-product-form-drawer-meta">
                    {t("carta.fieldModifiersInherited")}: <strong>{draftEffectiveModifierLabel}</strong>
                  </p>
                </ProductFormDrawerCollapsibleSection>

                {formError ? (
                  <div className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">
                    {formError}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="hostly-product-form-drawer__footer">
              <ConfigBtnPrimary
                type="button"
                className="hostly-product-form-drawer__footer-primary"
                disabled={drawerSyncing}
                onClick={() => void submitForm()}
              >
                {drawerSyncing ? t("common.preparing") : t("common.save")}
              </ConfigBtnPrimary>
              <ConfigBtnSecondary type="button" onClick={closeForm}>
                {t("common.cancel")}
              </ConfigBtnSecondary>
            </div>
          </aside>
        </div>
      ) : null}

      {addCategoryOpen ? (
        <div
          className="hostly-carta-config-drawer-backdrop hostly-carta-config-drawer-backdrop--elevated"
          role="dialog"
          aria-modal="true"
          aria-label={t("cartaCategories.quickAddTitle")}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddCategoryOpen(false);
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
              <ConfigBtnSecondary type="button" onClick={() => setAddCategoryOpen(false)}>
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
    </>
  );

  if (configCartaProductosChrome) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: productosTableInteractionStyles }} />
        <ConfigCartaWorkbench
          title={t("productos.title")}
          description={t("productos.subtitle")}
          lockViewport
          lockViewportFillParent={lockViewportFillParent}
          headerActions={renderConfigCartaHeaderActions()}
        >
          <HostlySection
            stack="sm"
            className="hostly-productos-config-skin hostly-productos-config-skin--simplified min-h-0 min-w-0 flex-1 overflow-hidden !gap-0"
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
              <div className="hostly-productos-carta-toolbar hostly-productos-carta-toolbar--radical hostly-productos-carta-toolbar--config-primary">
              <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Buscar producto..."
              aria-label="Buscar producto"
              disabled={reorderMode}
              className="hostly-productos-carta-search hostly-productos-carta-search--prominent"
              />
              <button
              type="button"
              className={`hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--reorder${reorderMode ? " is-active" : ""}`}
              aria-pressed={reorderMode}
              aria-label={t("productos.orderModeAria")}
              title={canUseProductReorder ? (reorderMode ? t("productos.orderModeActiveHint") : t("productos.orderModeAria")) : t("productos.orderModeDisabledHint")}
              disabled={!canUseProductReorder}
              onClick={toggleReorderMode}
              >
              {reorderMode ? t("productos.orderModeDone") : t("productos.orderMode")}
              </button>
              <button
              type="button"
              className="hostly-productos-carta-advanced-toggle hostly-productos-carta-advanced-toggle--toolbar"
              aria-expanded={configCartaAdvancedOpen}
              aria-controls="hostly-productos-carta-advanced-panel"
              onClick={() => setConfigCartaAdvancedOpen((open) => !open)}
              >
              {configCartaAdvancedOpen ? "Menos opciones" : "Más opciones"}
              </button>
              </div>
              <ConfigCartaCompactFilterRow>
                {renderCatalogFoodDrinkSegment(true)}
                {renderConfigCartaStatusFilterSelect()}
              </ConfigCartaCompactFilterRow>
              {reorderMode ? (
              <p className="hostly-productos-reorder-hint" role="status">
              {t("productos.orderModeActiveHint")}
              </p>
              ) : null}
              {configCartaAdvancedOpen ? (
              <div
              id="hostly-productos-carta-advanced-panel"
              className="hostly-productos-carta-advanced-panel hostly-productos-carta-advanced-panel--inline"
              >
              <nav className="hostly-productos-carta-advanced-nav" aria-label="Navegación avanzada de carta">
              <Link href="/dashboard/configuracion/carta/categorias">{t("cartaCategories.manageLink")}</Link>
              <button
              type="button"
              onClick={() => router.push("/dashboard/configuracion/carta/modificadores")}
              >
              {t("carta.ctaModifiers")}
              </button>
              <Link href="/dashboard/configuracion/carta/escandallos">Escandallos</Link>
              </nav>
              <div className="hostly-productos-carta-advanced-section">
              <span className="hostly-productos-carta-advanced-section__label">Escandallo</span>
              <div className="hostly-productos-carta-filter-chips">
              {iceToolbarFilterButtons(true, CONFIG_CARTA_ADVANCED_ESC_FILTER_IDS)}
              </div>
              </div>
              <div className="hostly-productos-carta-advanced-section">
              <span className="hostly-productos-carta-advanced-section__label">Categorías de carta</span>
              <div
              className="hostly-productos-carta-category-tabs hostly-productos-carta-category-tabs--secondary"
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
              aria-pressed={active}
              className={`hostly-productos-carta-filter-chip hostly-productos-carta-filter-chip--category${active ? " is-active" : ""}`}
              >
              {tab.label}
              </button>
              );
              })}
              </div>
              </div>
              <div className="hostly-productos-carta-advanced-section">
              <span className="hostly-productos-carta-advanced-section__label">Vista</span>
              <div className="hostly-productos-carta-view-discreet" role="group" aria-label="Modo de vista">
              {iceToolbarViewControls(true)}
              </div>
              </div>
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
              <div className="hostly-productos-carta-muted-empty">{t("carta.searchNoResults")}</div>
              ) : (
              <ProductosCartaDataView
              displayed={displayed}
              groupedByCategoria={groupedByCategoria}
              viewMode={reorderMode ? "list" : viewMode}
              selectedIds={selectedIds}
              selectAllRef={selectAllRef}
              isLegacyReadOnly={isLegacyReadOnly}
              meta={meta}
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
              reorderMode={reorderMode}
              reorderBusyId={reorderBusyId}
              onMoveProductUp={handleMoveProductUp}
              onMoveProductDown={handleMoveProductDown}
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
      title={t("productos.title")}
      subtitle={t("productos.subtitle")}
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
              {t("carta.ctaNew")}
            </button>
          </div>
        </div>
      }
    >
      <HostlySection
        stack="sm"
        className={
          iceVisual
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

        {iceVisual ? (
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
              title={t("carta.listTitle")}
              description={t("carta.listCount", { shown: displayed.length, total: items.length })}
              descriptionClassName="!text-[10px] !font-semibold !leading-snug !m-0"
              className="shrink-0 border-b border-[var(--hostly-line)] px-1.5 py-0.5"
            >
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={t("carta.searchPlaceholder")}
                aria-label={t("carta.searchPlaceholder")}
                style={{
                  minWidth: 160,
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: "220px",
                  maxWidth: 360,
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: "1px solid var(--hostly-line)",
                  background: "var(--hostly-surface-page-soft)",
                  color: "var(--hostly-ink-strong)",
                  fontSize: 12,
                  outline: "none",
                  boxSizing: "border-box",
                  minHeight: 32,
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
                                        style={{
                                          display: "flex",
                                          gap: iceVisual ? 8 : 6,
                                          alignItems: "center",
                                          minWidth: 0,
                                          overflow: "hidden",
                                          width: "100%",
                                          paddingTop: iceVisual ? 1 : 0,
                                        }}
                                        title={p.nombre}
                                      >
                                        <span style={rowNombreStyleResolved}>{p.nombre}</span>
                                        {p.origenAlta === "importacion_ia" ? (
                                          <span
                                            style={{
                                              flexShrink: 0,
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
                                    style={{
                                      display: "flex",
                                      gap: iceVisual ? 8 : 6,
                                      alignItems: "center",
                                      minWidth: 0,
                                      overflow: "hidden",
                                      width: "100%",
                                      paddingTop: iceVisual ? 1 : 0,
                                    }}
                                    title={p.nombre}
                                  >
                                    <span style={rowNombreStyleResolved}>{p.nombre}</span>
                                    {p.origenAlta === "importacion_ia" ? (
                                      <span
                                        style={{
                                          flexShrink: 0,
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

