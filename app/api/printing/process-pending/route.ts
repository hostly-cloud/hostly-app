import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { processPendingPrintJobs } from "@/lib/server/printing/process-print-jobs";

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json(
    { ok: false, error, details: details ?? null },
    { status },
  );
}

export async function POST(req: Request) {
  try {
    const authCtx = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(authCtx)) {
      return authCtx;
    }

    const body = (await req.json().catch(() => null)) as {
      dryRun?: unknown;
      maxJobs?: unknown;
      restaurantId?: unknown;
    } | null;

    if (body && typeof body === "object" && body.restaurantId != null) {
      return jsonError(
        400,
        "RESTAURANT_ID_NOT_ALLOWED",
        "restaurantId se resuelve en servidor",
      );
    }

    const dryRun = body?.dryRun === true;
    const maxJobs =
      typeof body?.maxJobs === "number" && Number.isFinite(body.maxJobs)
        ? body.maxJobs
        : undefined;

    const summary = await processPendingPrintJobs({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      dryRun,
      maxJobs,
    });

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PROCESS_PENDING_FAILED";
    console.error("[api/printing/process-pending]", message, e);
    return jsonError(500, "PROCESS_PENDING_FAILED", message);
  }
}
