import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  AuthorizedProfileError,
  assertAuthorizedProfileSnapshots,
} from "@/lib/server/auth/authorized-profile";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

export class ManageRestaurantUsersError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus = 400,
  ) {
    super(code);
    this.name = "ManageRestaurantUsersError";
  }
}

export type ManagedRestaurantUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: "active" | "disabled" | "review_required";
  reviewRequired: boolean;
};

export type ManagedAssignableRole =
  | "admin"
  | "manager"
  | "waiter"
  | "kitchen"
  | "viewer";

export async function listManagedRestaurantUsers(
  db: Firestore,
  restaurantId: string,
): Promise<ManagedRestaurantUser[]> {
  const canonicalSnapshot = await db
    .collection("users")
    .where("restaurantId", "==", restaurantId)
    .get();
  const mirrorSnapshots = canonicalSnapshot.empty
    ? []
    : await db.getAll(
        ...canonicalSnapshot.docs.map((document) =>
          db.collection("usuarios").doc(document.id),
        ),
      );

  return canonicalSnapshot.docs.map((document, index) => {
    const canonical = document.data() as Record<string, unknown>;
    try {
      const profile = assertAuthorizedProfileSnapshots({
        uid: document.id,
        canonicalSnapshot: document,
        mirrorSnapshot: mirrorSnapshots[index],
        allowDisabled: true,
      });
      return {
        id: document.id,
        email: profile.email,
        displayName:
          typeof canonical.displayName === "string"
            ? canonical.displayName
            : typeof canonical.nombre === "string"
              ? canonical.nombre
              : null,
        role: profile.rawRole,
        status: profile.status,
        reviewRequired: false,
      };
    } catch {
      return {
        id: document.id,
        email: typeof canonical.email === "string" ? canonical.email : "",
        displayName:
          typeof canonical.displayName === "string"
            ? canonical.displayName
            : typeof canonical.nombre === "string"
              ? canonical.nombre
              : null,
        role: typeof canonical.role === "string" ? canonical.role : "",
        status: "review_required",
        reviewRequired: true,
      };
    }
  });
}

export async function updateManagedRestaurantUser(params: {
  db: Firestore;
  actorUid: string;
  actorEmail: string;
  restaurantId: string;
  targetUid: string;
  role?: ManagedAssignableRole;
  status?: "active" | "disabled";
}): Promise<void> {
  if (!params.role && !params.status) {
    throw new ManageRestaurantUsersError("EMPTY_USER_UPDATE");
  }
  if (params.actorUid === params.targetUid) {
    throw new ManageRestaurantUsersError("SELF_ADMIN_UPDATE_FORBIDDEN", 403);
  }

  const actorUserRef = params.db.collection("users").doc(params.actorUid);
  const actorMirrorRef = params.db.collection("usuarios").doc(params.actorUid);
  const targetUserRef = params.db.collection("users").doc(params.targetUid);
  const targetMirrorRef = params.db.collection("usuarios").doc(params.targetUid);

  await params.db.runTransaction(async (transaction) => {
    const [
      actorUserSnapshot,
      actorMirrorSnapshot,
      targetUserSnapshot,
      targetMirrorSnapshot,
    ] = await transaction.getAll(
      actorUserRef,
      actorMirrorRef,
      targetUserRef,
      targetMirrorRef,
    );

    let actor;
    let target;
    try {
      actor = assertAuthorizedProfileSnapshots({
        uid: params.actorUid,
        email: params.actorEmail,
        canonicalSnapshot: actorUserSnapshot,
        mirrorSnapshot: actorMirrorSnapshot,
      });
      target = assertAuthorizedProfileSnapshots({
        uid: params.targetUid,
        canonicalSnapshot: targetUserSnapshot,
        mirrorSnapshot: targetMirrorSnapshot,
        allowDisabled: true,
      });
    } catch (error) {
      if (error instanceof AuthorizedProfileError) {
        throw new ManageRestaurantUsersError(error.code, error.httpStatus);
      }
      throw error;
    }

    if (
      actor.restaurantId !== params.restaurantId ||
      target.restaurantId !== params.restaurantId
    ) {
      throw new ManageRestaurantUsersError("USER_TENANT_MISMATCH", 403);
    }
    if (!serverRoleHasCapability(actor.rawRole, "users.manage")) {
      throw new ManageRestaurantUsersError("USERS_MANAGE_REQUIRED", 403);
    }
    if (target.role === "owner") {
      throw new ManageRestaurantUsersError("OWNER_ADMIN_UPDATE_FORBIDDEN", 403);
    }
    if (target.role === "admin" && actor.role !== "owner") {
      throw new ManageRestaurantUsersError("ADMIN_ADMIN_UPDATE_FORBIDDEN", 403);
    }
    if (params.role === "admin" && actor.role !== "owner") {
      throw new ManageRestaurantUsersError("ROLE_ASSIGNMENT_FORBIDDEN", 403);
    }

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: params.actorUid,
    };
    if (params.role) patch.role = params.role;
    if (params.status) patch.status = params.status;
    transaction.update(targetUserRef, patch);
    transaction.update(targetMirrorRef, patch);
  });
}
