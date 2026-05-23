import { auth } from "@/lib/firebase/client";
import type { PublishPreviewResult } from "@/lib/carta/publish-preview-types";

export type RequestMenuImportPublishPreviewResult =
  | { ok: true; preview: PublishPreviewResult }
  | { ok: false; error: string; details?: string | null; httpStatus: number };

export async function requestMenuImportPublishPreview(
  draftId: string,
  itemIds?: string[],
): Promise<RequestMenuImportPublishPreviewResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para previsualizar la publicación",
      httpStatus: 401,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/menu-imports/publish-preview", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      draftId,
      ...(itemIds && itemIds.length > 0 ? { itemIds } : {}),
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; details?: string | null; preview?: PublishPreviewResult }
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
