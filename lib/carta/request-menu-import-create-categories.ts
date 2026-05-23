import { auth } from "@/lib/firebase/client";
import type { ImportedMenuSuggestedStation } from "@/lib/carta/imported-menu-types";
import type { CreateMenuImportCategoriesResult } from "@/lib/carta/create-categories-types";

export type CreateMenuImportCategoryRequest = {
  name: string;
  suggestedType?: "food" | "drink" | "general";
  suggestedStation?: ImportedMenuSuggestedStation;
};

export type RequestMenuImportCreateCategoriesResult =
  | { ok: true; result: CreateMenuImportCategoriesResult }
  | { ok: false; error: string; details?: string | null; httpStatus: number };

export async function requestMenuImportCreateCategories(
  draftId: string,
  categories: CreateMenuImportCategoryRequest[],
): Promise<RequestMenuImportCreateCategoriesResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para crear categorías",
      httpStatus: 401,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/menu-imports/create-categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ draftId, categories }),
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; details?: string | null; result?: CreateMenuImportCategoriesResult }
    | null;

  if (!res.ok || !payload?.ok || !payload.result) {
    return {
      ok: false,
      error: payload?.error ?? "CREATE_CATEGORIES_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }

  return { ok: true, result: payload.result };
}
