import { auth } from "@/lib/firebase/client";
import type { ProcessPendingPrintJobsResult } from "@/lib/printing/print-worker-types";

export type RequestProcessPendingPrintJobsResult =
  | { ok: true; summary: ProcessPendingPrintJobsResult }
  | { ok: false; error: string; details?: string | null; httpStatus: number };

export async function requestProcessPendingPrintJobs(options?: {
  dryRun?: boolean;
  maxJobs?: number;
}): Promise<RequestProcessPendingPrintJobsResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para procesar la cola",
      httpStatus: 401,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/printing/process-pending", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      dryRun: options?.dryRun === true,
      ...(typeof options?.maxJobs === "number" && Number.isFinite(options.maxJobs)
        ? { maxJobs: Math.floor(options.maxJobs) }
        : {}),
    }),
  });

  const payload = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        details?: string | null;
        summary?: ProcessPendingPrintJobsResult;
      }
    | null;

  if (!res.ok || !payload?.ok || !payload.summary) {
    return {
      ok: false,
      error: payload?.error ?? "PROCESS_PENDING_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }

  return { ok: true, summary: payload.summary };
}
