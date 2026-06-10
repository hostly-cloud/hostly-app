import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { applyPendingInviteForUser } from "@/lib/auth/invite-resolution";
import { getPendingInviteByEmail } from "@/lib/firestore/restaurant-invites";

export function authErrorMessage(e: unknown): string {
  if (e instanceof FirebaseError) return e.message;
  if (e instanceof Error) return e.message;
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  return "Auth error";
}

export async function login(email: string, password: string): Promise<User> {
  console.log("[AUTH] login start", email.trim());
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    console.log("[AUTH] login success", cred.user.uid);
    try {
      await applyPendingInviteForUser(cred.user);
    } catch (inviteErr) {
      console.error(
        "[INVITE] apply pending failed (sesión válida)",
        authErrorMessage(inviteErr),
        inviteErr,
      );
    }
    return cred.user;
  } catch (e) {
    console.log("[AUTH] auth error", authErrorMessage(e));
    throw e;
  }
}

export async function register(
  email: string,
  password: string,
  restaurantName?: string,
): Promise<User> {
  const trimmed = email.trim();
  console.log("[AUTH] register start", trimmed);
  let createdUser: User | undefined;
  try {
    const pendingInvite = await getPendingInviteByEmail(trimmed);
    const cred = await createUserWithEmailAndPassword(auth, trimmed, password);
    createdUser = cred.user;
    const user = createdUser;
    console.log("[AUTH] register auth user created", user.uid);
    if (pendingInvite) {
      const profile = {
        uid: user.uid,
        email: user.email ?? trimmed,
        restaurantId: pendingInvite.restaurantId,
        restaurantName: pendingInvite.restaurantName,
        role: pendingInvite.role,
      };
      const batch = writeBatch(db);
      batch.set(doc(db, "users", user.uid), profile, { merge: true });
      batch.set(doc(db, "usuarios", user.uid), profile, { merge: true });
      batch.update(doc(db, "restaurant_invites", pendingInvite.id), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
        acceptedByUid: user.uid,
      });
      await batch.commit();
      console.log("[AUTH] register joined restaurant via invite", user.uid);
      return user;
    }
    const userRef = doc(db, "users", user.uid);
    const existingUser = await getDoc(userRef);
    if (existingUser.exists()) {
      const prev = existingUser.data() as Record<string, unknown>;
      const existingRid =
        typeof prev.restaurantId === "string" ? prev.restaurantId.trim() : "";
      if (existingRid) {
        console.log(
          "[AUTH] register user doc already linked to restaurant, skip",
          user.uid,
        );
        return user;
      }
    }

    const restaurantNameFinal = restaurantName?.trim() || "Mi restaurante";
    const restaurantRef = doc(collection(db, "restaurants"));
    const profile = {
      email: user.email ?? trimmed,
      restaurantId: restaurantRef.id,
      restaurantName: restaurantNameFinal,
      role: "owner" as const,
    };
    const batch = writeBatch(db);
    batch.set(restaurantRef, {
      name: restaurantNameFinal,
      createdAt: Date.now(),
    });
    batch.set(userRef, profile);
    batch.set(doc(db, "usuarios", user.uid), profile);
    await batch.commit();
    console.log("[AUTH] register profile + restaurant committed", user.uid);
    return user;
  } catch (e) {
    const msg = authErrorMessage(e);
    console.error("[REGISTER ERROR]", msg, e);
    if (createdUser) {
      try {
        await deleteUser(createdUser);
        console.log("[AUTH] register rolled back auth user after profile failure");
      } catch (delErr) {
        const delMsg = authErrorMessage(delErr);
        console.error("[REGISTER ERROR] no se pudo eliminar cuenta huérfana:", delMsg, delErr);
        throw new Error(
          `No se pudo guardar el restaurante y falló la reversión de la cuenta. ${msg} (reversión: ${delMsg})`,
        );
      }
      throw new Error(`No se pudo completar el registro: ${msg}`);
    }
    throw e;
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export function subscribeToAuthState(
  callback: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, callback);
}
