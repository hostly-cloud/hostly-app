import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { customerCrmPermissions } from "@/lib/server/customers/customer-crm";
import { getCustomerCrmSnapshotV2 } from "@/lib/server/customers/customer-crm-v2";

function clean(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function redeemAvailableLoyaltyReward(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  profileId: string;
}) {
  if (!customerCrmPermissions(input.actorRole).canManageVip) {
    throw new Error("CUSTOMER_LOYALTY_MANAGE_REQUIRED");
  }
  const profileId = clean(input.profileId);
  if (!profileId) throw new Error("CUSTOMER_NOT_FOUND");
  const snapshot = await getCustomerCrmSnapshotV2({
    db: input.db,
    restaurantId: input.restaurantId,
    actorRole: input.actorRole,
  });
  const record = snapshot.records.find((item) => item.profileId === profileId);
  if (!record) throw new Error("CUSTOMER_NOT_FOUND");
  if ((record.loyaltyAvailableRewards ?? 0) < 1) {
    throw new Error("LOYALTY_REWARD_NOT_AVAILABLE");
  }
  const ref = input.db.collection("restaurants").doc(input.restaurantId).collection("customerProfiles").doc(profileId);
  await input.db.runTransaction(async (tx) => {
    const customer = await tx.get(ref);
    if (!customer.exists) throw new Error("CUSTOMER_NOT_FOUND");
    tx.set(ref, {
      loyaltyRedemptions: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actorUid,
    }, { merge: true });
    tx.create(ref.collection("loyaltyEvents").doc(), {
      type: "reward_redeemed",
      rewardLabel: snapshot.loyalty?.rewardLabel ?? "Detalle de la casa",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: input.actorUid,
    });
  });
  return { profileId };
}
