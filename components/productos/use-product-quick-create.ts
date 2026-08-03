"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveProductFamilyFromSelectValue } from "@/lib/carta/category-product-family";
import { cartaCategoriasForProductSelectorList } from "@/lib/carta-categorias/filter-for-tipo-producto";
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
  resetProductQuickCreateDraftKeepingCategory,
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

export type ProductQuickCreateSubmitMode = "continue" | "close";

export type ProductQuickCreateSubmitResult = {
  productId: string;
  mode: ProductQuickCreateSubmitMode;
};

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
  successFlash: string | null;
  canSubmit: boolean;
  hasUnsavedChanges: boolean;
  setNombre: (value: string) => void;
  setPrecio: (value: string) => void;
  selectCategory: (categoryId: string | null) => void;
  resetDraft: () => void;
  syncBaseline: () => void;
  submitQuickCreate: (
    mode?: ProductQuickCreateSubmitMode,
  ) => Promise<ProductQuickCreateSubmitResult | null>;
};

const QUICK_CREATE_SUCCESS_FLASH_MS = 2200;

export function areProductQuickCreateDraftsEqual(
  left: ProductQuickCreateDraft,
  right: ProductQuickCreateDraft,
): boolean {
  return (
    left.nombre.trim() === right.nombre.trim() &&
    left.categoriaCartaId === right.categoriaCartaId &&
    left.precio.trim() === right.precio.trim()
  );
}

function snapshotQuickCreateDraft(
  draft: ProductQuickCreateDraft,
): ProductQuickCreateDraft {
  return {
    nombre: draft.nombre,
    categoriaCartaId: draft.categoriaCartaId,
    precio: draft.precio,
  };
}

export function useProductQuickCreate(
  args: UseProductQuickCreateArgs,
): UseProductQuickCreateResult {
  const [draft, setDraft] = useState<ProductQuickCreateDraft>(
    createEmptyProductQuickCreateDraft,
  );
  const [baselineDraft, setBaselineDraft] = useState<ProductQuickCreateDraft>(
    createEmptyProductQuickCreateDraft,
  );
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState<string | null>(null);
  const successFlashTimerRef = useRef<number | null>(null);

  const clearSuccessFlash = useCallback(() => {
    if (successFlashTimerRef.current != null) {
      window.clearTimeout(successFlashTimerRef.current);
      successFlashTimerRef.current = null;
    }
    setSuccessFlash(null);
  }, []);

  const showSuccessFlash = useCallback(
    (message: string) => {
      setSuccessFlash(message);
      if (successFlashTimerRef.current != null) {
        window.clearTimeout(successFlashTimerRef.current);
      }
      successFlashTimerRef.current = window.setTimeout(() => {
        setSuccessFlash(null);
        successFlashTimerRef.current = null;
      }, QUICK_CREATE_SUCCESS_FLASH_MS);
    },
    [],
  );

  useEffect(() => () => clearSuccessFlash(), [clearSuccessFlash]);

  const inheritedDraft = useMemo(
    () => resolveQuickCreateInheritedDraft(draft.categoriaCartaId, args.cartaCategorias),
    [draft.categoriaCartaId, args.cartaCategorias],
  );

  const categoriasForForm = useMemo(
    () => cartaCategoriasForProductSelectorList(args.cartaCategorias),
    [args.cartaCategorias],
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

  const canSubmit = useMemo(() => {
    if (saving || !args.isCentralCatalog) return false;
    const validation = validateProductFormCoreFields(formCoreDraft, {
      cartaCategorias: args.cartaCategorias,
      modifierGroups: args.modifierGroups,
      preventiveValidation,
      messages: args.messages,
    });
    return validation.ok;
  }, [
    saving,
    args.isCentralCatalog,
    formCoreDraft,
    args.cartaCategorias,
    args.modifierGroups,
    preventiveValidation,
    args.messages,
  ]);

  const hasUnsavedChanges = useMemo(
    () => !areProductQuickCreateDraftsEqual(draft, baselineDraft),
    [draft, baselineDraft],
  );

  const syncBaseline = useCallback(() => {
    setBaselineDraft(snapshotQuickCreateDraft(draftRef.current));
  }, []);

  const resetDraft = useCallback(() => {
    const empty = createEmptyProductQuickCreateDraft();
    setDraft(empty);
    setBaselineDraft(empty);
    setError(null);
    clearSuccessFlash();
  }, [clearSuccessFlash]);

  const resetDraftForContinuousCreate = useCallback(() => {
    const nextDraft = resetProductQuickCreateDraftKeepingCategory(draftRef.current);
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setBaselineDraft(snapshotQuickCreateDraft(nextDraft));
    setError(null);
  }, []);

  const setNombre = useCallback((value: string) => {
    setDraft((prev) => ({ ...prev, nombre: value }));
    setError(null);
    clearSuccessFlash();
  }, [clearSuccessFlash]);

  const setPrecio = useCallback((value: string) => {
    setDraft((prev) => ({ ...prev, precio: value }));
    setError(null);
    clearSuccessFlash();
  }, [clearSuccessFlash]);

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
      clearSuccessFlash();
    },
    [args.cartaCategorias, clearSuccessFlash],
  );

  const submitQuickCreate = useCallback(
    async (
      mode: ProductQuickCreateSubmitMode = "continue",
    ): Promise<ProductQuickCreateSubmitResult | null> => {
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
      clearSuccessFlash();
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

        if (mode === "continue") {
          resetDraftForContinuousCreate();
          showSuccessFlash("✓ Producto creado");
        } else {
          resetDraft();
        }

        return { productId: result.productId, mode };
      } finally {
        setSaving(false);
      }
    },
    [
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
      resetDraftForContinuousCreate,
      showSuccessFlash,
      clearSuccessFlash,
    ],
  );

  return {
    draft,
    inheritedDraft,
    categoriasForForm,
    saving,
    error,
    successFlash,
    canSubmit,
    hasUnsavedChanges,
    setNombre,
    setPrecio,
    selectCategory,
    resetDraft,
    syncBaseline,
    submitQuickCreate,
  };
}
