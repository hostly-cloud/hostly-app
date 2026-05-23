import { auth } from "@/lib/firebase/client";
import type {
  CatalogMigrationLegacyPlatoInput,
  CatalogMigrationPreviewResult,
} from "@/lib/carta/catalog-migration-preview-types";

export type RequestCatalogMigrationPreviewResult =
  | { ok: true; preview: CatalogMigrationPreviewResult }
  | { ok: false; error: string; details?: string | null; httpStatus: number };

export async function requestCatalogMigrationPreview(
  legacyPlatos: CatalogMigrationLegacyPlatoInput[],
): Promise<RequestCatalogMigrationPreviewResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para previsualizar la migración",
      httpStatus: 401,
    };
  }

  if (!Array.isArray(legacyPlatos) || legacyPlatos.length === 0) {
    return {
      ok: false,
      error: "EMPTY_LEGACY",
      details: "No hay platos legacy para analizar",
      httpStatus: 400,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/catalog/migration-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ legacyPlatos }),
  });

  const payload = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        details?: string | null;
        preview?: CatalogMigrationPreviewResult;
      }
    | null;

  if (!res.ok || !payload?.ok || !payload.preview) {
    return {
      ok: false,
      error: payload?.error ?? "PREVIEW_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }

  return { ok: true, preview: payload.preview };
}
