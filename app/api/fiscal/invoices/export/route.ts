import { NextResponse } from "next/server";
import { buildFiscalInvoicesCsv, listFiscalInvoices } from "@/lib/server/fiscal/list-fiscal-invoices";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";

export async function GET(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.export")) {
    return NextResponse.json({ ok: false, error: "FISCAL_EXPORT_REQUIRED" }, { status: 403 });
  }
  const url = new URL(req.url);
  const fromMs = Number(url.searchParams.get("fromMs"));
  const toMs = Number(url.searchParams.get("toMs"));
  try {
    const rows = await listFiscalInvoices(ctx.db, ctx.restaurantId, {
      fromMs: Number.isFinite(fromMs) && fromMs > 0 ? fromMs : undefined,
      toMs: Number.isFinite(toMs) && toMs > 0 ? toMs : undefined,
      limit: 500,
    });
    const csv = buildFiscalInvoicesCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hostly-facturacion-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "FISCAL_EXPORT_FAILED" }, { status: 500 });
  }
}
