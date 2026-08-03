import type { ImportedMenuItem } from "@/lib/carta/imported-menu-types";
import { auth } from "@/lib/firebase/client";

export async function requestMenuImportReviewUpdate(
  draftId: string,
  items: ImportedMenuItem[],
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("UNAUTHORIZED");
  const token = await user.getIdToken();
  const response = await fetch("/api/menu-imports/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      draftId,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        price: item.price ?? null,
        suggestedCategory: item.suggestedCategory,
        suggestedStation: item.suggestedStation,
        selectedForPublish: item.selectedForPublish,
      })),
    }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error ?? "REVIEW_UPDATE_FAILED");
  }
}
