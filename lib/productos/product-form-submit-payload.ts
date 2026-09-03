import { isCartaCategoriaCompatibleWithTipoProducto } from "@/lib/carta-categorias/filter-for-tipo-producto";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import {
  getProductFormSubmitBlockingErrors,
  type ProductFormPreventiveValidationResult,
} from "@/lib/carta/product-form-preventive-validation";
import type { ProductCompositionType } from "@/lib/carta/product-composition-type";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import type { TipoProductoVenta } from "@/lib/carta/product-sale-contract";
import type { CentralOperationalProductInput } from "@/lib/firestore/products";
import { sanitizeModifierGroupIdsForProductKind } from "@/lib/modifiers/effective-product-modifiers";
import type { ModifierGroupDocument } from "@/lib/modifiers/modifier-types";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import {
  buildCentralInputFromDraft,
  parseProductPrecio,
} from "@/lib/productos/product-central-draft";

export type ProductFormCoreDraft = {
  nombre: string;
  precioInput: string;
  categoriaCartaId: string | null;
  draftTipo: TipoProductoVenta;
  draftActivo: boolean;
  draftOperationStationSelect: string;
  draftCourse: string;
  draftProductFamilyId: string;
  draftProductCompositionType: ProductCompositionType;
  draftDesc: string;
  draftModifierGroupIds: readonly string[];
};

export type ProductFormSubmitMessages = {
  errorNombre: string;
  errorPrecio: string;
  errorCategoriaTipo: string;
};

export type ProductFormCoreValidationResult =
  | {
      ok: true;
      nombre: string;
      precioVenta: number;
      selectedCategory: CartaCategoria | undefined;
      modifierGroupIdsForSave: string[] | null;
      categoria: string;
      categoriaCartaIdPatch: string | undefined;
    }
  | { ok: false; error: string };

export function validateProductFormCoreFields(
  draft: ProductFormCoreDraft,
  context: {
    cartaCategorias: readonly CartaCategoria[];
    modifierGroups: readonly ModifierGroupDocument[];
    preventiveValidation: ProductFormPreventiveValidationResult;
    messages: ProductFormSubmitMessages;
  },
): ProductFormCoreValidationResult {
  const nombre = draft.nombre.trim();
  if (!nombre) {
    return { ok: false, error: context.messages.errorNombre };
  }

  const precioVenta = parseProductPrecio(draft.precioInput);
  if (precioVenta == null) {
    return { ok: false, error: context.messages.errorPrecio };
  }

  const preventiveBlockingErrors = getProductFormSubmitBlockingErrors(
    context.preventiveValidation,
  );
  if (preventiveBlockingErrors.length > 0) {
    return { ok: false, error: preventiveBlockingErrors[0]! };
  }

  const selectedCategory = draft.categoriaCartaId
    ? context.cartaCategorias.find((c) => c.id === draft.categoriaCartaId)
    : undefined;

  if (
    selectedCategory &&
    !isCartaCategoriaCompatibleWithTipoProducto(selectedCategory, draft.draftTipo)
  ) {
    return { ok: false, error: context.messages.errorCategoriaTipo };
  }

  const inheritedIdsForSave = selectedCategory
    ? sanitizeModifierGroupIdsForProductKind(
        selectedCategory.modifierGroupIds ?? [],
        context.modifierGroups,
        draft.draftTipo,
      )
    : [];
  const inheritedIdSetForSave = new Set(inheritedIdsForSave);
  const sanitizedModifierGroupIds = sanitizeModifierGroupIdsForProductKind(
    [...draft.draftModifierGroupIds],
    context.modifierGroups,
    draft.draftTipo,
  ).filter((id) => !inheritedIdSetForSave.has(id));
  const modifierGroupIdsForSave =
    sanitizedModifierGroupIds.length > 0 ? sanitizedModifierGroupIds : null;

  return {
    ok: true,
    nombre,
    precioVenta,
    selectedCategory,
    modifierGroupIdsForSave,
    categoria: selectedCategory ? selectedCategory.name : "",
    categoriaCartaIdPatch: selectedCategory ? selectedCategory.id : undefined,
  };
}

export function buildCentralInputFromProductFormDraft(
  draft: ProductFormCoreDraft,
  validated: Extract<ProductFormCoreValidationResult, { ok: true }>,
  context: {
    operationStations: readonly OperationStationDocument[];
    productFamilies: readonly ProductFamilyDocument[];
    cartaCategorias: readonly CartaCategoria[];
    existingIsActive?: boolean;
  },
): CentralOperationalProductInput {
  return buildCentralInputFromDraft({
    nombre: validated.nombre,
    operationStationSelect: draft.draftOperationStationSelect,
    operationStations: context.operationStations,
    cartaCategorias: context.cartaCategorias,
    draftTipo: draft.draftTipo,
    draftProductCompositionType: draft.draftProductCompositionType,
    categoria: validated.categoria,
    categoriaCartaIdPatch: validated.categoriaCartaIdPatch,
    precioVenta: validated.precioVenta,
    draftActivo: draft.draftActivo,
    draftDesc: draft.draftDesc,
    draftCourse: draft.draftCourse,
    productFamilySelect: draft.draftProductFamilyId,
    productFamilies: context.productFamilies,
    existingIsActive: context.existingIsActive,
    modifierGroupIds: validated.modifierGroupIdsForSave,
  });
}
