import {
  mapPreparationAreaToStation,
  mapStationToPreparationArea,
} from "@/lib/carta/map-station-to-preparation-area";
import type { ProductDocument } from "@/lib/firestore/products";
import { isOperationStationType } from "@/lib/operacion/operation-station-types";
import {
  inferTipoVentaFromCartaText,
  parseTipoVentaLoose,
  type PlatoCarta,
} from "@/lib/carta/product-sale-contract";
import type { Product } from "@/types/product";

/** Misma regla que gestión de productos / TPV: visible en carta si activo y en carta. */
export function publicationOnMenu(p: PlatoCarta): boolean {
  const raw = p as PlatoCarta & { enCarta?: boolean; isActive?: boolean };
  const isActive = typeof raw.isActive === "boolean" ? raw.isActive : true;
  if (!isActive) return false;
  const enCarta =
    typeof raw.enCarta === "boolean" ? raw.enCarta : raw.activo;
  return enCarta === true;
}

/** Regla de visibilidad para documentos del catálogo central. */
export function centralProductVisibleOnMenu(doc: ProductDocument): boolean {
  if (doc.active === false) return false;
  if (doc.visibleOnMenu === false) return false;
  return true;
}

/**
 * Ingrediente de stock (Inventario): materia prima para escandallos, no producto vendible.
 * Criterio fase 1: `type === "inventory"` (creado desde Inventario).
 * No usar solo `inventory.enabled`: en el futuro un plato vendible podría llevar inventario activo.
 */
export function isStockIngredientProduct(doc: ProductDocument): boolean {
  return doc.type === "inventory";
}

/** Catálogo central: escandallo activo si `recipe.enabled === true`. */
export function centralProductRecipeEscandalloEnabled(
  doc: Pick<ProductDocument, "recipe"> | null | undefined,
): boolean {
  return doc?.recipe?.enabled === true;
}

/**
 * ¿Tiene escandallo para la columna ESC / KPIs?
 * Central: prioriza snapshot Firestore (`centralDoc.recipe.enabled`), luego `plato.tieneEscandallo`.
 * Legacy: `plato.tieneEscandallo` o meta Supabase por `escandalloSupabaseId`.
 */
export function resolvePlatoTieneEscandallo(
  plato: PlatoCarta,
  meta: ReadonlyMap<number, { tieneEscandallo: boolean }>,
  centralDoc?: Pick<ProductDocument, "recipe"> | null,
): boolean {
  if (centralDoc && centralProductRecipeEscandalloEnabled(centralDoc)) {
    return true;
  }
  if (typeof plato.tieneEscandallo === "boolean") {
    return plato.tieneEscandallo;
  }
  const sid = plato.escandalloSupabaseId;
  if (sid == null) return false;
  return meta.get(sid)?.tieneEscandallo === true;
}

function msToIso(ms: number | undefined): string {
  if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) {
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

function resolveCategoryName(
  doc: ProductDocument,
  categoryNameById?: ReadonlyMap<string, string>,
): string {
  const fromDoc =
    typeof doc.categoryName === "string" ? doc.categoryName.trim() : "";
  if (fromDoc) return fromDoc;
  const cid = doc.categoryId?.trim();
  if (cid && categoryNameById?.has(cid)) {
    return categoryNameById.get(cid)!.trim() || "General";
  }
  return "";
}

export function centralProductToPlatoCarta(
  doc: ProductDocument,
  restaurantId: string,
  categoryNameById?: ReadonlyMap<string, string>,
): PlatoCarta {
  const rid = restaurantId.trim();
  const categoryName = resolveCategoryName(doc, categoryNameById);
  const nombre = doc.name.trim() || "Sin nombre";
  const tipoVenta =
    parseTipoVentaLoose(doc.tipoVenta) ??
    inferTipoVentaFromCartaText(categoryName, nombre);
  const preparationArea = mapStationToPreparationArea(
    doc.preparationArea ?? doc.station,
  );
  const precioVenta =
    typeof doc.price === "number" && Number.isFinite(doc.price) && doc.price >= 0
      ? doc.price
      : 0;
  const active = doc.active !== false;
  const visibleOnMenu = doc.visibleOnMenu !== false;
  const now = msToIso(doc.updatedAt ?? doc.createdAt);

  const recipeEnabled = centralProductRecipeEscandalloEnabled(doc);

  const plato: PlatoCarta & { isActive?: boolean; enCarta?: boolean } = {
    id: doc.id,
    restauranteId: rid,
    nombre,
    ...(preparationArea ? { preparationArea } : {}),
    ...(doc.operationStationId
      ? { operationStationId: doc.operationStationId }
      : {}),
    ...(doc.operationStationName
      ? { operationStationName: doc.operationStationName }
      : {}),
    ...(isOperationStationType(doc.operationStationType)
      ? { operationStationType: doc.operationStationType }
      : {}),
    tipoVenta,
    categoria: categoryName,
    ...(doc.categoryId ? { categoriaCartaId: doc.categoryId } : {}),
    ...(doc.productFamilyId ? { productFamilyId: doc.productFamilyId } : {}),
    ...(doc.productFamilyName ? { productFamilyName: doc.productFamilyName } : {}),
    ...(doc.productFamilyType ? { productFamilyType: doc.productFamilyType } : {}),
    ...(doc.modifierGroupIds?.length ? { modifierGroupIds: doc.modifierGroupIds } : {}),
    ...(doc.course !== undefined ? { course: doc.course } : {}),
    ...(doc.sortOrder !== undefined ? { sortOrder: doc.sortOrder } : {}),
    precioVenta,
    ...(doc.imageUrl?.trim() ? { fotoUrl: doc.imageUrl.trim() } : {}),
    activo: visibleOnMenu,
    enCarta: visibleOnMenu,
    tieneEscandallo: recipeEnabled,
    estadoCoste: recipeEnabled ? "ok" : "pendiente",
    escandalloSupabaseId: null,
    createdAt: msToIso(doc.createdAt),
    updatedAt: now,
  };
  if (!active) {
    plato.isActive = false;
    plato.activo = false;
  }
  return plato;
}

export function platoCartaToOperationalProduct(p: PlatoCarta): Product {
  const precio =
    typeof p.precioVenta === "number" && Number.isFinite(p.precioVenta)
      ? p.precioVenta
      : 0;
  const cat = typeof p.categoria === "string" ? p.categoria.trim() : "";
  const courseRaw = (p as PlatoCarta & { course?: unknown }).course;
  const course =
    courseRaw === null
      ? null
      : typeof courseRaw === "number" &&
          Number.isFinite(courseRaw) &&
          courseRaw >= 1 &&
          courseRaw <= 4
        ? Math.floor(courseRaw)
        : undefined;
  const preparationArea = p.preparationArea?.trim() || undefined;
  const station =
    mapPreparationAreaToStation(preparationArea ?? null) ?? undefined;
  return {
    id: p.id,
    nombre: p.nombre?.trim() ? p.nombre.trim() : "Sin nombre",
    categoria: cat || "Sin categoría",
    categoryId: p.categoriaCartaId,
    ...(p.productFamilyId ? { productFamilyId: p.productFamilyId } : {}),
    ...(p.productFamilyName ? { productFamilyName: p.productFamilyName } : {}),
    ...(p.productFamilyType ? { productFamilyType: p.productFamilyType } : {}),
    ...(p.modifierGroupIds?.length ? { modifierGroupIds: p.modifierGroupIds } : {}),
    ...(p.tipoVenta ? { tipoVenta: p.tipoVenta } : {}),
    precio,
    preparationArea,
    ...(station ? { station } : {}),
    ...(p.operationStationId ? { operationStationId: p.operationStationId } : {}),
    ...(p.operationStationName
      ? { operationStationName: p.operationStationName }
      : {}),
    ...(p.operationStationType ? { operationStationType: p.operationStationType } : {}),
    ...(course !== undefined ? { course } : {}),
    ...(p.sortOrder !== undefined ? { sortOrder: p.sortOrder } : {}),
    imageUrl:
      typeof p.fotoUrl === "string" && p.fotoUrl.trim() !== ""
        ? p.fotoUrl.trim()
        : undefined,
    restaurantId: p.restauranteId,
  };
}

export function centralProductsToPlatos(
  docs: ProductDocument[],
  restaurantId: string,
  categoryNameById?: ReadonlyMap<string, string>,
): PlatoCarta[] {
  return docs.map((d) =>
    centralProductToPlatoCarta(d, restaurantId, categoryNameById),
  );
}
