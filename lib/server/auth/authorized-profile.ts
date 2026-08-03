import type {
  DocumentSnapshot,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import {
  evaluateProfileAuthorization,
  type AuthorizedProfile,
  type ProfileAuthorizationIssue,
} from "@/lib/auth/profile-authorization-policy";

export class AuthorizedProfileError extends Error {
  constructor(
    readonly code: ProfileAuthorizationIssue,
    readonly httpStatus = code === "PROFILE_DISABLED" ? 403 : 409,
  ) {
    super(code);
    this.name = "AuthorizedProfileError";
  }
}

function data(snapshot: DocumentSnapshot): Record<string, unknown> | null {
  return snapshot.exists
    ? (snapshot.data() as Record<string, unknown>)
    : null;
}

export function assertAuthorizedProfileSnapshots(input: {
  uid: string;
  email?: string | null;
  canonicalSnapshot: DocumentSnapshot;
  mirrorSnapshot: DocumentSnapshot;
  allowDisabled?: boolean;
}): AuthorizedProfile {
  const result = evaluateProfileAuthorization({
    uid: input.uid,
    email: input.email,
    canonical: data(input.canonicalSnapshot),
    mirror: data(input.mirrorSnapshot),
    allowDisabled: input.allowDisabled,
  });
  if (!result.ok) throw new AuthorizedProfileError(result.issue);
  return result.profile;
}

export async function readAuthorizedProfile(
  db: Firestore,
  uid: string,
  email?: string | null,
  options?: { allowDisabled?: boolean; transaction?: Transaction },
): Promise<AuthorizedProfile> {
  const canonicalRef = db.collection("users").doc(uid);
  const mirrorRef = db.collection("usuarios").doc(uid);
  const [canonicalSnapshot, mirrorSnapshot] = options?.transaction
    ? await options.transaction.getAll(canonicalRef, mirrorRef)
    : await db.getAll(canonicalRef, mirrorRef);
  return assertAuthorizedProfileSnapshots({
    uid,
    email,
    canonicalSnapshot,
    mirrorSnapshot,
    allowDisabled: options?.allowDisabled,
  });
}
