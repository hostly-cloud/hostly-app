import {
  buildCategoryProductFamilyFields,
  resolveProductFamilyFromSelectValue,
} from "@/lib/carta/category-product-family";
import {
  productCatalogCourseFromSelectValue,
} from "@/lib/carta/menu-course";
import {
  normalizeProductCompositionType,
  type ProductCompositionType,
} from "@/lib/carta/product-composition-type";
import type { TipoProductoVenta } from "@/lib/carta/product-sale-contract";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import type { ProductFamilyDocument } from "@/lib/carta/product-family-types";
import type { CentralOperationalProductInput } from "@/lib/firestore/products";
import { selectValueToPreparationArea } from "@/lib/carta/operational-station-options";
import {
  isNoneOperationStationSelectValue,
  resolveOperationStationFromSelectValue,
} from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";

export function defaultOperationStationSelectForTipoVenta(
  tipo: TipoProductoVenta,
): string {
  return tipo === "bebida" ? "default-bar" : "default-kitchen";
}

export function parseProductPrecio(s: string): number | null {
  const x = s.trim().replace(",", ".");
  if (x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function resolveProductFamilyFirestoreFromDraft(args: {
  productFamilySelect: string;
  productFamilies: readonly ProductFamilyDocument[];
}): Pick<
  CentralOperationalProductInput,
  "productFamilyId" | "productFamilyName" | "productFamilyType"
> {
  const selected = resolveProductFamilyFromSelectValue(
    args.productFamilySelect,
    args.productFamilies,
  );
  if (selected) {
    const fields = buildCategoryProductFamilyFields(selected);
    return {
      productFamilyId: fields.productFamilyId ?? null,
      productFamilyName: fields.productFamilyName ?? null,
      productFamilyType: fields.productFamilyType ?? null,
    };
  }
  return {
    productFamilyId: null,
    productFamilyName: null,
    productFamilyType: null,
  };
}

export type BuildCentralInputFromDraftArgs = {
  nombre: string;
  operationStationSelect: string;
  operationStations: readonly OperationStationDocument[];
  cartaCategorias: readonly CartaCategoria[];
  draftTipo: TipoProductoVenta;
  draftProductCompositionType: ProductCompositionType;
  categoria: string;
  categoriaCartaIdPatch?: string;
  precioVenta: number;
  draftActivo: boolean;
  draftDesc: string;
  draftCourse: string;
  productFamilySelect: string;
  productFamilies: readonly ProductFamilyDocument[];
  existingIsActive?: boolean;
  modifierGroupIds?: string[] | null;
};

/** Construye el payload Firestore compartido por formulario completo y alta rápida. */
export function buildCentralInputFromDraft(
  args: BuildCentralInputFromDraftArgs,
): CentralOperationalProductInput {
  const categoryId = args.categoriaCartaIdPatch ?? null;
  const familyFirestore = resolveProductFamilyFirestoreFromDraft({
    productFamilySelect: args.productFamilySelect,
    productFamilies: args.productFamilies,
  });

  const base = {
    name: args.nombre,
    categoryName: args.categoria.trim() || "General",
    categoryId,
    price: args.precioVenta,
    tipoVenta: args.draftTipo,
    productCompositionType: normalizeProductCompositionType(
      args.draftProductCompositionType,
    ),
    visibleOnMenu: args.draftActivo,
    active: args.existingIsActive !== false,
    course: productCatalogCourseFromSelectValue(args.draftCourse),
    ...(args.draftDesc.trim() ? { description: args.draftDesc.trim() } : {}),
    ...familyFirestore,
    ...(args.modifierGroupIds !== undefined
      ? { modifierGroupIds: args.modifierGroupIds }
      : {}),
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
