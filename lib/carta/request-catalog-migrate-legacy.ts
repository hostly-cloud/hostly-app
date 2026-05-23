import { auth } from "@/lib/firebase/client";
import type {
  CatalogMigrationExecuteResult,
  CatalogMigrationLegacyPlatoInput,
} from "@/lib/carta/catalog-migration-preview-types";

export type RequestCatalogMigrateLegacyResult =
  | { ok: true; result: CatalogMigrationExecuteResult }
  | { ok: false; error: string; details?: string | null; httpStatus: number };

export async function requestCatalogMigrateLegacy(
  legacyPlatos: CatalogMigrationLegacyPlatoInput[],
  previewId?: string,
): Promise<RequestCatalogMigrateLegacyResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para migrar el catálogo",
      httpStatus: 401,
    };
  }

  if (!Array.isArray(legacyPlatos) || legacyPlatos.length === 0) {
    return {
      ok: false,
      error: "EMPTY_LEGACY",
      details: "No hay platos legacy para migrar",
      httpStatus: 400,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/catalog/migrate-legacy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      legacyPlatos,
      ...(previewId?.trim() ? { previewId: previewId.trim() } : {}),
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        details?: string | null;
        result?: CatalogMigrationExecuteResult;
      }
    | null;

  if (!res.ok || !payload?.ok || !payload.result) {
    return {
      ok: false,
      error: payload?.error ?? "MIGRATE_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }

  return { ok: true, result: payload.result };
}
