import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore";
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

async function findPendingInviteForRestaurantEmail(
  db: Firestore,
  restaurantId: string,
  email: string,
) {
  const snap = await db
    .collection(COLLECTION)
    .where("restaurantId", "==", restaurantId)
    .where("email", "==", email)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  return snap.docs[0] ?? null;
}

export type CreateStaffInviteParams = CreateStaffInviteInput & {
  db: Firestore;
  restaurantId: string;
  createdByUid: string;
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

  const email = normalizeStaffInviteEmail(params.email);
  if (!isValidStaffInviteEmail(email)) {
    throw new CreateStaffInviteError("INVALID_EMAIL", "Email inválido", 400);
  }

  const staffRole = normalizeStaffInviteInputRole(params.role);
  const inviteRole = mapOnboardingRoleToStaffInviteRole(staffRole);
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

  const existing = await findPendingInviteForRestaurantEmail(params.db, restaurantId, email);
  let inviteId: string;
  let reused = false;

  if (existing) {
    inviteId = existing.id;
    reused = true;
    await existing.ref.update({
      restaurantName,
      displayName: displayName ?? null,
      role: inviteRole,
      staffRole,
      tokenHash,
      inviteUrl,
      updatedAt: now,
      expiresAt,
      createdByUid: params.createdByUid,
      invitedBy: params.createdByUid,
    });
  } else {
    const ref = params.db.collection(COLLECTION).doc();
    inviteId = ref.id;
    await ref.set({
      restaurantId,
      restaurantName,
      email,
      displayName: displayName ?? null,
      role: inviteRole,
      staffRole,
      status: "pending",
      tokenHash,
      inviteUrl,
      createdByUid: params.createdByUid,
      invitedBy: params.createdByUid,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
  }

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
