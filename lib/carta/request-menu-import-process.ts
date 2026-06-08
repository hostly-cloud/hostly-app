import { auth } from "@/lib/firebase/client";
import type { MenuImportDebugReport } from "@/lib/carta/menu-import-debug-report-types";
import type { MenuImportOperationalWarning } from "@/lib/carta/menu-import-operational-warnings-types";

export type RequestMenuImportProcessResult =
  | {
      ok: true;
      draftId: string;
      status: string;
      alreadyProcessed: boolean;
      itemCount: number;
      debugReport?: MenuImportDebugReport;
      operationalWarnings?: MenuImportOperationalWarning[];
    }
  | {
      ok: false;
      error: string;
      details?: string | null;
      httpStatus: number;
    };

export async function requestMenuImportProcess(draftId: string): Promise<RequestMenuImportProcessResult> {
  const user = auth.currentUser;
  if (!user) {
    return {
      ok: false,
      error: "UNAUTHORIZED",
      details: "Inicia sesión para procesar la carta",
      httpStatus: 401,
    };
  }

  const token = await user.getIdToken();
  const res = await fetch("/api/menu-imports/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ draftId }),
  });

  const payload = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        error?: string;
        details?: string | null;
        draftId?: string;
        status?: string;
        alreadyProcessed?: boolean;
        itemCount?: number;
        debugReport?: MenuImportDebugReport;
        operationalWarnings?: MenuImportOperationalWarning[];
      }
    | null;

  if (!res.ok || !payload?.ok) {
    return {
      ok: false,
      error: payload?.error ?? "PROCESS_FAILED",
      details: payload?.details ?? null,
      httpStatus: res.status,
    };
  }

  return {
    ok: true,
    draftId: payload.draftId ?? draftId,
    status: payload.status ?? "ready",
    alreadyProcessed: payload.alreadyProcessed === true,
    itemCount: typeof payload.itemCount === "number" ? payload.itemCount : 0,
    debugReport: payload.debugReport,
    operationalWarnings: Array.isArray(payload.operationalWarnings)
      ? payload.operationalWarnings
      : undefined,
  };
}
