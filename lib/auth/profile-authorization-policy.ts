export type CanonicalHostlyRole =
  | "owner"
  | "admin"
  | "manager"
  | "waiter"
  | "kitchen"
  | "viewer";

export type ProfileAuthorizationIssue =
  | "PROFILE_CANONICAL_MISSING"
  | "PROFILE_MIRROR_REVIEW_REQUIRED"
  | "PROFILE_UID_MISMATCH"
  | "PROFILE_EMAIL_MISSING"
  | "PROFILE_EMAIL_MISMATCH"
  | "PROFILE_TENANT_MISSING"
  | "PROFILE_TENANT_CONFLICT"
  | "PROFILE_ROLE_MISSING"
  | "PROFILE_ROLE_INVALID"
  | "PROFILE_ROLE_CONFLICT"
  | "PROFILE_STATUS_INVALID"
  | "PROFILE_STATUS_CONFLICT"
  | "PROFILE_DISABLED"
  | "PROFILE_RESTAURANT_IDS_CONFLICT"
  | "PROFILE_PERMISSIONS_CONFLICT"
  | "PROFILE_CAPABILITIES_CONFLICT";

export type AuthorizedProfile = {
  uid: string;
  email: string;
  restaurantId: string;
  restaurantName: string | null;
  rawRole: string;
  role: CanonicalHostlyRole;
  status: "active" | "disabled";
  isActive: boolean;
};

export type ProfileAuthorizationResult =
  | { ok: true; profile: AuthorizedProfile }
  | { ok: false; issue: ProfileAuthorizationIssue };

function own(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeProfileEmail(value: unknown): string {
  return text(value).toLowerCase();
}

export function normalizeAuthorizationRole(
  value: unknown,
): CanonicalHostlyRole | null {
  const role = text(value).toLowerCase();
  switch (role) {
    case "owner":
    case "propietario":
      return "owner";
    case "admin":
    case "administrator":
      return "admin";
    case "manager":
    case "gerente":
    case "encargado":
      return "manager";
    case "staff":
    case "operativo":
    case "operational":
    case "employee":
    case "empleado":
    case "waiter":
    case "camarero":
    case "camarera":
    case "staff_tpv":
      return "waiter";
    case "kitchen":
    case "cocina":
    case "cook":
      return "kitchen";
    case "viewer":
    case "readonly":
    case "read_only":
      return "viewer";
    default:
      return null;
  }
}

export function normalizeProfileStatus(
  data: Record<string, unknown>,
): "active" | "disabled" | "invalid" {
  if (!own(data, "status") || data.status == null || text(data.status) === "") {
    return "invalid";
  }
  const status = text(data.status).toLowerCase();
  if (status === "active" || status === "enabled") return "active";
  if (
    status === "disabled" ||
    status === "inactive" ||
    status === "blocked" ||
    status === "suspended" ||
    status === "deactivated"
  ) {
    return "disabled";
  }
  return "invalid";
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function optionalFieldMatches(
  canonical: Record<string, unknown>,
  mirror: Record<string, unknown>,
  key: string,
): boolean {
  const canonicalHas = own(canonical, key);
  const mirrorHas = own(mirror, key);
  if (!canonicalHas && !mirrorHas) return true;
  if (canonicalHas !== mirrorHas) return false;
  return JSON.stringify(stableValue(canonical[key])) === JSON.stringify(stableValue(mirror[key]));
}

export function evaluateProfileAuthorization(input: {
  uid: string;
  email?: string | null;
  canonical: Record<string, unknown> | null;
  mirror: Record<string, unknown> | null;
  allowDisabled?: boolean;
}): ProfileAuthorizationResult {
  const uid = input.uid.trim();
  if (!input.canonical) return { ok: false, issue: "PROFILE_CANONICAL_MISSING" };
  if (!input.mirror) return { ok: false, issue: "PROFILE_MIRROR_REVIEW_REQUIRED" };

  const canonical = input.canonical;
  const mirror = input.mirror;
  const canonicalUid = text(canonical.uid) || uid;
  const mirrorUid = text(mirror.uid) || uid;
  if (!uid || canonicalUid !== uid || mirrorUid !== uid || canonicalUid !== mirrorUid) {
    return { ok: false, issue: "PROFILE_UID_MISMATCH" };
  }

  const canonicalEmail = normalizeProfileEmail(canonical.email);
  const mirrorEmail = normalizeProfileEmail(mirror.email);
  if (!canonicalEmail || !mirrorEmail) {
    return { ok: false, issue: "PROFILE_EMAIL_MISSING" };
  }
  if (
    canonicalEmail !== mirrorEmail ||
    (input.email && canonicalEmail !== normalizeProfileEmail(input.email))
  ) {
    return { ok: false, issue: "PROFILE_EMAIL_MISMATCH" };
  }

  const canonicalRestaurantId = text(canonical.restaurantId);
  const mirrorRestaurantId = text(mirror.restaurantId);
  if (!canonicalRestaurantId || !mirrorRestaurantId) {
    return { ok: false, issue: "PROFILE_TENANT_MISSING" };
  }
  if (canonicalRestaurantId !== mirrorRestaurantId) {
    return { ok: false, issue: "PROFILE_TENANT_CONFLICT" };
  }

  const canonicalRawRole = text(canonical.role).toLowerCase();
  const mirrorRawRole = text(mirror.role).toLowerCase();
  if (!canonicalRawRole || !mirrorRawRole) {
    return { ok: false, issue: "PROFILE_ROLE_MISSING" };
  }
  const canonicalRole = normalizeAuthorizationRole(canonicalRawRole);
  const mirrorRole = normalizeAuthorizationRole(mirrorRawRole);
  if (!canonicalRole || !mirrorRole) {
    return { ok: false, issue: "PROFILE_ROLE_INVALID" };
  }
  if (canonicalRole !== mirrorRole) {
    return { ok: false, issue: "PROFILE_ROLE_CONFLICT" };
  }

  const canonicalStatus = normalizeProfileStatus(canonical);
  const mirrorStatus = normalizeProfileStatus(mirror);
  if (canonicalStatus === "invalid" || mirrorStatus === "invalid") {
    return { ok: false, issue: "PROFILE_STATUS_INVALID" };
  }
  if (canonicalStatus !== mirrorStatus) {
    return { ok: false, issue: "PROFILE_STATUS_CONFLICT" };
  }
  if (canonicalStatus !== "active" && !input.allowDisabled) {
    return {
      ok: false,
      issue: canonicalStatus === "disabled" ? "PROFILE_DISABLED" : "PROFILE_STATUS_INVALID",
    };
  }

  if (!optionalFieldMatches(canonical, mirror, "restaurantIds")) {
    return { ok: false, issue: "PROFILE_RESTAURANT_IDS_CONFLICT" };
  }
  if (!optionalFieldMatches(canonical, mirror, "permissions")) {
    return { ok: false, issue: "PROFILE_PERMISSIONS_CONFLICT" };
  }
  if (!optionalFieldMatches(canonical, mirror, "capabilities")) {
    return { ok: false, issue: "PROFILE_CAPABILITIES_CONFLICT" };
  }
  return {
    ok: true,
    profile: {
      uid,
      email: canonicalEmail,
      restaurantId: canonicalRestaurantId,
      restaurantName: text(canonical.restaurantName) || null,
      rawRole: canonicalRawRole,
      role: canonicalRole,
      status: canonicalStatus,
      isActive: canonicalStatus === "active",
    },
  };
}
