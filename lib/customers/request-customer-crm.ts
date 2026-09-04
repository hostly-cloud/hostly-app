import { auth } from "@/lib/firebase/client";
import type { CustomerCrmSnapshot } from "@/lib/customers/types";

async function authHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("UNAUTHORIZED");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

export async function requestCustomerCrm(): Promise<CustomerCrmSnapshot> {
  const response = await fetch("/api/customers", {
    headers: await authHeaders(),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; snapshot?: CustomerCrmSnapshot }
    | null;
  if (!response.ok || !payload?.ok || !payload.snapshot) {
    throw new Error(payload?.error || "CUSTOMER_CRM_FAILED");
  }
  return payload.snapshot;
}

export async function saveCustomerCrmProfile(input: {
  profileId?: string | null;
  sourceKeys: string[];
  displayName: string;
  phone: string;
  email: string;
  birthday: string;
  vip: boolean;
  tags: string[];
  allergies: string;
  preferences: string;
  notes: string;
}) {
  const response = await fetch("/api/customers", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ action: "profile.save", ...input }),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; profileId?: string }
    | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || "CUSTOMER_SAVE_FAILED");
  return payload.profileId ?? null;
}
