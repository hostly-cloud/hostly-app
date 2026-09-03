import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { resolveHostlySubscriptionAccess } from "@/lib/server/subscription/resolve-hostly-subscription-access";

export async function GET(req: Request) {
  const context = await requireAuthenticatedRestaurant(req);
  if (isAuthErrorResponse(context)) return context;

  const access = await resolveHostlySubscriptionAccess({
    db: context.db,
    restaurantId: context.restaurantId,
  });

  return NextResponse.json({ ok: true, access });
}
