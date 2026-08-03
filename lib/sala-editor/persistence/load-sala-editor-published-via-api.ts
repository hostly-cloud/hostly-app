import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";
import type { SalaEditorPublishedDocument } from "@/lib/sala-editor/persistence/sala-editor-published-types";
import type { TpvMapSource } from "@/lib/sala-editor/persistence/sala-editor-published-types";

export type LoadSalaEditorPublishedClientResult = {
  source: TpvMapSource;
  published: SalaEditorPublishedDocument | null;
};

/**
 * Carga published vía Admin API (no lee draft).
 */
export async function loadSalaEditorPublishedViaApi(): Promise<LoadSalaEditorPublishedClientResult> {
  try {
    const response = await authenticatedApiFetch("/api/sala-editor/published", {
      method: "GET",
    });
    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      source?: TpvMapSource;
      published?: SalaEditorPublishedDocument | null;
    } | null;

    if (!response.ok || !payload?.ok) {
      return { source: "legacy-fallback", published: null };
    }

    const source = payload.source === "v2-published" ? "v2-published" : "legacy-fallback";
    return {
      source,
      published: source === "v2-published" ? payload.published ?? null : null,
    };
  } catch {
    return { source: "legacy-fallback", published: null };
  }
}
