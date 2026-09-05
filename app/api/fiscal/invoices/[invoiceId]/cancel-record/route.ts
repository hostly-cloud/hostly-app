import { NextResponse } from "next/server";
import { enqueueFiscalRecord } from "@/lib/server/fiscal/fiscal-outbox-queue";
import { issueFiscalCancellationInTransaction } from "@/lib/server/fiscal/issue-fiscal-invoice";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";

export async function POST(req: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.cancel")) {
    return NextResponse.json({ ok: false, error: "FISCAL_CANCEL_REQUIRED" }, { status: 403 });
  }
  const { invoiceId } = await context.params;
  const body = await req.json().catch(() => null) as { confirmation?: unknown; reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (body?.confirmation !== "ANULAR REGISTRO FISCAL" || reason.length < 5) {
    return NextResponse.json({ ok: false, error: "FISCAL_CANCELLATION_CONFIRMATION_REQUIRED" }, { status: 400 });
  }
  try {
    let result: Awaited<ReturnType<typeof issueFiscalCancellationInTransaction>> | null = null;
    await ctx.db.runTransaction(async (tx) => {
      result = await issueFiscalCancellationInTransaction({ db: ctx.db, tx, restaurantId: ctx.restaurantId, actorUid: ctx.uid, invoiceId, issuedAt: new Date(), reason });
    });
    if (!result) throw new Error("FISCAL_CANCELLATION_FAILED");
    await enqueueFiscalRecord((result as { recordId: string }).recordId).catch(() => undefined);
    return NextResponse.json({ ok: true, cancellation: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FISCAL_CANCELLATION_FAILED";
    return NextResponse.json({ ok: false, error: code }, { status: code.includes("NOT_FOUND") ? 404 : 409 });
  }
}
