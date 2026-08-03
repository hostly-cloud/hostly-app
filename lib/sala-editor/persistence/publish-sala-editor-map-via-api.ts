import { authenticatedApiFetch } from "@/lib/auth/authenticated-api-fetch";

export type PublishSalaEditorMapClientResult =
  | {
      ok: true;
      publishedAt: number;
      floorPlanIds: string[];
      tableIds: string[];
    }
  | { ok: false; error: string; details?: string | null };

export async function publishSalaEditorMapViaApi(): Promise<PublishSalaEditorMapClientResult> {
  const response = await authenticatedApiFetch("/api/sala-editor/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    details?: string | null;
    result?: {
      publishedAt?: number;
      floorPlanIds?: string[];
      tableIds?: string[];
    };
  } | null;

  if (!response.ok || !payload?.ok || !payload.result) {
    return {
      ok: false,
      error: payload?.error ?? "PUBLISH_FAILED",
      details: payload?.details ?? null,
    };
  }

  return {
    ok: true,
    publishedAt: payload.result.publishedAt ?? Date.now(),
    floorPlanIds: payload.result.floorPlanIds ?? [],
    tableIds: payload.result.tableIds ?? [],
  };
}
