import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateFiscalInvoicePdf, type FiscalPdfPaper } from "@/lib/fiscal/fiscal-invoice-pdf";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";

export async function GET(req: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.view") && !serverRoleHasCapability(ctx.role, "fiscal.issue")) {
    return NextResponse.json({ ok: false, error: "FISCAL_VIEW_REQUIRED" }, { status: 403 });
  }
  const { invoiceId } = await context.params;
  const snap = await ctx.db.collection("fiscalInvoices").doc(invoiceId).get();
  if (!snap.exists || snap.data()?.restaurantId !== ctx.restaurantId) {
    return NextResponse.json({ ok: false, error: "FISCAL_INVOICE_NOT_FOUND" }, { status: 404 });
  }
  const url = new URL(req.url);
  const paperRaw = url.searchParams.get("paper") ?? "a4";
  if (!["a4", "80mm", "58mm"].includes(paperRaw)) {
    return NextResponse.json({ ok: false, error: "FISCAL_PAPER_INVALID" }, { status: 400 });
  }
  const duplicate = url.searchParams.get("duplicate") === "1";
  try {
    const pdf = generateFiscalInvoicePdf({ invoice: snap.data() as never, paper: paperRaw as FiscalPdfPaper, duplicate });
    if (duplicate) {
      await ctx.db.collection("fiscalAuditEvents").doc(randomUUID()).set({
        restaurantId: ctx.restaurantId,
        taxEntityId: snap.data()?.taxEntityId,
        actorUid: ctx.uid,
        action: "fiscal_invoice_duplicate_generated",
        entityType: "fiscalInvoice",
        entityId: invoiceId,
        result: "success",
        source: "fiscal_pdf_api",
        createdAtMs: Date.now(),
      });
    }
    const filename = `factura-${String(snap.data()?.invoiceNumber ?? invoiceId).replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "FISCAL_PDF_GENERATION_FAILED" }, { status: 500 });
  }
}
