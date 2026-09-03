import { normalizeProductName } from "@/lib/carta/duplicate-detection";
import { mapStationToPreparationArea } from "@/lib/carta/map-station-to-preparation-area";
import type {
  CatalogMigrationBlockedItem,
  CatalogMigrationDuplicateItem,
  CatalogMigrationLegacyPlatoInput,
  CatalogMigrationMissingCategory,
  CatalogMigrationPreviewResult,
  CatalogMigrationToCreateItem,
  CatalogMigrationWarningEntry,
} from "@/lib/carta/catalog-migration-preview-types";
import type { CartaCategoria } from "@/lib/carta-categorias/types";
import { findCartaCategoriaByNameLoose } from "@/lib/modificadores/default-modifier-family";
import { categoryMatchKey, categoryNamesEquivalent } from "@/lib/server/menu-imports/normalize-category-name";
import { isValidPublishPrice } from "@/lib/server/menu-imports/evaluate-import-item-for-publish";
import { loadCentralProductsAdmin } from "@/lib/server/menu-imports/load-central-products-admin";
import { loadHostlyCartaCategories } from "@/lib/server/menu-imports/load-hostly-carta-categories";
import type { Firestore } from "firebase-admin/firestore";
import type { ProductDocument } from "@/lib/firestore/products";

export const MAX_LEGACY_PLATOS_MIGRATION_PREVIEW_SERVER = 400;

const KNOWN_PREPARATION_AREAS = new Set([
  "cocina",
  "barra",
  "cocteleria",
  "kitchen",
  "bar",
  "cocktail",
]);

export class BuildCatalogMigrationPreviewError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "BuildCatalogMigrationPreviewError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function sanitizeLegacyInput(raw: unknown): CatalogMigrationLegacyPlatoInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CatalogMigrationLegacyPlatoInput[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const nombre = typeof row.nombre === "string" ? row.nombre.trim() : "";
    const categoria =
      typeof row.categoria === "string" && row.categoria.trim()
        ? row.categoria.trim()
        : undefined;
    const categoriaCartaId =
      typeof row.categoriaCartaId === "string" && row.categoriaCartaId.trim()
        ? row.categoriaCartaId.trim()
        : undefined;
    const precioVenta =
      typeof row.precioVenta === "number" && Number.isFinite(row.precioVenta)
        ? row.precioVenta
        : undefined;
    const preparationArea =
      typeof row.preparationArea === "string" && row.preparationArea.trim()
        ? row.preparationArea.trim()
        : undefined;
    const tipoVenta =
      typeof row.tipoVenta === "string" && row.tipoVenta.trim()
        ? row.tipoVenta.trim()
        : undefined;
    const activo = row.activo !== false;

    out.push({
      id,
      nombre,
      ...(categoria ? { categoria } : {}),
      ...(categoriaCartaId ? { categoriaCartaId } : {}),
      ...(precioVenta !== undefined ? { precioVenta } : {}),
      ...(preparationArea ? { preparationArea } : {}),
      activo,
      ...(tipoVenta ? { tipoVenta } : {}),
    });

    if (out.length >= MAX_LEGACY_PLATOS_MIGRATION_PREVIEW_SERVER) break;
  }

  return out;
}

function resolveLegacyCategory(
  plato: CatalogMigrationLegacyPlatoInput,
  categories: CartaCategoria[],
  categoryById: Map<string, CartaCategoria>,
): { categoryId: string | null; categoryName: string; missing: boolean } {
  const cid = plato.categoriaCartaId?.trim();
  if (cid && categoryById.has(cid)) {
    const cat = categoryById.get(cid)!;
    return { categoryId: cat.id, categoryName: cat.name, missing: false };
  }

  const text = (plato.categoria ?? "").trim();
  if (text) {
    const loose = findCartaCategoriaByNameLoose(categories, text);
    if (loose) {
      return { categoryId: loose.id, categoryName: loose.name, missing: false };
    }
    return { categoryId: null, categoryName: text, missing: true };
  }

  return { categoryId: null, categoryName: "", missing: true };
}

function centralCategoryName(
  product: ProductDocument,
  categoryNameById: Map<string, string>,
): string {
  const denorm = product.categoryName?.trim();
  if (denorm) return denorm;
  const fromMap = product.categoryId
    ? categoryNameById.get(product.categoryId) ?? ""
    : "";
  return fromMap.trim() || "General";
}

function duplicateKey(name: string, categoryName: string): string {
  const n = normalizeProductName(name);
  const c = categoryMatchKey(categoryName || "General");
  return `${n}|${c}`;
}

function diceCoefficient(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function findCentralDuplicateMatch(
  plato: CatalogMigrationLegacyPlatoInput,
  categoryName: string,
  central: ProductDocument[],
  categoryNameById: Map<string, string>,
): CatalogMigrationDuplicateItem | null {
  const legacyNorm = normalizeProductName(plato.nombre);
  const legacyPrice =
    typeof plato.precioVenta === "number" && Number.isFinite(plato.precioVenta)
      ? plato.precioVenta
      : NaN;

  let best: CatalogMigrationDuplicateItem | null = null;

  for (const product of central) {
    const pCat = centralCategoryName(product, categoryNameById);
    const pNorm = normalizeProductName(product.name);
    const reasons: string[] = [];
    let score = 0;
    let reason: CatalogMigrationDuplicateItem["reason"] = "similar_match";

    if (product.id === plato.id) {
      return {
        legacyPlatoId: plato.id,
        name: plato.nombre,
        reason: "id_exists",
        existingProductId: product.id,
        existingProductName: product.name,
        matchScore: 1,
        details: ["id_exists"],
      };
    }

    const keyMatch =
      duplicateKey(plato.nombre, categoryName || plato.categoria || "") ===
      duplicateKey(product.name, pCat);
    if (keyMatch) {
      reasons.push("normalized_name_category");
      reason = "normalized_name_category";
      score = 0.95;
    } else if (pNorm === legacyNorm) {
      reasons.push("normalized_exact");
      score = Math.max(score, 0.92);
    } else {
      const sim = diceCoefficient(pNorm, legacyNorm);
      if (sim >= 0.88) {
        reasons.push("name_similar");
        score = Math.max(score, sim);
      }
    }

    const catOk =
      categoryNamesEquivalent(categoryName || plato.categoria || "", pCat) ||
      categoryMatchKey(categoryName || plato.categoria || "") === categoryMatchKey(pCat);
    const priceOk =
      Number.isFinite(legacyPrice) &&
      typeof product.price === "number" &&
      Number.isFinite(product.price) &&
      Math.abs(product.price - legacyPrice) <= 0.5;

    if (catOk && priceOk && reasons.length > 0) {
      reasons.push("category_price");
      score = Math.max(score, 0.78);
    }

    if (reasons.length === 0 || score < 0.72) continue;

    const candidate: CatalogMigrationDuplicateItem = {
      legacyPlatoId: plato.id,
      name: plato.nombre,
      reason,
      existingProductId: product.id,
      existingProductName: product.name,
      matchScore: Math.min(1, score),
      details: reasons,
    };

    if (!best || candidate.matchScore > best.matchScore) {
      best = candidate;
    }
  }

  if (best && best.matchScore >= 0.72) return best;
  return null;
}

function isUnknownPreparationArea(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const mapped = mapStationToPreparationArea(value);
  if (mapped) return false;
  const lower = value.trim().toLowerCase();
  return !KNOWN_PREPARATION_AREAS.has(lower);
}

export async function buildCatalogMigrationPreview(args: {
  db: Firestore;
  restaurantId: string;
  legacyPlatosRaw: unknown;
}): Promise<CatalogMigrationPreviewResult> {
  const restaurantId = args.restaurantId.trim();
  if (!restaurantId) {
    throw new BuildCatalogMigrationPreviewError(
      "NO_RESTAURANT",
      "Restaurante no válido",
      400,
    );
  }

  const legacyReceived = Array.isArray(args.legacyPlatosRaw)
    ? args.legacyPlatosRaw.length
    : 0;
  const legacyPlatos = sanitizeLegacyInput(args.legacyPlatosRaw);
  const legacyTruncated = Math.max(0, legacyReceived - legacyPlatos.length);

  if (legacyPlatos.length === 0) {
    throw new BuildCatalogMigrationPreviewError(
      "EMPTY_LEGACY",
      "No hay platos legacy para previsualizar",
      400,
    );
  }

  const [central, categories] = await Promise.all([
    loadCentralProductsAdmin(args.db, restaurantId),
    loadHostlyCartaCategories(args.db, restaurantId),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const centralById = new Map(central.map((p) => [p.id, p]));
  const centralByDupKey = new Map<string, ProductDocument>();
  for (const p of central) {
    const key = duplicateKey(p.name, centralCategoryName(p, categoryNameById));
    if (!centralByDupKey.has(key)) centralByDupKey.set(key, p);
  }

  const toCreate: CatalogMigrationToCreateItem[] = [];
  const duplicates: CatalogMigrationDuplicateItem[] = [];
  const blocked: CatalogMigrationBlockedItem[] = [];
  const warnings: CatalogMigrationWarningEntry[] = [];
  const missingCategoriesMap = new Map<string, Set<string>>();

  const pushWarning = (code: string, message: string, platoId: string) => {
    const existing = warnings.find((w) => w.code === code);
    if (existing) {
      if (!existing.legacyPlatoIds.includes(platoId)) {
        existing.legacyPlatoIds.push(platoId);
      }
      return;
    }
    warnings.push({ code, message, legacyPlatoIds: [platoId] });
  };

  for (const plato of legacyPlatos) {
    const name = plato.nombre.trim();
    if (!name) {
      blocked.push({
        legacyPlatoId: plato.id,
        name: "(sin nombre)",
        reasons: ["MISSING_NAME"],
      });
      continue;
    }

    const price = plato.precioVenta;
    if (price == null || !Number.isFinite(price)) {
      blocked.push({
        legacyPlatoId: plato.id,
        name,
        reasons: ["INVALID_PRICE"],
      });
      continue;
    }
    if (!isValidPublishPrice(price)) {
      blocked.push({
        legacyPlatoId: plato.id,
        name,
        reasons: price <= 0 ? ["PRICE_ZERO_OR_NEGATIVE"] : ["INVALID_PRICE"],
      });
      continue;
    }

    if (centralById.has(plato.id)) {
      const existing = centralById.get(plato.id)!;
      duplicates.push({
        legacyPlatoId: plato.id,
        name,
        reason: "id_exists",
        existingProductId: existing.id,
        existingProductName: existing.name,
        matchScore: 1,
        details: ["id_exists"],
      });
      continue;
    }

    const cat = resolveLegacyCategory(plato, categories, categoryById);
    if (cat.missing && cat.categoryName) {
      const set = missingCategoriesMap.get(cat.categoryName) ?? new Set<string>();
      set.add(plato.id);
      missingCategoriesMap.set(cat.categoryName, set);
      pushWarning(
        "CATEGORIA_INEXISTENTE",
        `Categoría no gestionada: ${cat.categoryName}`,
        plato.id,
      );
    } else if (cat.missing && !cat.categoryName) {
      blocked.push({
        legacyPlatoId: plato.id,
        name,
        reasons: ["MISSING_CATEGORY"],
      });
      continue;
    }

    const dupKey = duplicateKey(name, cat.categoryName || plato.categoria || "General");
    const keyed = centralByDupKey.get(dupKey);
    if (keyed) {
      duplicates.push({
        legacyPlatoId: plato.id,
        name,
        reason: "normalized_name_category",
        existingProductId: keyed.id,
        existingProductName: keyed.name,
        matchScore: 0.95,
        details: ["normalized_name_category"],
      });
      continue;
    }

    const fuzzyDup = findCentralDuplicateMatch(
      plato,
      cat.categoryName,
      central,
      categoryNameById,
    );
    if (fuzzyDup) {
      duplicates.push(fuzzyDup);
      continue;
    }

    const itemWarnings: string[] = [];
    if (cat.missing && cat.categoryName) {
      itemWarnings.push("CATEGORIA_INEXISTENTE");
    }
    if (isUnknownPreparationArea(plato.preparationArea)) {
      itemWarnings.push("UNKNOWN_PREPARATION_AREA");
      pushWarning(
        "UNKNOWN_PREPARATION_AREA",
        "Área de preparación no reconocida (se usará valor por defecto en migración)",
        plato.id,
      );
    }
    if (plato.activo === false) {
      itemWarnings.push("INACTIVE_LEGACY");
      pushWarning("INACTIVE_LEGACY", "Producto legacy inactivo", plato.id);
    }

    const preparationArea =
      mapStationToPreparationArea(plato.preparationArea) ??
      plato.preparationArea?.trim().toLowerCase() ??
      null;

    toCreate.push({
      legacyPlatoId: plato.id,
      name,
      categoryName: cat.categoryName || "General",
      categoryId: cat.categoryId,
      price,
      preparationArea,
      tipoVenta: plato.tipoVenta ?? null,
      legacyActivo: plato.activo !== false,
      warnings: itemWarnings,
    });
  }

  if (legacyTruncated > 0) {
    warnings.push({
      code: "LEGACY_TRUNCATED",
      message: `Solo se analizaron los primeros ${MAX_LEGACY_PLATOS_MIGRATION_PREVIEW_SERVER} platos legacy`,
      legacyPlatoIds: [],
    });
  }

  const missingCategories: CatalogMigrationMissingCategory[] = [
    ...missingCategoriesMap.entries(),
  ].map(([categoryName, ids]) => ({
    categoryName,
    legacyPlatoIds: [...ids],
  }));

  return {
    generatedAt: Date.now(),
    restaurantId,
    toCreate,
    duplicates,
    blocked,
    warnings,
    missingCategories,
    totals: {
      legacyReceived,
      legacyProcessed: legacyPlatos.length,
      legacyTruncated,
      toCreate: toCreate.length,
      duplicates: duplicates.length,
      blocked: blocked.length,
      warningsCount: warnings.length,
      missingCategoriesCount: missingCategories.length,
    },
  };
}
