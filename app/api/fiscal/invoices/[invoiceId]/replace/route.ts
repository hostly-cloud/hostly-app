import { NextResponse } from "next/server";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";
import { enqueueFiscalRecord } from "@/lib/server/fiscal/fiscal-outbox-queue";
import { issueFiscalReplacementInTransaction } from "@/lib/server/fiscal/issue-fiscal-invoice";
import type { PaymentInvoiceIntent } from "@/lib/server/tpv/tpv-mutation-dtos";

function readCustomer(value: unknown): PaymentInvoiceIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const text = (key: string) => typeof row[key] === "string" ? row[key].trim() : "";
  return {
    name: text("name"),
    taxId: text("taxId"),
    email: text("email"),
    address: text("address"),
    postalCode: text("postalCode"),
    city: text("city"),
    province: text("province"),
    countryCode: text("countryCode") || "ES",
  };
}

export async function POST(req: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.issue")) {
    return NextResponse.json({ ok: false, error: "FISCAL_ISSUE_REQUIRED" }, { status: 403 });
  }
  const { invoiceId } = await context.params;
  const body = await req.json().catch(() => null) as { confirmation?: unknown; customer?: unknown } | null;
  const customer = readCustomer(body?.customer);
  if (body?.confirmation !== "SUSTITUIR FACTURA SIMPLIFICADA" || !customer) {
    return NextResponse.json({ ok: false, error: "FISCAL_REPLACEMENT_CONFIRMATION_REQUIRED" }, { status: 400 });
  }
  try {
    let result: Awaited<ReturnType<typeof issueFiscalReplacementInTransaction>> | null = null;
    await ctx.db.runTransaction(async (tx) => {
      result = await issueFiscalReplacementInTransaction({
        db: ctx.db,
        tx,
        restaurantId: ctx.restaurantId,
        actorUid: ctx.uid,
        originalInvoiceId: invoiceId,
        customer,
        issuedAt: new Date(),
      });
    });
    if (!result) throw new Error("FISCAL_REPLACEMENT_FAILED");
    await enqueueFiscalRecord((result as { recordId: string }).recordId).catch(() => undefined);
    return NextResponse.json({ ok: true, invoice: result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FISCAL_REPLACEMENT_FAILED";
    return NextResponse.json({ ok: false, error: code }, { status: code.includes("NOT_FOUND") ? 404 : 409 });
  }
}
