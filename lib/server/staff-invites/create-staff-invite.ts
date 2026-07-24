import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore";
import { isOwnerOrAdminRole } from "@/lib/server/auth/profile-role";
import { normalizeAuthorizationRole } from "@/lib/auth/profile-authorization-policy";
import { buildStaffInviteUrl } from "@/lib/staff-invites/build-invite-url";
import {
  mapOnboardingRoleToStaffInviteRole,
  normalizeStaffInviteInputRole,
} from "@/lib/staff-invites/map-onboarding-role";
import { sendInviteEmailFromResult } from "@/lib/staff-invites/send-invite-email";
import { generateInviteToken, hashInviteToken } from "@/lib/staff-invites/token";
import type { CreateStaffInviteInput, CreateStaffInviteResult } from "@/lib/staff-invites/types";
import {
  isValidStaffInviteEmail,
  normalizeStaffInviteEmail,
} from "@/lib/staff-invites/validate-email";

const INVITE_TTL_DAYS = 14;
const COLLECTION = "restaurant_invites";

export class CreateStaffInviteError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "CreateStaffInviteError";
  }
}

function inviteExpiresAt(now = new Date()): Timestamp {
  const expires = new Date(now);
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS);
  return Timestamp.fromDate(expires);
}

async function resolveRestaurantName(
  db: Firestore,
  restaurantId: string,
  fallback?: string,
): Promise<string> {
  const trimmedFallback = fallback?.trim();
  if (trimmedFallback) return trimmedFallback;
  try {
    const snap = await db.collection("restaurants").doc(restaurantId).get();
    const name = snap.data()?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {
    // noop
  }
  return "Mi restaurante";
}

export type CreateStaffInviteParams = CreateStaffInviteInput & {
  db: Firestore;
  restaurantId: string;
  createdByUid: string;
  createdByRole: string;
  sendEmail?: boolean;
};

export async function createStaffInvite(
  params: CreateStaffInviteParams,
): Promise<CreateStaffInviteResult> {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId) {
    throw new CreateStaffInviteError("MISSING_RESTAURANT_ID", "restaurantId no válido", 400);
  }
  if (!params.createdByUid.trim()) {
    throw new CreateStaffInviteError("MISSING_CREATOR", "Usuario autenticado requerido", 401);
  }
  if (!isOwnerOrAdminRole(params.createdByRole)) {
    throw new CreateStaffInviteError(
      "INVITE_CREATOR_FORBIDDEN",
      "Solo owner o admin puede crear invitaciones",
      403,
    );
  }

  const email = normalizeStaffInviteEmail(params.email);
  if (!isValidStaffInviteEmail(email)) {
    throw new CreateStaffInviteError("INVALID_EMAIL", "Email inválido", 400);
  }

  if (String(params.role).trim().toLowerCase() === "owner") {
    throw new CreateStaffInviteError(
      "INVITE_OWNER_FORBIDDEN",
      "El aprovisionamiento de owners está deshabilitado durante el piloto",
      403,
    );
  }
  const staffRole = normalizeStaffInviteInputRole(params.role);
  if (!staffRole) {
    throw new CreateStaffInviteError(
      "INVITE_ROLE_INVALID",
      "La invitación contiene un rol no permitido",
      400,
    );
  }
  const inviteRole = mapOnboardingRoleToStaffInviteRole(staffRole);
  if (
    inviteRole === "admin" &&
    normalizeAuthorizationRole(params.createdByRole) !== "owner"
  ) {
    throw new CreateStaffInviteError(
      "INVITE_ROLE_ASSIGNMENT_FORBIDDEN",
      "Solo un owner puede invitar a otro admin",
      403,
    );
  }
  const displayName = params.displayName?.trim() || undefined;
  const restaurantName = await resolveRestaurantName(
    params.db,
    restaurantId,
    params.restaurantName,
  );

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = inviteExpiresAt();
  const inviteUrl = buildStaffInviteUrl(token);
  const now = FieldValue.serverTimestamp();

  const stableInviteId = `invite-${hashInviteToken(
    `${restaurantId}\u0000${email}`,
  ).slice(0, 40)}`;
  const stableInviteRef = params.db
    .collection(COLLECTION)
    .doc(stableInviteId);
  const pendingQuery = params.db
    .collection(COLLECTION)
    .where("restaurantId", "==", restaurantId)
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(2);
  const { inviteId, reused } = await params.db.runTransaction(
    async (transaction) => {
      const [pendingSnapshot, stableSnapshot] = await Promise.all([
        transaction.get(pendingQuery),
        transaction.get(stableInviteRef),
      ]);
      if (pendingSnapshot.size > 1) {
        throw new CreateStaffInviteError(
          "INVITE_STATE_AMBIGUOUS",
          "Existe más de una invitación pendiente para este email",
          409,
        );
      }
      if (!pendingSnapshot.empty || stableSnapshot.data()?.status === "pending") {
        throw new CreateStaffInviteError(
          "INVITE_ALREADY_PENDING",
          "Ya existe una invitación pendiente para este email",
          409,
        );
      }
      const targetRef = stableInviteRef;
      const invitePayload = {
        restaurantId,
        email,
        status: "pending",
        createdAt: now,
        restaurantName,
        displayName: displayName ?? null,
        role: inviteRole,
        staffRole,
        tokenHash,
        updatedAt: now,
        expiresAt,
        createdByUid: params.createdByUid,
        invitedBy: params.createdByUid,
      };
      if (stableSnapshot.exists) {
        transaction.set(
          targetRef,
          {
            ...invitePayload,
            acceptedAt: FieldValue.delete(),
            acceptedByUid: FieldValue.delete(),
            cancelledAt: FieldValue.delete(),
            cancelledByUid: FieldValue.delete(),
            inviteUrl: FieldValue.delete(),
          },
          { merge: true },
        );
      } else {
        transaction.set(targetRef, invitePayload);
      }
      return { inviteId: targetRef.id, reused: stableSnapshot.exists };
    },
  );

  const result: CreateStaffInviteResult = {
    inviteId,
    status: "pending",
    inviteUrl,
    email,
    displayName,
    role: inviteRole,
    staffRole,
    reused,
    expiresAt: expiresAt.toDate().toISOString(),
  };

  if (params.sendEmail !== false) {
    await sendInviteEmailFromResult(result, restaurantName);
  }

  return result;
}
