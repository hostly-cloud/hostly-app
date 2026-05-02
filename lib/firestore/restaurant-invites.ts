import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { UserRestaurantRole } from "@/lib/firestore/user-restaurant-profile";

export type RestaurantInviteRole = "owner" | "staff";
export type RestaurantInviteStatus = "pending" | "accepted";

export type PendingRestaurantInvite = {
  id: string;
  email: string;
  restaurantId: string;
  restaurantName: string;
  role: RestaurantInviteRole;
  invitedBy: string;
};

export function normalizeInviteEmail(email: string): string {
  return String(email).trim().toLowerCase();
}

function parseInviteRole(v: unknown): RestaurantInviteRole {
  if (v === "owner") return "owner";
  return "staff";
}

function createdAtMillis(data: Record<string, unknown>): number {
  const c = data.createdAt;
  if (
    c &&
    typeof c === "object" &&
    "toMillis" in c &&
    typeof (c as { toMillis: () => number }).toMillis === "function"
  ) {
    return (c as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/**
 * Invitación pendiente para el email (normalizado a minúsculas).
 * Si hay varias, se usa la más reciente por `createdAt`.
 */
export async function getPendingInviteByEmail(
  email: string,
): Promise<PendingRestaurantInvite | null> {
  const normalized = normalizeInviteEmail(email);
  if (!normalized || !normalized.includes("@")) return null;
  const q = query(
    collection(db, "restaurant_invites"),
    where("email", "==", normalized),
    where("status", "==", "pending"),
    limit(25),
  );
  const snap = await getDocs(q);
  let best: { id: string; data: Record<string, unknown>; ms: number } | null =
    null;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const ms = createdAtMillis(data);
    if (!best || ms > best.ms) best = { id: d.id, data, ms };
  }
  if (!best) return null;
  const data = best.data;
  const restaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  const restaurantNameRaw = data.restaurantName;
  const restaurantName =
    typeof restaurantNameRaw === "string" && restaurantNameRaw.trim() !== ""
      ? restaurantNameRaw.trim()
      : "Mi restaurante";
  if (!restaurantId) return null;
  const invitedBy =
    typeof data.invitedBy === "string" ? data.invitedBy.trim() : "";
  return {
    id: best.id,
    email: normalized,
    restaurantId,
    restaurantName,
    role: parseInviteRole(data.role),
    invitedBy,
  };
}

async function hasPendingInviteForRestaurant(
  email: string,
  restaurantId: string,
): Promise<boolean> {
  const normalized = normalizeInviteEmail(email);
  const q = query(
    collection(db, "restaurant_invites"),
    where("email", "==", normalized),
    where("status", "==", "pending"),
    limit(25),
  );
  const snap = await getDocs(q);
  return snap.docs.some(
    (d) =>
      String((d.data() as { restaurantId?: string }).restaurantId ?? "").trim() ===
      restaurantId,
  );
}

export async function createRestaurantInvite(
  email: string,
  restaurantId: string,
  restaurantName: string,
  role: RestaurantInviteRole,
  invitedBy: string,
  actorRole: UserRestaurantRole,
): Promise<void> {
  if (actorRole !== "owner") {
    throw new Error("ONLY_OWNER_CAN_INVITE");
  }
  if (!restaurantId) {
    throw new Error("MISSING_RESTAURANT_ID");
  }

  if (!invitedBy) {
    throw new Error("MISSING_INVITER");
  }

  const normalized = normalizeInviteEmail(email);
  if (!normalized.includes("@")) {
    throw new Error("Email inválido");
  }
  const rid = restaurantId.trim();
  if (!rid) throw new Error("restaurantId no válido");
  const existing = await getPendingInviteByEmail(email);
  if (existing && existing.restaurantId === rid) {
    throw new Error("INVITE_ALREADY_EXISTS");
  }
  const dup = await hasPendingInviteForRestaurant(normalized, rid);
  if (dup) {
    throw new Error(
      "Ya existe una invitación pendiente para ese email en este restaurante.",
    );
  }
  const ref = doc(collection(db, "restaurant_invites"));
  await setDoc(ref, {
    email: normalized,
    restaurantId: rid,
    restaurantName: restaurantName.trim() || "Mi restaurante",
    role,
    invitedBy: invitedBy.trim(),
    createdAt: serverTimestamp(),
    status: "pending" satisfies RestaurantInviteStatus,
  });
}

export const getPendingInvitesByRestaurant = async (restaurantId: string) => {
  const q = query(
    collection(db, "restaurant_invites"),
    where("restaurantId", "==", restaurantId),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const revokeInvite = async (inviteId: string) => {
  const ref = doc(db, "restaurant_invites", inviteId);
  await deleteDoc(ref);
};

export const getMyPendingInvite = async (email: string) => {
  const normalized = normalizeInviteEmail(email);
  if (!normalized || !normalized.includes("@")) return null;
  const q = query(
    collection(db, "restaurant_invites"),
    where("email", "==", normalized),
    where("status", "==", "pending"),
  );
  const snap = await getDocs(q);
  return snap.docs[0]
    ? { id: snap.docs[0].id, ...snap.docs[0].data() }
    : null;
};

export const acceptInvite = async (invite: any, userId: string) => {
  const userRef = doc(db, "users", userId);
  const inviteRef = doc(db, "restaurant_invites", invite.id);

  await updateDoc(userRef, {
    restaurantId: invite.restaurantId,
    role: invite.role,
  });

  await updateDoc(inviteRef, {
    status: "accepted",
  });
};
