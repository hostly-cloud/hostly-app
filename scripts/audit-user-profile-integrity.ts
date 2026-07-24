import { applicationDefault, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, type Timestamp } from "firebase-admin/firestore";
import {
  evaluateProfileAuthorization,
  normalizeAuthorizationRole,
  normalizeProfileStatus,
} from "@/lib/auth/profile-authorization-policy";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";

if (!process.argv.includes("--confirm-read-only")) {
  throw new Error("Añade --confirm-read-only para confirmar una auditoría sin escrituras");
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
  throw new Error("GOOGLE_APPLICATION_CREDENTIALS es obligatorio");
}
const projectId =
  process.env.GCLOUD_PROJECT?.trim() ||
  process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
  process.env.FIREBASE_PROJECT_ID?.trim();
if (!projectId) {
  throw new Error("Define FIREBASE_PROJECT_ID explícitamente");
}

const app = initializeApp(
  { credential: applicationDefault(), projectId },
  "hostly-profile-read-only-audit",
);
const db = getFirestore(app);

type Finding =
  | "canonical_missing"
  | "mirror_missing"
  | "tenant_mismatch"
  | "role_mismatch"
  | "email_mismatch"
  | "status_mismatch"
  | "authorization_invalid"
  | "owner_or_admin"
  | "multiple_restaurant_ids"
  | "status_missing"
  | "status_disabled"
  | "historical_staff_profile"
  | "unknown_role"
  | "managerial_access_removed"
  | "unexpected_permissions"
  | "unexpected_capabilities"
  | "invite_pending_without_token"
  | "invite_expired"
  | "invite_creator_invalid";

const findings = new Map<Finding, string[]>();
function record(type: Finding, id: string) {
  const entries = findings.get(type) ?? [];
  entries.push(id);
  findings.set(type, entries);
}

function data(
  map: Map<string, Record<string, unknown>>,
  id: string,
): Record<string, unknown> | null {
  return map.get(id) ?? null;
}

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function timestampMillis(value: unknown): number {
  return value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as Timestamp).toMillis === "function"
    ? (value as Timestamp).toMillis()
    : 0;
}

const [usersSnapshot, mirrorsSnapshot, invitesSnapshot] = await Promise.all([
  db.collection("users").get(),
  db.collection("usuarios").get(),
  db.collection("restaurant_invites").get(),
]);
const users = new Map(
  usersSnapshot.docs.map((document) => [
    document.id,
    document.data() as Record<string, unknown>,
  ]),
);
const mirrors = new Map(
  mirrorsSnapshot.docs.map((document) => [
    document.id,
    document.data() as Record<string, unknown>,
  ]),
);

for (const uid of new Set([...users.keys(), ...mirrors.keys()])) {
  const canonical = data(users, uid);
  const mirror = data(mirrors, uid);
  if (!canonical) record("canonical_missing", uid);
  if (!mirror) record("mirror_missing", uid);
  if (!canonical || !mirror) continue;

  if (canonical.restaurantId !== mirror.restaurantId) {
    record("tenant_mismatch", uid);
  }
  if (normalizedText(canonical.role) !== normalizedText(mirror.role)) {
    record("role_mismatch", uid);
  }
  if (normalizedText(canonical.email) !== normalizedText(mirror.email)) {
    record("email_mismatch", uid);
  }
  if (normalizeProfileStatus(canonical) !== normalizeProfileStatus(mirror)) {
    record("status_mismatch", uid);
  }
  const authorization = evaluateProfileAuthorization({
    uid,
    canonical,
    mirror,
    allowDisabled: true,
  });
  if (!authorization.ok) record("authorization_invalid", uid);
  if (serverRoleHasCapability(canonical.role, "users.manage")) {
    record("owner_or_admin", uid);
  }
  const rawRole = normalizedText(canonical.role);
  if (!normalizeAuthorizationRole(rawRole)) {
    record("unknown_role", uid);
  }
  if (rawRole === "staff") {
    record("historical_staff_profile", uid);
    record("managerial_access_removed", uid);
  }
  const restaurantIds = canonical.restaurantIds;
  if (
    (Array.isArray(restaurantIds) && restaurantIds.length > 1) ||
    (restaurantIds &&
      typeof restaurantIds === "object" &&
      Object.keys(restaurantIds as Record<string, unknown>).length > 1)
  ) {
    record("multiple_restaurant_ids", uid);
  }
  if (!Object.prototype.hasOwnProperty.call(canonical, "status")) {
    record("status_missing", uid);
  } else if (normalizeProfileStatus(canonical) === "invalid") {
    record("status_missing", uid);
  } else if (normalizeProfileStatus(canonical) === "disabled") {
    record("status_disabled", uid);
  }
  if (Object.prototype.hasOwnProperty.call(canonical, "permissions")) {
    record("unexpected_permissions", uid);
  }
  if (Object.prototype.hasOwnProperty.call(canonical, "capabilities")) {
    record("unexpected_capabilities", uid);
  }
}

for (const inviteDocument of invitesSnapshot.docs) {
  const invite = inviteDocument.data() as Record<string, unknown>;
  if (normalizedText(invite.status) !== "pending") continue;
  if (!normalizedText(invite.tokenHash)) {
    record("invite_pending_without_token", inviteDocument.id);
  }
  if (timestampMillis(invite.expiresAt) <= Date.now()) {
    record("invite_expired", inviteDocument.id);
  }
  const creatorUid = normalizedText(invite.createdByUid);
  const creator = creatorUid ? data(users, creatorUid) : null;
  const creatorMirror = creatorUid ? data(mirrors, creatorUid) : null;
  const creatorAuthorization =
    creator && creatorMirror
      ? evaluateProfileAuthorization({
          uid: creatorUid,
          canonical: creator,
          mirror: creatorMirror,
        })
      : null;
  if (
    !creatorAuthorization?.ok ||
    creatorAuthorization.profile.restaurantId !== invite.restaurantId ||
    !serverRoleHasCapability(
      creatorAuthorization.profile.rawRole,
      "users.manage",
    )
  ) {
    record("invite_creator_invalid", inviteDocument.id);
  }
}

const report = Object.fromEntries(
  [...findings.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, ids]) => [type, { count: ids.length, documentIds: ids }]),
);
console.log(
  JSON.stringify(
    {
      mode: "read-only",
      projectId,
      scanned: {
        users: usersSnapshot.size,
        usuarios: mirrorsSnapshot.size,
        invites: invitesSnapshot.size,
      },
      findings: report,
    },
    null,
    2,
  ),
);

await deleteApp(app);
