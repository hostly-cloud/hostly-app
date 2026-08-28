import { auth } from "@/lib/firebase/client";
import {
  assertSalaEditorPublishedRestaurantId,
  parseSalaEditorPublishedDocument,
  type SalaEditorPublishedDocument,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";

/**
 * Loader cliente de solo lectura para el snapshot V2 publicado.
 *
 * `published` no se lee directamente desde Firestore. El navegador presenta su
 * ID token y el servidor resuelve el tenant desde el perfil autorizado antes de
 * leer con Firebase Admin. De este modo no necesitamos abrir Rules para el
 * snapshot operativo y nunca confiamos en un restaurantId enviado por cliente.
 */
export async function loadSalaEditorPublished(
  restaurantId: string,
): Promise<SalaEditorPublishedDocument | null> {
  const rid = assertSalaEditorPublishedRestaurantId(restaurantId);
  const user = auth.currentUser;
  if (!user) {
    throw new Error("sala-editor-published: sesión no disponible");
  }

  const token = await user.getIdToken();
  const response = await fetch("/api/sala-editor/publish-snapshot", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (response.status === 404) return null;

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: unknown;
        error?: unknown;
        details?: unknown;
        published?: unknown;
      }
    | null;

  if (!response.ok || payload?.ok !== true) {
    const details =
      typeof payload?.details === "string" && payload.details.trim()
        ? payload.details.trim()
        : typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : `HTTP ${response.status}`;
    throw new Error(`sala-editor-published: ${details}`);
  }

  return parseSalaEditorPublishedDocument(payload.published, rid);
}

export type { SalaEditorPublishedDocument } from "@/lib/sala-editor/persistence/sala-editor-published-contract";
export {
  SALA_EDITOR_PUBLISHED_SNAPSHOT_VERSION,
  buildSalaEditorPublishedPayload,
} from "@/lib/sala-editor/persistence/sala-editor-published-contract";
