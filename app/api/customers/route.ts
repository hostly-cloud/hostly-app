import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import {
  getCustomerCrmSnapshot,
  saveCustomerProfile,
} from "@/lib/server/customers/customer-crm";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function statusForError(code: string): number {
  if (code === "CUSTOMER_CRM_ACCESS_REQUIRED" || code === "CUSTOMER_CRM_EDIT_REQUIRED" || code === "CUSTOMER_VIP_MANAGE_REQUIRED") return 403;
  if (code === "CUSTOMER_NAME_REQUIRED" || code === "CUSTOMER_IDENTITY_REQUIRED" || code === "INVALID_BIRTHDAY") return 400;
  return 500;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    const snapshot = await getCustomerCrmSnapshot({
      db: auth.db,
      restaurantId: auth.restaurantId,
      actorRole: auth.role,
    });
    return NextResponse.json({ ok: true, snapshot }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTOMER_CRM_FAILED";
    const status = statusForError(code);
    return jsonError(status, status === 500 ? "CUSTOMER_CRM_FAILED" : code);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req);
    if (isAuthErrorResponse(auth)) return auth;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return jsonError(400, "INVALID_JSON");
    if (body.action !== "profile.save") return jsonError(400, "INVALID_ACTION");
    const result = await saveCustomerProfile({
      db: auth.db,
      restaurantId: auth.restaurantId,
      actorUid: auth.uid,
      actorRole: auth.role,
      payload: body,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTOMER_CRM_FAILED";
    const status = statusForError(code);
    return jsonError(status, status === 500 ? "CUSTOMER_CRM_FAILED" : code);
  }
}
