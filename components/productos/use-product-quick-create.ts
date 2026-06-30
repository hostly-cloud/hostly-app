"use client";

import { useCallback, useMemo, useState } from "react";
import { resolveProductFamilyFromSelectValue } from "@/lib/carta/category-product-family";
import { cartaCategoriasForProductForm } from "@/lib/carta-categorias/filter-for-tipo-producto";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import { evaluateProductFormPreventiveValidation } from "@/lib/carta/product-form-preventive-validation";
import { productFormSkipsMenuCourse } from "@/lib/carta/product-form-menu-course";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import { buildInventoryProductLookupMap, productDocumentsToInventoryLookup } from "@/lib/recipes/product-recipe-helpers";
import type { ProductDocument } from "@/lib/firestore/products";
import {
  createEmptyProductQuickCreateDraft,
  resolveCategorySelectionInheritance,
  resolveQuickCreateInheritedDraft,
  type ProductQuickCreateDraft,
} from "@/lib/productos/product-category-inheritance";
import {
  buildCentralInputFromProductFormDraft,
  validateProductFormCoreFields,
  type ProductFormCoreDraft,
  type ProductFormSubmitMessages,
} from "@/lib/productos/product-form-submit-payload";
import { persistCentralCatalogProduct } from "@/lib/productos/persist-central-catalog-product";

export type UseProductQuickCreateArgs = {
  restaurantId: string;
  cartaCategorias: readonly CartaCategoria[];
  operationStations: readonly OperationStationDocument[];
  productFamilies: readonly ProductFamilyDocument[];
  modifierGroups: readonly ModifierGroupDocument[];
  inventoryProducts: readonly ProductDocument[];
  messages: ProductFormSubmitMessages;
  /** Catálogo central activo; alta rápida solo persiste en central en fases posteriores. */
  isCentralCatalog: boolean;
};

export type UseProductQuickCreateResult = {
  draft: ProductQuickCreateDraft;
  inheritedDraft: ReturnType<typeof resolveQuickCreateInheritedDraft>;
  categoriasForForm: CartaCategoria[];
  saving: boolean;
  error: string | null;
  setNombre: (value: string) => void;
  setPrecio: (value: string) => void;
  selectCategory: (categoryId: string | null) => void;
  resetDraft: () => void;
  /** Preparado para la siguiente iteración; devuelve null si central no está activo. */
  submitQuickCreate: () => Promise<string | null>;
};

export function useProductQuickCreate(
  args: UseProductQuickCreateArgs,
): UseProductQuickCreateResult {
  const [draft, setDraft] = useState<ProductQuickCreateDraft>(
    createEmptyProductQuickCreateDraft,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inheritedDraft = useMemo(
    () => resolveQuickCreateInheritedDraft(draft.categoriaCartaId, args.cartaCategorias),
    [draft.categoriaCartaId, args.cartaCategorias],
  );

  const categoriasForForm = useMemo(
    () =>
      cartaCategoriasForProductForm(
        [...args.cartaCategorias],
        inheritedDraft.tipoVenta,
        inheritedDraft.cartaMenuFamiliaId,
        { currentCategoryId: draft.categoriaCartaId },
      ),
    [
      args.cartaCategorias,
      inheritedDraft.tipoVenta,
      inheritedDraft.cartaMenuFamiliaId,
      draft.categoriaCartaId,
    ],
  );

  const inventoryLookupMap = useMemo(
    () =>
      buildInventoryProductLookupMap(
        productDocumentsToInventoryLookup([...args.inventoryProducts]),
      ),
    [args.inventoryProducts],
  );

  const formCoreDraft = useMemo((): ProductFormCoreDraft => {
    return {
      nombre: draft.nombre,
      precioInput: draft.precio,
      categoriaCartaId: draft.categoriaCartaId,
      draftTipo: inheritedDraft.tipoVenta,
      draftActivo: inheritedDraft.activo,
      draftOperationStationSelect: inheritedDraft.operationStationSelect,
      draftCourse: inheritedDraft.course,
      draftProductFamilyId: inheritedDraft.productFamilyId,
      draftProductCompositionType: inheritedDraft.productCompositionType,
      draftDesc: inheritedDraft.desc,
      draftModifierGroupIds: inheritedDraft.modifierGroupIds,
    };
  }, [draft, inheritedDraft]);

  const preventiveValidation = useMemo(
    () =>
      evaluateProductFormPreventiveValidation({
        tipoVenta: formCoreDraft.draftTipo,
        active: formCoreDraft.draftActivo,
        categoryId: formCoreDraft.categoriaCartaId,
        hasProductFamily: Boolean(
          resolveProductFamilyFromSelectValue(
            formCoreDraft.draftProductFamilyId,
            args.productFamilies,
          ),
        ),
        operationStationSelect: formCoreDraft.draftOperationStationSelect,
        operationStations: args.operationStations,
        courseSelectValue: formCoreDraft.draftCourse,
        skipsMenuCourse: productFormSkipsMenuCourse({
          tipo: formCoreDraft.draftTipo,
          operationStationSelect: formCoreDraft.draftOperationStationSelect,
          operationStations: args.operationStations,
        }),
        validateCourse: args.isCentralCatalog,
      }),
    [formCoreDraft, args.productFamilies, args.operationStations, args.isCentralCatalog],
  );

  const resetDraft = useCallback(() => {
    setDraft(createEmptyProductQuickCreateDraft());
    setError(null);
  }, []);

  const setNombre = useCallback((value: string) => {
    setDraft((prev) => ({ ...prev, nombre: value }));
    setError(null);
  }, []);

  const setPrecio = useCallback((value: string) => {
    setDraft((prev) => ({ ...prev, precio: value }));
    setError(null);
  }, []);

  const selectCategory = useCallback(
    (categoryId: string | null) => {
      const inheritance = resolveCategorySelectionInheritance(
        categoryId,
        args.cartaCategorias,
      );
      setDraft((prev) => ({
        ...prev,
        categoriaCartaId: inheritance.categoriaCartaId,
      }));
      setError(null);
    },
    [args.cartaCategorias],
  );

  const submitQuickCreate = useCallback(async (): Promise<string | null> => {
    if (!args.isCentralCatalog) {
      setError("Alta rápida disponible solo con catálogo central.");
      return null;
    }

    const validation = validateProductFormCoreFields(formCoreDraft, {
      cartaCategorias: args.cartaCategorias,
      modifierGroups: args.modifierGroups,
      preventiveValidation,
      messages: args.messages,
    });

    if (!validation.ok) {
      setError(validation.error);
      return null;
    }

    const centralInput = buildCentralInputFromProductFormDraft(
      formCoreDraft,
      validation,
      {
        operationStations: args.operationStations,
        productFamilies: args.productFamilies,
        cartaCategorias: args.cartaCategorias,
      },
    );

    setSaving(true);
    setError(null);
    try {
      const result = await persistCentralCatalogProduct({
        restaurantId: args.restaurantId,
        centralInput,
        inventoryLookupMap,
        recipeEnabled: false,
        recipeRows: [],
      });

      if (!result.ok) {
        setError(result.error);
        return null;
      }

      resetDraft();
      return result.productId;
    } finally {
      setSaving(false);
    }
  }, [
    args.isCentralCatalog,
    args.restaurantId,
    args.cartaCategorias,
    args.modifierGroups,
    args.operationStations,
    args.productFamilies,
    formCoreDraft,
    preventiveValidation,
    inventoryLookupMap,
    args.messages,
    resetDraft,
  ]);

  return {
    draft,
    inheritedDraft,
    categoriasForForm,
    saving,
    error,
    setNombre,
    setPrecio,
    selectCategory,
    resetDraft,
    submitQuickCreate,
  };
}
