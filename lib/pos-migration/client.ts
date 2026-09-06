import { auth } from "@/lib/firebase/client";
import type {
  PosLayoutPreview,
  PosLayoutPublishResult,
  PosLayoutRollbackResult,
} from "./layout-types";
import type {
  PosMigrationPreview,
  PosMigrationPublishResult,
  PosMigrationRollbackResult,
} from "./types";

type ApiError = { ok: false; error: string; details?: string | null; httpStatus: number };

async function authToken(): Promise<string | null> {
  const user = auth.currentUser;
  return user ? user.getIdToken() : null;
}

async function parseApiPayload<T>(res: Response, resultKey: "preview" | "result"): Promise<{ ok: true; value: T } | ApiError> {
  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; preview?: T; result?: T; error?: string; details?: string | null }
    | null;
  const value = resultKey === "preview" ? payload?.preview : payload?.result;
  if (!res.ok || !payload?.ok || !value) {
    return {
      ok: false,
      error: payload?.error ?? "REQUEST_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }
  return { ok: true, value };
}

export async function requestPosMigrationPreview(
  file: File,
): Promise<{ ok: true; preview: PosMigrationPreview } | ApiError> {
  const token = await authToken();
  if (!token) return { ok: false, error: "UNAUTHORIZED", httpStatus: 401 };
  const formData = new FormData();
  formData.set("file", file);
  const res = await fetch("/api/pos-migrations/preview", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const parsed = await parseApiPayload<PosMigrationPreview>(res, "preview");
  return parsed.ok ? { ok: true, preview: parsed.value } : parsed;
}

export async function requestPosMigrationPublish(
  migrationId: string,
  confirmReviewItemIds: string[],
): Promise<{ ok: true; result: PosMigrationPublishResult } | ApiError> {
  const token = await authToken();
  if (!token) return { ok: false, error: "UNAUTHORIZED", httpStatus: 401 };
  const res = await fetch("/api/pos-migrations/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ migrationId, confirmReviewItemIds }),
  });
  const parsed = await parseApiPayload<PosMigrationPublishResult>(res, "result");
  return parsed.ok ? { ok: true, result: parsed.value } : parsed;
}

export async function requestPosMigrationRollback(
  migrationId: string,
): Promise<{ ok: true; result: PosMigrationRollbackResult } | ApiError> {
  const token = await authToken();
  if (!token) return { ok: false, error: "UNAUTHORIZED", httpStatus: 401 };
  const res = await fetch("/api/pos-migrations/rollback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ migrationId }),
  });
  const parsed = await parseApiPayload<PosMigrationRollbackResult>(res, "result");
  return parsed.ok ? { ok: true, result: parsed.value } : parsed;
}

export async function requestPosLayoutPreview(
  file: File,
): Promise<{ ok: true; preview: PosLayoutPreview } | ApiError> {
  const token = await authToken();
  if (!token) return { ok: false, error: "UNAUTHORIZED", httpStatus: 401 };
  const formData = new FormData();
  formData.set("file", file);
  const res = await fetch("/api/pos-migrations/layout/preview", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const parsed = await parseApiPayload<PosLayoutPreview>(res, "preview");
  return parsed.ok ? { ok: true, preview: parsed.value } : parsed;
}

export async function requestPosLayoutPublish(
  migrationId: string,
  confirmReviewItemIds: string[],
): Promise<{ ok: true; result: PosLayoutPublishResult } | ApiError> {
  const token = await authToken();
  if (!token) return { ok: false, error: "UNAUTHORIZED", httpStatus: 401 };
  const res = await fetch("/api/pos-migrations/layout/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ migrationId, confirmReviewItemIds }),
  });
  const parsed = await parseApiPayload<PosLayoutPublishResult>(res, "result");
  return parsed.ok ? { ok: true, result: parsed.value } : parsed;
}

export async function requestPosLayoutRollback(
  migrationId: string,
): Promise<{ ok: true; result: PosLayoutRollbackResult } | ApiError> {
  const token = await authToken();
  if (!token) return { ok: false, error: "UNAUTHORIZED", httpStatus: 401 };
  const res = await fetch("/api/pos-migrations/layout/rollback", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ migrationId }),
  });
  const parsed = await parseApiPayload<PosLayoutRollbackResult>(res, "result");
  return parsed.ok ? { ok: true, result: parsed.value } : parsed;
}
