import { auth } from "@/lib/firebase/client";
import type { CustomerCrmSnapshot } from "@/lib/customers/types";
import type { MarketingConsent } from "@/lib/customers/crm-v2-policy";

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("UNAUTHORIZED");
  return { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` };
}
async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/customers", { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; [key: string]: unknown } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "CUSTOMER_CRM_OPERATION_FAILED");
  return payload;
}
export async function requestCustomerCrm(): Promise<CustomerCrmSnapshot> {
  const response = await fetch("/api/customers", { headers: await authHeaders(), cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; snapshot?: CustomerCrmSnapshot } | null;
  if (!response.ok || !payload?.ok || !payload.snapshot) throw new Error(payload?.error || "CUSTOMER_CRM_FAILED");
  return payload.snapshot;
}
export async function saveCustomerCrmProfile(input: {
  profileId?: string | null; sourceKeys: string[]; displayName: string; phone: string; email: string; birthday: string; vip: boolean;
  tags: string[]; allergies: string; preferences: string; notes: string; marketingConsent?: MarketingConsent;
}) {
  const payload = await post({ action: "profile.save", ...input, marketingConsentSource: "customer" });
  return typeof payload.profileId === "string" ? payload.profileId : null;
}
export const attachCustomerToTpvOrder = (input: { tableId: string; profileId: string; orderId?: string }) => post({ action: "order.attachCustomer", ...input });
export const detachCustomerFromTpvOrder = (orderId: string) => post({ action: "order.detachCustomer", orderId });
export const configureCustomerLoyalty = (input: { enabled: boolean; visitGoal: number; rewardLabel: string }) => post({ action: "loyalty.configure", ...input });
export const redeemCustomerReward = (profileId: string) => post({ action: "loyalty.redeem", profileId });
