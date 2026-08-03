import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthorizedTpvRestaurant,
} from "@/lib/server/tpv/require-authorized-tpv-restaurant";
import {
  handleCompleteReleaseEffect,
  type ReleaseSideEffect,
} from "@/lib/server/tpv/handle-claim-release-effect";
import {
  tpvMutationJsonError,
  tpvMutationJsonOk,
  isTpvMutationError,
} from "@/lib/server/tpv/tpv-mutation-response";

export async function POST(req: Request) {
  const authCtx = await requireAuthorizedTpvRestaurant(req);
  if (isAuthErrorResponse(authCtx)) return authCtx;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  if ("restaurantId" in body && body.restaurantId != null) {
    return NextResponse.json({ ok: false, error: "RESTAURANT_ID_NOT_ALLOWED" }, { status: 400 });
  }

  const releaseEventId =
    typeof body.releaseEventId === "string" ? body.releaseEventId.trim() : "";
  const effectRaw = typeof body.effect === "string" ? body.effect.trim() : "";
  const effect = effectRaw as ReleaseSideEffect;
  const leaseOwner =
    typeof body.leaseOwner === "string" ? body.leaseOwner.trim() : "";

  const result = await handleCompleteReleaseEffect(authCtx, {
    releaseEventId,
    effect,
    leaseOwner,
  });
  if (isTpvMutationError(result)) return tpvMutationJsonError(result);
  return tpvMutationJsonOk(result);
}
