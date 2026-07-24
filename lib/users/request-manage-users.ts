import { auth } from "@/lib/firebase/client";
import type {
  ManagedAssignableRole,
  ManagedRestaurantUser,
} from "@/lib/server/users/manage-restaurant-users";

async function headers(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) throw new Error("UNAUTHORIZED");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${await user.getIdToken()}`,
  };
}

export async function requestManagedRestaurantUsers(): Promise<
  ManagedRestaurantUser[]
> {
  const response = await fetch("/api/users/manage", {
    headers: await headers(),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string; users?: ManagedRestaurantUser[] }
    | null;
  if (!response.ok || !payload?.ok || !Array.isArray(payload.users)) {
    throw new Error(payload?.error || "USER_LIST_FAILED");
  }
  return payload.users;
}

export async function requestManagedUserUpdate(input: {
  userId: string;
  role?: ManagedAssignableRole;
  status?: "active" | "disabled";
}): Promise<void> {
  const response = await fetch("/api/users/manage", {
    method: "PATCH",
    headers: await headers(),
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; error?: string }
    | null;
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "USER_UPDATE_FAILED");
  }
}
