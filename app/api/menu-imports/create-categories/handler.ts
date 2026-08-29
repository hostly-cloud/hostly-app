import { NextResponse } from "next/server";
import type { CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type { CreateMenuImportCategoryInput } from "@/lib/server/menu-imports/create-menu-import-categories";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

export type CreateCategoriesRouteDependencies = AuthenticatedRestaurantDependencies & {
  createCategories?: typeof import("@/lib/server/menu-imports/create-menu-import-categories")["createMenuImportCategories"];
};

function readCategoryInput(raw: unknown): CreateMenuImportCategoryInput | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const name = typeof rec.name === "string" ? rec.name.trim() : "";
  if (!name) return null;

  const suggestedType =
    rec.suggestedType === "food" || rec.suggestedType === "drink" || rec.suggestedType === "general"
      ? (rec.suggestedType as CartaCategoriaTipo)
      : undefined;

  const suggestedStation =
    rec.suggestedStation === "kitchen" ||
    rec.suggestedStation === "bar" ||
    rec.suggestedStation === "cocktail" ||
    rec.suggestedStation === "none"
      ? rec.suggestedStation
      : undefined;

  return { name, suggestedType, suggestedStation };
}

export async function handleCreateMenuImportCategoriesRequest(
  req: Request,
  dependencies?: CreateCategoriesRouteDependencies,
) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }
    if (!serverRoleHasCapability(authCtx.role, "settings.manage")) {
      return jsonError(403, "SETTINGS_MANAGE_REQUIRED");
    }

    const body = (await req.json().catch(() => null)) as {
      draftId?: string;
      categories?: unknown;
    } | null;

    if (!body || typeof body !== "object") {
      return jsonError(400, "INVALID_JSON");
    }

    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    if (!draftId) {
      return jsonError(400, "MISSING_DRAFT_ID", "Envía { draftId, categories[] }");
    }

    const categoriesRaw = Array.isArray(body.categories) ? body.categories : [];
    const categories = categoriesRaw
      .map(readCategoryInput)
      .filter((c): c is CreateMenuImportCategoryInput => c != null);

    if (categories.length === 0) {
      return jsonError(400, "MISSING_CATEGORIES", "Ninguna categoría válida en la solicitud");
    }

    const createCategories =
      dependencies?.createCategories ??
      (
        await import("@/lib/server/menu-imports/create-menu-import-categories")
      ).createMenuImportCategories;
    const result = await createCategories({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      draftId,
      userId: authCtx.uid,
      categories,
    });

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "name" in e &&
      e.name === "CreateMenuImportCategoriesError" &&
      "httpStatus" in e &&
      typeof e.httpStatus === "number" &&
      "code" in e &&
      typeof e.code === "string"
    ) {
      return jsonError(e.httpStatus, e.code);
    }
    console.error("[api/menu-imports/create-categories]", {
      code: "CREATE_CATEGORIES_FAILED",
    });
    return jsonError(500, "CREATE_CATEGORIES_FAILED");
  }
}

export async function POST(req: Request) {
  return handleCreateMenuImportCategoriesRequest(req);
}
