import { auth } from "@/lib/firebase/client";
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
  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; preview?: PosMigrationPreview; error?: string; details?: string | null }
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
  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: PosMigrationPublishResult; error?: string; details?: string | null }
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
  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; result?: PosMigrationRollbackResult; error?: string; details?: string | null }
    | null;
  if (!res.ok || !payload?.ok || !payload.result) {
    return {
      ok: false,
      error: payload?.error ?? "ROLLBACK_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }
  return { ok: true, result: payload.result };
}
