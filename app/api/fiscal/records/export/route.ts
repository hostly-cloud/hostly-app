import { NextResponse } from "next/server";
import { buildFiscalRecordsNdjson, type FiscalRecordExportRow } from "@/lib/server/fiscal/export-fiscal-records";
import type { FiscalRecord } from "@/lib/fiscal/model";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";

function optionalPositiveNumber(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function GET(req: Request) {
  const ctx = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(ctx)) return ctx;
  if (!serverRoleHasCapability(ctx.role, "fiscal.export")) {
    return NextResponse.json({ ok: false, error: "FISCAL_EXPORT_REQUIRED" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("fromMs");
  const toRaw = url.searchParams.get("toMs");
  const fromMs = optionalPositiveNumber(fromRaw);
  const toMs = optionalPositiveNumber(toRaw);
  if ((fromRaw && fromMs == null) || (toRaw && toMs == null) || (fromMs != null && toMs != null && fromMs > toMs)) {
    return NextResponse.json({ ok: false, error: "FISCAL_EXPORT_PERIOD_INVALID" }, { status: 400 });
  }

  try {
    // Do not cap the result: article 8 requires exporting every generated fiscal
    // record in the requested period. Filtering after the tenant-scoped query also
    // avoids requiring a production-only composite index for this compliance path.
    const snapshot = await ctx.db.collection("fiscalRecords")
      .where("restaurantId", "==", ctx.restaurantId)
      .get();

    const rows: FiscalRecordExportRow[] = [];
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const createdAtMs = Number(data.createdAtMs);
      if (!Number.isFinite(createdAtMs)) throw new Error("FISCAL_RECORD_CREATED_AT_INVALID");
      if (fromMs != null && createdAtMs < fromMs) continue;
      if (toMs != null && createdAtMs > toMs) continue;
      if (!data.record || typeof data.record !== "object") throw new Error("FISCAL_RECORD_PAYLOAD_MISSING");
      rows.push({
        documentId: doc.id,
        createdAtMs,
        recordId: typeof data.recordId === "string" ? data.recordId : doc.id,
        invoiceId: typeof data.invoiceId === "string" ? data.invoiceId : null,
        version: data.version ?? null,
        record: data.record as FiscalRecord,
      });
    }

    const ndjson = buildFiscalRecordsNdjson({ restaurantId: ctx.restaurantId, fromMs, toMs, rows });
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(ndjson, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Content-Disposition": `attachment; filename="hostly-rrsif-${day}.ndjson"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "FISCAL_RECORD_EXPORT_FAILED" }, { status: 500 });
  }
}
