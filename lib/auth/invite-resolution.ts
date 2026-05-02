import type { User } from "firebase/auth";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  getPendingInviteByEmail,
  normalizeInviteEmail,
} from "@/lib/firestore/restaurant-invites";

/**
 * Si hay invitación pendiente para el email del usuario, asigna perfil al
 * restaurante de la invitación y marca la invitación como aceptada.
 * @returns true si se aplicó una invitación
 */
export async function applyPendingInviteForUser(user: User): Promise<boolean> {
  const email = user.email;
  if (!email) return false;
  const invite = await getPendingInviteByEmail(email);
  if (!invite) return false;
  if (!user.email) {
    throw new Error("NO_AUTH_EMAIL");
  }

  const normalizedAuthEmail = user.email.toLowerCase().trim();
  const normalizedInviteEmail = invite.email.toLowerCase().trim();

  if (normalizedAuthEmail !== normalizedInviteEmail) {
    throw new Error("EMAIL_MISMATCH_INVITE");
  }
  const batch = writeBatch(db);
  const profile = {
    uid: user.uid,
    email: user.email ?? normalizeInviteEmail(email),
    restaurantId: invite.restaurantId,
    restaurantName: invite.restaurantName,
    role: invite.role,
  };
  batch.set(doc(db, "users", user.uid), profile, { merge: true });
  batch.set(doc(db, "usuarios", user.uid), profile, { merge: true });
  batch.update(doc(db, "restaurant_invites", invite.id), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
    acceptedByUid: user.uid,
  });
  await batch.commit();
  return true;
}
