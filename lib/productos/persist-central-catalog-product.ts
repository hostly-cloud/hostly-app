import { doc, getDoc } from "firebase/firestore";
import {
  buildRecipeSourceFromDraftRows,
  normalizeProductRecipe,
  normalizedProductRecipeToWriteInput,
} from "@/lib/recipes/product-recipe-helpers";
import type { InventoryProductLookup } from "@/lib/recipes/product-recipe-types";
import type { RecipeIngredientDraftRow } from "@/components/productos/product-recipe-editor-section";
import { db } from "@/lib/firebase/client";
import {
  clearCentralProductImage,
  createCentralProduct,
  formatCentralCatalogWriteError,
  updateCentralProduct,
  updateCentralProductRecipe,
  uploadAndAttachCentralProductImage,
  type CentralOperationalProductInput,
} from "@/lib/firestore/products";

export type PersistCentralCatalogProductArgs = {
  restaurantId: string;
  editingId?: string | null;
  centralInput: CentralOperationalProductInput;
  recipeEnabled?: boolean;
  recipeRows?: readonly RecipeIngredientDraftRow[];
  saleProductIdForRecipe?: string;
  inventoryLookupMap: ReadonlyMap<string, InventoryProductLookup>;
  image?: {
    pendingFile?: File | null;
    remove?: boolean;
    existingPath?: string;
  };
};

export type PersistCentralCatalogProductResult =
  | {
      ok: true;
      productId: string;
      recipe: ReturnType<typeof normalizeProductRecipe>["recipe"];
    }
  | { ok: false; error: string };

async function readLatestCentralProductImagePath(
  restaurantId: string,
  productId: string,
): Promise<string | undefined> {
  const snap = await getDoc(
    doc(db, "restaurants", restaurantId, "products", productId),
  );
  if (!snap.exists()) return undefined;
  const data = snap.data() as Record<string, unknown>;
  const path = data.imagePath;
  return typeof path === "string" && path.trim() ? path.trim() : undefined;
}

/**
 * Persistencia central compartida (create/update + receta + imagen opcional).
 * Usada por formulario completo y alta rápida.
 */
export async function persistCentralCatalogProduct(
  args: PersistCentralCatalogProductArgs,
): Promise<PersistCentralCatalogProductResult> {
  const restauranteId = args.restaurantId.trim();
  if (!restauranteId) {
    return { ok: false, error: "MISSING_RESTAURANT_ID" };
  }

  const recipeEnabled = args.recipeEnabled ?? false;
  const recipeRows = args.recipeRows ?? [];
  const saleProductIdForRecipe = args.editingId?.trim() ?? args.saleProductIdForRecipe ?? "";

  const recipeValidation = normalizeProductRecipe(
    buildRecipeSourceFromDraftRows(recipeEnabled, [...recipeRows]),
    {
      saleProductId: saleProductIdForRecipe,
      inventoryProductsById: args.inventoryLookupMap,
    },
  );

  if (recipeValidation.errors.length > 0) {
    return {
      ok: false,
      error: recipeValidation.errors[0] ?? "Revisa el escandallo.",
    };
  }

  const draftRowsWithProductId = recipeRows.filter(
    (row) => row.productId.trim().length > 0,
  ).length;
  if (
    recipeEnabled &&
    draftRowsWithProductId > recipeValidation.recipe.ingredients.length
  ) {
    return {
      ok: false,
      error: "Algunos ingredientes del escandallo no tienen cantidad o unidad válida.",
    };
  }

  try {
    let savedProductId = args.editingId?.trim() ?? "";
    if (args.editingId?.trim()) {
      await updateCentralProduct(restauranteId, args.editingId.trim(), args.centralInput);
    } else {
      savedProductId = await createCentralProduct(restauranteId, args.centralInput);
    }

    await updateCentralProductRecipe(
      restauranteId,
      savedProductId,
      normalizedProductRecipeToWriteInput(recipeValidation.recipe),
    );

    const image = args.image;
    const changesImage = Boolean(
      image && (image.pendingFile || (image.remove && !image.pendingFile)),
    );
    const prevImagePath =
      changesImage && args.editingId?.trim()
        ? await readLatestCentralProductImagePath(restauranteId, savedProductId)
        : image?.existingPath;

    if (image?.remove && !image.pendingFile) {
      await clearCentralProductImage(restauranteId, savedProductId, prevImagePath);
    } else if (image?.pendingFile) {
      await uploadAndAttachCentralProductImage(
        restauranteId,
        savedProductId,
        image.pendingFile,
        prevImagePath,
      );
    }

    return {
      ok: true,
      productId: savedProductId,
      recipe: recipeValidation.recipe,
    };
  } catch (e) {
    return { ok: false, error: formatCentralCatalogWriteError(e) };
  }
}
