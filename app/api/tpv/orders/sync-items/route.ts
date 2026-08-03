import { NextResponse } from "next/server";

/** @deprecated Usar operaciones tipadas en /api/tpv/orders/* y /api/tpv/payments/* */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "SYNC_ITEMS_DEPRECATED",
      details: "Use create-open, upsert-sale-lines, cancel-lines o transition-line-status",
    },
    { status: 410 },
  );
}
