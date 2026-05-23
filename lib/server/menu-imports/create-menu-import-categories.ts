import {
  buildCategoryProductFamilyFields,
  resolveProductFamilyForCategoryType,
} from "@/lib/carta/category-product-family";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { slugifyCartaCategoria } from "@/lib/carta-categorias/slug";
import type { ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";
import type { Firestore } from "firebase-admin/firestore";
import {
  categoryMatchKey,
  categoryNamesEquivalent,
  inferCategoryTypeFromName,
  normalizeCategoryName,
} from "./normalize-category-name";
import type {
  CreateMenuImportCategoriesResult,
  CreateMenuImportCategoriesSkipped,
  CreateMenuImportCategoryResultItem,
} from "@/lib/carta/create-categories-types";
import { getMenuImportDraftAdmin } from "./menu-import-draft-admin";
import { loadHostlyCartaCategories } from "./load-hostly-carta-categories";
import { loadHostlyProductFamilies } from "./load-hostly-product-families";

export class CreateMenuImportCategoriesError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(code: string, message: string, httpStatus: number) {
    super(message);
    this.name = "CreateMenuImportCategoriesError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type CreateMenuImportCategoryInput = {
  name: string;
  suggestedType?: CartaCategoriaTipo;
  suggestedStation?: ImportedMenuSuggestedStation;
};

export type { CreateMenuImportCategoriesResult } from "@/lib/carta/create-categories-types";

function findExistingCategory(
  categories: CartaCategoria[],
  name: string,
): CartaCategoria | undefined {
  return categories.find((c) => categoryNamesEquivalent(c.name, name));
}

function readCategoryType(raw: unknown): CartaCategoriaTipo | undefined {
  if (raw === "food" || raw === "drink" || raw === "general") return raw;
  return undefined;
}

function readStation(raw: unknown): ImportedMenuSuggestedStation | undefined {
  if (raw === "kitchen" || raw === "bar" || raw === "cocktail" || raw === "none") return raw;
  return undefined;
}

async function getNextSortOrder(
  db: Firestore,
  restaurantId: string,
): Promise<number> {
  const coll = db.collection("restaurantes").doc(restaurantId).collection("cartaCategorias");
  const agg = await coll.orderBy("sortOrder", "desc").limit(1).get();
  const top = agg.docs[0]?.data()?.sortOrder;
  return (typeof top === "number" && Number.isFinite(top) ? top : -1) + 1;
}

export async function createMenuImportCategories(params: {
  db: Firestore;
  restaurantId: string;
  draftId: string;
  userId: string;
  categories: CreateMenuImportCategoryInput[];
}): Promise<CreateMenuImportCategoriesResult> {
  const { db, restaurantId, userId } = params;
  const draftId = params.draftId.trim();
  if (!draftId) {
    throw new CreateMenuImportCategoriesError("INVALID_DRAFT_ID", "draftId obligatorio", 400);
  }

  if (!Array.isArray(params.categories) || params.categories.length === 0) {
    throw new CreateMenuImportCategoriesError(
      "MISSING_CATEGORIES",
      "Envía al menos una categoría",
      400,
    );
  }

  const draft = await getMenuImportDraftAdmin(db, restaurantId, draftId);
  if (!draft) {
    throw new CreateMenuImportCategoriesError("DRAFT_NOT_FOUND", "Borrador no encontrado", 404);
  }
  if (draft.restaurantId !== restaurantId.trim()) {
    throw new CreateMenuImportCategoriesError("TENANT_MISMATCH", "Borrador fuera del tenant", 403);
  }

  let existing = await loadHostlyCartaCategories(db, restaurantId);
  const productFamilies = await loadHostlyProductFamilies(db, restaurantId, {
    ensureDefaults: true,
    userId,
  });
  const created: CreateMenuImportCategoryResultItem[] = [];
  const reused: CreateMenuImportCategoryResultItem[] = [];
  const skipped: CreateMenuImportCategoriesSkipped[] = [];
  const seenKeys = new Set<string>();

  let sortOrder = await getNextSortOrder(db, restaurantId);
  const now = new Date().toISOString();
  const coll = db.collection("restaurantes").doc(restaurantId.trim()).collection("cartaCategorias");

  for (const raw of params.categories) {
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name || name.length < 2) {
      skipped.push({ inputName: raw.name ?? "", reason: "Nombre vacío o demasiado corto" });
      continue;
    }
    if (name.length > 80) {
      skipped.push({ inputName: name, reason: "Nombre demasiado largo" });
      continue;
    }

    const matchKey = categoryMatchKey(name);
    if (seenKeys.has(matchKey)) {
      skipped.push({ inputName: name, reason: "Duplicado en la solicitud" });
      continue;
    }
    seenKeys.add(matchKey);

    const found = findExistingCategory(existing, name);
    if (found) {
      reused.push({
        inputName: name,
        normalizedName: normalizeCategoryName(found.name),
        categoryId: found.id,
        categoryName: found.name,
        outcome: "reused_existing",
      });
      continue;
    }

    const type = readCategoryType(raw.suggestedType) ?? inferCategoryTypeFromName(name);
    const station = readStation(raw.suggestedStation);
    const inferredFamily = resolveProductFamilyForCategoryType(
      productFamilies,
      type,
    );
    const familyFields = buildCategoryProductFamilyFields(inferredFamily);
    const ref = coll.doc();
    const id = ref.id;
    const slug = `${slugifyCartaCategoria(name)}-${id.slice(0, 8)}`;

    const payload: Record<string, unknown> = {
      restaurantId: restaurantId.trim(),
      name,
      normalizedName: normalizeCategoryName(name),
      slug,
      type,
      ...familyFields,
      sortOrder,
      isActive: true,
      importedByAI: true,
      source: "menu_import",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };
    if (station && station !== "none") {
      payload.suggestedStation = station;
    }

    await ref.set(payload);
    sortOrder += 1;

    const newCat: CartaCategoria = {
      id,
      restauranteId: restaurantId.trim(),
      name,
      slug,
      type,
      ...(familyFields.productFamilyId
        ? {
            productFamilyId: familyFields.productFamilyId,
            productFamilyName: familyFields.productFamilyName,
            productFamilyType: familyFields.productFamilyType,
          }
        : {}),
      sortOrder: payload.sortOrder as number,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    existing = [...existing, newCat];

    created.push({
      inputName: name,
      normalizedName: normalizeCategoryName(name),
      categoryId: id,
      categoryName: name,
      outcome: "created",
    });
  }

  return {
    draftId,
    created,
    reused,
    skipped,
    totals: {
      createdCount: created.length,
      reusedCount: reused.length,
      skippedCount: skipped.length,
    },
  };
}
