import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAuthErrorResponse, requireAuthenticatedRestaurant } from "@/lib/server/auth/require-authenticated-restaurant";
import { saveCustomerProfile } from "@/lib/server/customers/customer-crm";
import {
  attachCustomerToOrder,
  detachCustomerFromOrder,
  getCustomerCrmSnapshotV2,
  redeemLoyaltyReward,
  saveLoyaltyConfig,
} from "@/lib/server/customers/customer-crm-v2";

function jsonError(status: number, error: string) { return NextResponse.json({ ok: false, error }, { status }); }
function statusForError(code: string): number {
  if (["CUSTOMER_CRM_ACCESS_REQUIRED","CUSTOMER_CRM_EDIT_REQUIRED","CUSTOMER_VIP_MANAGE_REQUIRED","CUSTOMER_LOYALTY_MANAGE_REQUIRED","ORDER_TENANT_MISMATCH"].includes(code)) return 403;
  if (["CUSTOMER_NOT_FOUND","ORDER_NOT_FOUND","ACTIVE_ORDER_NOT_FOUND"].includes(code)) return 404;
  if (["MULTIPLE_ACTIVE_ORDERS","ORDER_NOT_ACTIVE","ORDER_TABLE_MISMATCH"].includes(code)) return 409;
  if (["CUSTOMER_NAME_REQUIRED","CUSTOMER_IDENTITY_REQUIRED","INVALID_BIRTHDAY","CUSTOMER_AND_TABLE_REQUIRED","INVALID_ACTION"].includes(code)) return 400;
  return 500;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req); if (isAuthErrorResponse(auth)) return auth;
    const snapshot = await getCustomerCrmSnapshotV2({ db: auth.db, restaurantId: auth.restaurantId, actorRole: auth.role });
    return NextResponse.json({ ok: true, snapshot }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTOMER_CRM_FAILED"; const status = statusForError(code);
    return jsonError(status, status === 500 ? "CUSTOMER_CRM_FAILED" : code);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedRestaurant(req); if (isAuthErrorResponse(auth)) return auth;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null; if (!body) return jsonError(400,"INVALID_JSON");
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "profile.save") {
      const result = await saveCustomerProfile({ db: auth.db, restaurantId: auth.restaurantId, actorUid: auth.uid, actorRole: auth.role, payload: body });
      const consent = body.marketingConsent === "granted" || body.marketingConsent === "denied" ? body.marketingConsent : "unknown";
      await auth.db.collection("restaurants").doc(auth.restaurantId).collection("customerProfiles").doc(result.profileId).set({
        marketingConsent: consent,
        marketingConsentAt: body.marketingConsent === undefined ? FieldValue.delete() : FieldValue.serverTimestamp(),
        marketingConsentSource: body.marketingConsentSource === "customer" ? "customer" : "staff_recorded",
      }, { merge: true });
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "order.attachCustomer") {
      const result = await attachCustomerToOrder({ db: auth.db, restaurantId: auth.restaurantId, actorUid: auth.uid, actorRole: auth.role, tableId: String(body.tableId ?? ""), orderId: typeof body.orderId === "string" ? body.orderId : undefined, profileId: String(body.profileId ?? "") });
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "order.detachCustomer") {
      const result = await detachCustomerFromOrder({ db: auth.db, restaurantId: auth.restaurantId, actorRole: auth.role, orderId: String(body.orderId ?? "") });
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "loyalty.configure") {
      const result = await saveLoyaltyConfig({ db: auth.db, restaurantId: auth.restaurantId, actorUid: auth.uid, actorRole: auth.role, payload: body });
      return NextResponse.json({ ok: true, loyalty: result });
    }
    if (action === "loyalty.redeem") {
      const result = await redeemLoyaltyReward({ db: auth.db, restaurantId: auth.restaurantId, actorUid: auth.uid, actorRole: auth.role, profileId: String(body.profileId ?? "") });
      return NextResponse.json({ ok: true, ...result });
    }
    return jsonError(400,"INVALID_ACTION");
  } catch (error) {
    const code = error instanceof Error ? error.message : "CUSTOMER_CRM_FAILED"; const status = statusForError(code);
    return jsonError(status, status === 500 ? "CUSTOMER_CRM_FAILED" : code);
  }
}
