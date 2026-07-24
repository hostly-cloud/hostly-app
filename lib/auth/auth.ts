import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import {
  applyPendingInviteForUser,
} from "@/lib/auth/invite-resolution";

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

export async function login(
  email: string,
  password: string,
  inviteToken?: string,
): Promise<User> {
  console.log("[AUTH] login start", email.trim());
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    console.log("[AUTH] login success", cred.user.uid);
    if (inviteToken?.trim() && cred.user.emailVerified) {
      try {
        await applyPendingInviteForUser(cred.user, inviteToken);
      } catch (inviteErr) {
        await signOut(auth);
        throw inviteErr;
      }
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
  inviteToken?: string,
): Promise<User> {
  const trimmed = email.trim();
  if (!inviteToken?.trim()) {
    throw new Error(
      "CONTROLLED_ACCESS_INVITE_REQUIRED: Hostly requiere una invitación durante el piloto.",
    );
  }
  console.log("[AUTH] register start", trimmed);
  try {
    const cred = await createUserWithEmailAndPassword(auth, trimmed, password);
    const user = cred.user;
    console.log("[AUTH] register auth user created", user.uid);
    await sendEmailVerification(user);
    return user;
  } catch (e) {
    const msg = authErrorMessage(e);
    console.error("[REGISTER ERROR]", msg, e);
    throw e;
  }
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export async function resendEmailVerification(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function refreshEmailVerification(user: User): Promise<User> {
  await user.reload();
  await user.getIdToken(true);
  return auth.currentUser ?? user;
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}

export function subscribeToAuthState(
  callback: (user: User | null) => void,
): () => void {
  return onAuthStateChanged(auth, callback);
}
