import type { Firestore } from "firebase-admin/firestore";
import type { HostlyEntitlement } from "@/lib/subscription/hostly-entitlements";
import {
  resolveHostlySubscriptionAccess,
  subscriptionAccessHasEntitlement,
} from "@/lib/server/subscription/resolve-hostly-subscription-access";

export type PosMigrationEntitlement = Extract<
  HostlyEntitlement,
  "migration.products" | "migration.full"
>;

export async function restaurantHasPosMigrationEntitlement(params: {
  db: Firestore;
  restaurantId: string;
  entitlement: PosMigrationEntitlement;
}): Promise<boolean> {
  const access = await resolveHostlySubscriptionAccess({
    db: params.db,
    restaurantId: params.restaurantId,
  });
  return subscriptionAccessHasEntitlement(access, params.entitlement);
}
