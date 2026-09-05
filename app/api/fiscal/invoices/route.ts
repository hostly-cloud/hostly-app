import { NextResponse } from "next/server";
import { listFiscalInvoices } from "@/lib/server/fiscal/list-fiscal-invoices";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";

function numericParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.view")) {
    return NextResponse.json({ ok: false, error: "FISCAL_VIEW_REQUIRED" }, { status: 403 });
  }
  const url = new URL(req.url);
  try {
    const invoices = await listFiscalInvoices(ctx.db, ctx.restaurantId, {
      fromMs: numericParam(url.searchParams.get("fromMs")),
      toMs: numericParam(url.searchParams.get("toMs")),
      status: url.searchParams.get("status") || undefined,
      documentKind: url.searchParams.get("kind") || undefined,
      query: url.searchParams.get("q") || undefined,
      limit: numericParam(url.searchParams.get("limit")),
    });
    return NextResponse.json({ ok: true, invoices });
  } catch {
    return NextResponse.json({ ok: false, error: "FISCAL_INVOICES_READ_FAILED" }, { status: 500 });
  }
}
