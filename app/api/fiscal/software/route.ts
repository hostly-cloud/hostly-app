import { NextResponse } from "next/server";
import { currentResponsibleDeclaration } from "@/lib/fiscal/responsible-declaration";
import { HOSTLY_FISCAL_VERSION_SNAPSHOT } from "@/lib/fiscal/version";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";

export async function GET(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.view") && !serverRoleHasCapability(ctx.role, "fiscal.config")) {
    return NextResponse.json({ ok: false, error: "FISCAL_VIEW_REQUIRED" }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    software: {
      productName: "Hostly",
      systemId: "H1",
      producerLegalName: process.env.HOSTLY_FISCAL_PRODUCER_LEGAL_NAME?.trim() || "Pendiente de publicación",
      producerNif: process.env.HOSTLY_FISCAL_PRODUCER_NIF?.trim() || "Pendiente de publicación",
      versions: HOSTLY_FISCAL_VERSION_SNAPSHOT,
      responsibleDeclaration: currentResponsibleDeclaration(),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
