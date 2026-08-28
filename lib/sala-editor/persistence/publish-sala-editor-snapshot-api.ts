import { auth } from "@/lib/firebase/client";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export type SalaEditorPublishedSnapshotResponse = {
  publishedAt: number;
  sourceDraftUpdatedAt: number | null;
  schemaVersion: string;
  snapshotVersion: number;
};

export async function publishSalaEditorSnapshotApi(params: {
  document: SalaEditorDocument;
  sourceDraftUpdatedAt?: number | null;
}): Promise<SalaEditorPublishedSnapshotResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("No hay una sesión autenticada para publicar el mapa.");
  }

  const token = await user.getIdToken();
  const response = await fetch("/api/sala-editor/publish-snapshot", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      document: params.document,
      sourceDraftUpdatedAt: params.sourceDraftUpdatedAt ?? params.document.updatedAt,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        ok?: unknown;
        error?: unknown;
        details?: unknown;
        publishedAt?: unknown;
        sourceDraftUpdatedAt?: unknown;
        schemaVersion?: unknown;
        snapshotVersion?: unknown;
      }
    | null;

  if (!response.ok || payload?.ok !== true) {
    const details =
      typeof payload?.details === "string" && payload.details.trim()
        ? payload.details.trim()
        : typeof payload?.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : `HTTP ${response.status}`;
    throw new Error(`No se pudo crear el snapshot publicado: ${details}`);
  }

  if (
    typeof payload.publishedAt !== "number" ||
    !Number.isFinite(payload.publishedAt) ||
    typeof payload.snapshotVersion !== "number" ||
    !Number.isFinite(payload.snapshotVersion) ||
    typeof payload.schemaVersion !== "string"
  ) {
    throw new Error("El servidor devolvió una respuesta de publicación incompleta.");
  }

  return {
    publishedAt: payload.publishedAt,
    sourceDraftUpdatedAt:
      typeof payload.sourceDraftUpdatedAt === "number" &&
      Number.isFinite(payload.sourceDraftUpdatedAt)
        ? payload.sourceDraftUpdatedAt
        : null,
    schemaVersion: payload.schemaVersion,
    snapshotVersion: payload.snapshotVersion,
  };
}
