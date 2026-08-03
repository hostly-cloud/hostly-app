import { NextResponse } from "next/server";
import type { TpvMutationError } from "@/lib/server/tpv/handle-tpv-order-mutations";

export function tpvMutationJsonError(err: TpvMutationError) {
  return NextResponse.json(
    { ok: false, error: err.error, details: err.details ?? null },
    { status: err.status },
  );
}

export function tpvMutationJsonOk<T extends Record<string, unknown>>(payload: T) {
  return NextResponse.json({ ok: true, ...payload });
}

export function isTpvMutationError(
  value: unknown,
): value is TpvMutationError {
  return (
    value != null &&
    typeof value === "object" &&
    "status" in value &&
    "error" in value &&
    typeof (value as TpvMutationError).status === "number"
  );
}
