import {
  FieldValue,
  type Firestore,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase-admin/firestore";
import {
  AuthorizedProfileError,
  assertAuthorizedProfileSnapshots,
  readAuthorizedProfile,
} from "@/lib/server/auth/authorized-profile";
import { normalizeAuthorizationRole } from "@/lib/auth/profile-authorization-policy";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

export type UserProfileBootstrapIntent =
  | "accept_invite_only"
  | "register_owner";

export type UserProfileBootstrapResult = {
  restaurantId: string;
  source: "existing" | "invite";
};

export class UserProfileBootstrapError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "UserProfileBootstrapError";
  }
}

type BootstrapUserProfileParams = {
  db: Firestore;
  uid: string;
  email: string;
  emailVerified: boolean;
  intent: UserProfileBootstrapIntent;
  inviteTokenHash?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestampMillis(value: unknown): number {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as Timestamp).toMillis === "function"
  ) {
    return (value as Timestamp).toMillis();
  }
  return 0;
}

function readInviteRole(value: unknown): "admin" | "manager" | "waiter" {
  const role = normalizeAuthorizationRole(value);
  if (role === "admin" || role === "manager" || role === "waiter") return role;
  throw new UserProfileBootstrapError(
    role === "owner" ? "INVITE_OWNER_FORBIDDEN" : "INVITE_ROLE_INVALID",
    "La invitación contiene un rol no permitido durante el piloto controlado",
    403,
  );
}

async function findInviteByTokenHash(
  db: Firestore,
  tokenHash: string,
): Promise<QueryDocumentSnapshot | null> {
  const snapshot = await db
    .collection("restaurant_invites")
    .where("tokenHash", "==", tokenHash)
    .limit(2)
    .get();
  if (snapshot.size > 1) {
    throw new UserProfileBootstrapError(
      "INVITE_TOKEN_AMBIGUOUS",
      "El token está asociado a más de una invitación",
      409,
    );
  }
  return snapshot.docs[0] ?? null;
}

function mapAuthorizedProfileError(error: AuthorizedProfileError): UserProfileBootstrapError {
  return new UserProfileBootstrapError(
    error.code,
    "El perfil existente requiere revisión administrativa",
    error.httpStatus,
  );
}

export async function bootstrapUserProfile(
  params: BootstrapUserProfileParams,
): Promise<UserProfileBootstrapResult> {
  const uid = params.uid.trim();
  const email = params.email.trim().toLowerCase();
  if (!uid || !email) {
    throw new UserProfileBootstrapError(
      "INVALID_AUTH_IDENTITY",
      "La identidad autenticada no contiene UID y email válidos",
      401,
    );
  }
  if (params.intent === "register_owner") {
    throw new UserProfileBootstrapError(
      "OWNER_SELF_SERVICE_DISABLED",
      "El alta de propietarios requiere aprovisionamiento administrativo",
      403,
    );
  }

  const userRef = params.db.collection("users").doc(uid);
  const mirrorRef = params.db.collection("usuarios").doc(uid);
  const [existingUser, existingMirror] = await params.db.getAll(userRef, mirrorRef);
  if (existingUser.exists || existingMirror.exists) {
    try {
      const profile = await readAuthorizedProfile(params.db, uid, email);
      return { restaurantId: profile.restaurantId, source: "existing" };
    } catch (error) {
      if (error instanceof AuthorizedProfileError) {
        throw mapAuthorizedProfileError(error);
      }
      throw error;
    }
  }

  if (!params.emailVerified) {
    throw new UserProfileBootstrapError(
      "EMAIL_NOT_VERIFIED",
      "Verifica tu correo antes de aceptar la invitación",
      403,
    );
  }

  const tokenHash = params.inviteTokenHash?.trim() || "";
  if (!tokenHash) {
    throw new UserProfileBootstrapError(
      "INVITE_REQUIRED",
      "Hostly está en acceso controlado y requiere una invitación válida",
      403,
    );
  }
  const inviteDocument = await findInviteByTokenHash(params.db, tokenHash);
  if (!inviteDocument) {
    throw new UserProfileBootstrapError(
      "INVITE_NOT_FOUND",
      "El token de invitación no es válido",
      409,
    );
  }

  const initialInvite = inviteDocument.data() as Record<string, unknown>;
  const restaurantId = text(initialInvite.restaurantId);
  const creatorUid = text(initialInvite.createdByUid);
  if (!restaurantId || !creatorUid) {
    throw new UserProfileBootstrapError(
      "INVITE_PROVENANCE_INVALID",
      "La invitación no contiene procedencia administrativa verificable",
      409,
    );
  }

  const creatorUserRef = params.db.collection("users").doc(creatorUid);
  const creatorMirrorRef = params.db.collection("usuarios").doc(creatorUid);
  const restaurantRef = params.db.collection("restaurants").doc(restaurantId);

  return params.db.runTransaction(async (transaction) => {
    const [
      userSnapshot,
      mirrorSnapshot,
      inviteSnapshot,
      creatorUserSnapshot,
      creatorMirrorSnapshot,
      restaurantSnapshot,
    ] = await transaction.getAll(
      userRef,
      mirrorRef,
      inviteDocument.ref,
      creatorUserRef,
      creatorMirrorRef,
      restaurantRef,
    );

    if (userSnapshot.exists || mirrorSnapshot.exists) {
      try {
        const profile = assertAuthorizedProfileSnapshots({
          uid,
          email,
          canonicalSnapshot: userSnapshot,
          mirrorSnapshot,
        });
        return { restaurantId: profile.restaurantId, source: "existing" };
      } catch (error) {
        if (error instanceof AuthorizedProfileError) {
          throw mapAuthorizedProfileError(error);
        }
        throw error;
      }
    }

    if (!inviteSnapshot.exists) {
      throw new UserProfileBootstrapError(
        "INVITE_NOT_FOUND",
        "La invitación ya no existe",
        409,
      );
    }
    const invite = inviteSnapshot.data() as Record<string, unknown>;
    if (text(invite.tokenHash) !== tokenHash) {
      throw new UserProfileBootstrapError(
        "INVITE_TOKEN_CHANGED",
        "El token de invitación cambió durante la aceptación",
        409,
      );
    }
    const status = text(invite.status).toLowerCase();
    if (status === "accepted") {
      throw new UserProfileBootstrapError(
        "INVITE_ALREADY_USED",
        "La invitación ya fue utilizada",
        409,
      );
    }
    if (status === "cancelled" || status === "canceled" || status === "revoked") {
      throw new UserProfileBootstrapError(
        "INVITE_REVOKED",
        "La invitación fue revocada",
        409,
      );
    }
    if (status !== "pending") {
      throw new UserProfileBootstrapError(
        "INVITE_NOT_PENDING",
        "La invitación no está disponible",
        409,
      );
    }
    if (timestampMillis(invite.expiresAt) <= Date.now()) {
      throw new UserProfileBootstrapError(
        "INVITE_EXPIRED",
        "La invitación ha caducado",
        409,
      );
    }
    if (text(invite.email).toLowerCase() !== email) {
      throw new UserProfileBootstrapError(
        "INVITE_EMAIL_MISMATCH",
        "La invitación pertenece a otro email",
        403,
      );
    }
    if (
      text(invite.restaurantId) !== restaurantId ||
      text(invite.createdByUid) !== creatorUid ||
      !restaurantSnapshot.exists
    ) {
      throw new UserProfileBootstrapError(
        "INVITE_PROVENANCE_CHANGED",
        "La procedencia de la invitación no es válida",
        409,
      );
    }

    let creatorProfile;
    try {
      creatorProfile = assertAuthorizedProfileSnapshots({
        uid: creatorUid,
        canonicalSnapshot: creatorUserSnapshot,
        mirrorSnapshot: creatorMirrorSnapshot,
      });
    } catch (error) {
      if (error instanceof AuthorizedProfileError) {
        throw mapAuthorizedProfileError(error);
      }
      throw error;
    }
    const role = readInviteRole(invite.role);
    if (
      creatorProfile.restaurantId !== restaurantId ||
      !serverRoleHasCapability(creatorProfile.rawRole, "users.manage") ||
      (role === "admin" && creatorProfile.role !== "owner")
    ) {
      throw new UserProfileBootstrapError(
        "INVITE_CREATOR_UNAUTHORIZED",
        "La invitación no fue emitida por un usuario autorizado",
        403,
      );
    }

    const profile = {
      uid,
      email,
      restaurantId,
      restaurantName: text(invite.restaurantName) || "Mi restaurante",
      role,
      status: "active",
      createdAt: FieldValue.serverTimestamp(),
    };
    transaction.create(userRef, profile);
    transaction.create(mirrorRef, profile);
    transaction.update(inviteDocument.ref, {
      status: "accepted",
      acceptedAt: FieldValue.serverTimestamp(),
      acceptedByUid: uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { restaurantId, source: "invite" };
  });
}
