import { CATEGORY_PRODUCT_FAMILY_NONE } from "@/lib/carta/category-product-family";
import {
  inferTipoVentaFromCategory,
} from "@/lib/carta-categorias/filter-for-tipo-producto";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import { CARTA_MENU_FAMILIA_FILTER_UNASSIGNED } from "@/lib/carta-categorias/types";
import {
  DEFAULT_PRODUCT_COMPOSITION_TYPE,
  type ProductCompositionType,
} from "@/lib/carta/product-composition-type";
import { buildProductFamilyPatchFromCategoryId } from "@/lib/carta/product-category-family-resolver";
import type { TipoProductoVenta } from "@/lib/platos-local";
import { defaultOperationStationSelectForTipoVenta } from "@/lib/productos/product-central-draft";

export type ProductCategoryInheritancePatch = {
  categoriaCartaId: string | null;
  cartaMenuFamiliaId: string | null;
  productFamilyId: string;
};

/** Herencia de familia menú y familia producto al seleccionar categoría (sin I/O). */
export function resolveCategorySelectionInheritance(
  categoryId: string | null,
  cartaCategorias: readonly CartaCategoria[],
): ProductCategoryInheritancePatch {
  if (!categoryId) {
    return {
      categoriaCartaId: null,
      cartaMenuFamiliaId: null,
      productFamilyId: CATEGORY_PRODUCT_FAMILY_NONE,
    };
  }

  const category = cartaCategorias.find((c) => c.id === categoryId);
  if (!category) {
    return {
      categoriaCartaId: categoryId,
      cartaMenuFamiliaId: null,
      productFamilyId: CATEGORY_PRODUCT_FAMILY_NONE,
    };
  }

  const familyPatch = buildProductFamilyPatchFromCategoryId(
    categoryId,
    cartaCategorias,
  );
  let productFamilyId = CATEGORY_PRODUCT_FAMILY_NONE;
  if (familyPatch.clearProductFamily) {
    productFamilyId = CATEGORY_PRODUCT_FAMILY_NONE;
  } else if (familyPatch.productFamilyId) {
    productFamilyId = familyPatch.productFamilyId;
  }

  return {
    categoriaCartaId: categoryId,
    cartaMenuFamiliaId: category.cartaFamiliaId?.trim()
      ? category.cartaFamiliaId.trim()
      : CARTA_MENU_FAMILIA_FILTER_UNASSIGNED,
    productFamilyId,
  };
}

/** Valores derivados automáticamente para alta rápida a partir de categoría + defaults. */
export type ProductQuickCreateInheritedDraft = {
  tipoVenta: TipoProductoVenta;
  operationStationSelect: string;
  productFamilyId: string;
  cartaMenuFamiliaId: string | null;
  productCompositionType: ProductCompositionType;
  activo: boolean;
  course: string;
  modifierGroupIds: readonly string[];
  desc: string;
};

export function resolveQuickCreateInheritedDraft(
  categoryId: string | null,
  cartaCategorias: readonly CartaCategoria[],
): ProductQuickCreateInheritedDraft {
  const category = categoryId
    ? cartaCategorias.find((c) => c.id === categoryId)
    : undefined;
  const tipoVenta = inferTipoVentaFromCategory(category) ?? "plato";
  const inheritance = resolveCategorySelectionInheritance(
    categoryId,
    cartaCategorias,
  );

  return {
    tipoVenta,
    operationStationSelect: defaultOperationStationSelectForTipoVenta(tipoVenta),
    productFamilyId: inheritance.productFamilyId,
    cartaMenuFamiliaId: inheritance.cartaMenuFamiliaId,
    productCompositionType: DEFAULT_PRODUCT_COMPOSITION_TYPE,
    activo: true,
    course: "",
    modifierGroupIds: [],
    desc: "",
  };
}

export type ProductQuickCreateDraft = {
  nombre: string;
  categoriaCartaId: string | null;
  precio: string;
};

export function createEmptyProductQuickCreateDraft(): ProductQuickCreateDraft {
  return {
    nombre: "",
    categoriaCartaId: null,
    precio: "",
  };
}

/** Alta continua: limpia nombre y precio; mantiene categoría y herencias. */
export function resetProductQuickCreateDraftKeepingCategory(
  draft: ProductQuickCreateDraft,
): ProductQuickCreateDraft {
  return {
    nombre: "",
    precio: "",
    categoriaCartaId: draft.categoriaCartaId,
  };
}
