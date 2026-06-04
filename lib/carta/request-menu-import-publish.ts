import { auth } from "@/lib/firebase/client";
import type { MenuImportPublishResult } from "@/lib/carta/publish-result-types";

export type RequestMenuImportPublishResult =
  | { ok: true; result: MenuImportPublishResult }
  | { ok: false; error: string; details?: string | null; httpStatus: number };

export async function requestMenuImportPublish(
  draftId: string,
  options?: { itemIds?: string[]; confirmDuplicates?: string[]; confirmReviews?: string[] },
): Promise<RequestMenuImportPublishResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para publicar productos",
      httpStatus: 401,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/menu-imports/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      draftId,
      ...(options?.itemIds && options.itemIds.length > 0 ? { itemIds: options.itemIds } : {}),
      ...(options?.confirmDuplicates && options.confirmDuplicates.length > 0
        ? { confirmDuplicates: options.confirmDuplicates }
        : {}),
      ...(options?.confirmReviews && options.confirmReviews.length > 0
        ? { confirmReviews: options.confirmReviews }
        : {}),
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; error?: string; details?: string | null; result?: MenuImportPublishResult }
    | null;

  if (!res.ok || !payload?.ok || !payload.result) {
    return {
      ok: false,
      error: payload?.error ?? "PUBLISH_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }

  return { ok: true, result: payload.result };
}
