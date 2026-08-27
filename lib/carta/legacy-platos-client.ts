"use client";

import { loadPlatos } from "@/lib/carta/legacy-platos-storage";
import type { PlatoCarta } from "@/lib/carta/product-sale-contract";
import type { CatalogMigrationLegacyPlatoInput } from "@/lib/carta/catalog-migration-preview-types";

/** Límite de platos legacy enviados al preview (evita payloads enormes). */
export const MAX_LEGACY_PLATOS_MIGRATION_PREVIEW = 400;

/**
 * Lee platos legacy del navegador (`hostly.platos.v1`) para el tenant actual.
 * Solo cliente; devuelve `null` si no hay restaurantId.
 */
export function readLegacyPlatosForRestaurant(
  restaurantId: string | null | undefined,
): PlatoCarta[] | null {
  const rid = typeof restaurantId === "string" ? restaurantId.trim() : "";
  if (!rid || typeof window === "undefined") return null;
  return loadPlatos(rid);
}

export function legacyPlatosToMigrationInput(
  platos: PlatoCarta[],
): CatalogMigrationLegacyPlatoInput[] {
  const capped = platos.slice(0, MAX_LEGACY_PLATOS_MIGRATION_PREVIEW);
  return capped.map((p) => ({
    id: p.id,
    nombre: typeof p.nombre === "string" ? p.nombre : "",
    ...(typeof p.categoria === "string" && p.categoria.trim()
      ? { categoria: p.categoria.trim() }
      : {}),
    ...(p.categoriaCartaId?.trim() ? { categoriaCartaId: p.categoriaCartaId.trim() } : {}),
    ...(typeof p.precioVenta === "number" && Number.isFinite(p.precioVenta)
      ? { precioVenta: p.precioVenta }
      : {}),
    ...(p.preparationArea?.trim() ? { preparationArea: p.preparationArea.trim() } : {}),
    activo: p.activo !== false,
    ...(typeof p.tipoVenta === "string" ? { tipoVenta: p.tipoVenta } : {}),
  }));
}

export function countLegacyPlatosForRestaurant(restaurantId: string | null | undefined): number {
  const list = readLegacyPlatosForRestaurant(restaurantId);
  return list?.length ?? 0;
}
