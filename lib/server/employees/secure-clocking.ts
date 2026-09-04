import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type Firestore,
} from "firebase-admin/firestore";
import { assertAuthorizedProfileSnapshots } from "@/lib/server/auth/authorized-profile";
import { normalizeAuthorizationRole } from "@/lib/auth/profile-authorization-policy";
import {
  applyClockAction,
  EmployeeOperationsError,
} from "@/lib/server/employees/employee-operations";
import { listManagedRestaurantUsers } from "@/lib/server/users/manage-restaurant-users";
import type { ClockAction, TimeEntryStatus } from "@/lib/employees/types";

const CLOCK_BUCKET_MS = 30_000;
const PIN_LOCK_MS = 15 * 60_000;
const DEFAULT_RADIUS_METERS = 120;
const DEFAULT_MAX_ACCURACY_METERS = 180;

export type ClockingConfigView = {
  enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  maxAccuracyMeters: number;
  locationConfigured: boolean;
  networkConfigured: boolean;
  qrRefreshSeconds: number;
};

export type ClockingEmployeeState = {
  id: string;
  displayName: string;
  email?: string;
  role?: string;
  status?: string;
  pinConfigured: boolean;
  clockStatus: TimeEntryStatus | "not_started";
};

export class SecureClockingError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus = 400,
  ) {
    super(code);
    this.name = "SecureClockingError";
  }
}

function root(db: Firestore, restaurantId: string) {
  return db.collection("restaurants").doc(restaurantId);
}

function configRef(db: Firestore, restaurantId: string) {
  return root(db, restaurantId).collection("employeeClocking").doc("config");
}

function cleanText(value: unknown, maxLength = 256): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getConfigValue(data: DocumentData | undefined) {
  const latitude = Number(data?.latitude);
  const longitude = Number(data?.longitude);
  return {
    enabled: data?.enabled !== false,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    radiusMeters: clampNumber(
      data?.radiusMeters,
      30,
      500,
      DEFAULT_RADIUS_METERS,
    ),
    maxAccuracyMeters: clampNumber(
      data?.maxAccuracyMeters,
      30,
      500,
      DEFAULT_MAX_ACCURACY_METERS,
    ),
    qrSecret: cleanText(data?.qrSecret, 256),
    trustedNetworkHash: cleanText(data?.trustedNetworkHash, 128),
  };
}

function viewConfig(data: DocumentData | undefined): ClockingConfigView {
  const parsed = getConfigValue(data);
  return {
    enabled: parsed.enabled,
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    radiusMeters: parsed.radiusMeters,
    maxAccuracyMeters: parsed.maxAccuracyMeters,
    locationConfigured: parsed.latitude !== null && parsed.longitude !== null,
    networkConfigured: Boolean(parsed.trustedNetworkHash),
    qrRefreshSeconds: CLOCK_BUCKET_MS / 1000,
  };
}

async function ensureStoredConfig(db: Firestore, restaurantId: string) {
  const ref = configRef(db, restaurantId);
  const snap = await ref.get();
  const existing = getConfigValue(snap.exists ? snap.data() : undefined);
  if (existing.qrSecret) return { ref, data: existing };
  const qrSecret = randomBytes(32).toString("base64url");
  await ref.set(
    {
      enabled: existing.enabled,
      radiusMeters: existing.radiusMeters,
      maxAccuracyMeters: existing.maxAccuracyMeters,
      qrSecret,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { ref, data: { ...existing, qrSecret } };
}

function normalizeIp(value: string | null | undefined): string {
  if (!value) return "";
  const first = value.split(",")[0]?.trim() ?? "";
  return first.startsWith("::ffff:") ? first.slice(7) : first;
}

function hashNetwork(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export function requestIpFromHeaders(headers: Headers): string {
  return normalizeIp(
    headers.get("x-forwarded-for") ||
      headers.get("x-real-ip") ||
      headers.get("cf-connecting-ip"),
  );
}

function networkMatchFor(config: ReturnType<typeof getConfigValue>, ip: string) {
  if (!config.trustedNetworkHash || !ip) return null;
  return timingSafeEqual(
    Buffer.from(config.trustedNetworkHash, "utf8"),
    Buffer.from(hashNetwork(ip), "utf8"),
  );
}

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function positionForRole(role: unknown) {
  const normalized = normalizeAuthorizationRole(role);
  if (normalized === "manager") return "manager";
  if (normalized === "waiter") return "waiter";
  if (normalized === "kitchen") return "kitchen";
  return "other";
}

async function readRestaurantUser(
  db: Firestore,
  restaurantId: string,
  userId: string,
) {
  const [canonical, mirror] = await db.getAll(
    db.collection("users").doc(userId),
    db.collection("usuarios").doc(userId),
  );
  const profile = assertAuthorizedProfileSnapshots({
    uid: userId,
    canonicalSnapshot: canonical,
    mirrorSnapshot: mirror,
  });
  if (profile.restaurantId !== restaurantId) {
    throw new SecureClockingError("EMPLOYEE_TENANT_MISMATCH", 403);
  }
  const data = canonical.data() as Record<string, unknown>;
  const displayName =
    cleanText(data.displayName, 160) ||
    cleanText(data.nombre, 160) ||
    profile.email.split("@")[0] ||
    "Empleado";
  return {
    displayName,
    email: profile.email,
    role: profile.rawRole,
  };
}

async function ensureEmployeeProfile(
  db: Firestore,
  restaurantId: string,
  userId: string,
) {
  const user = await readRestaurantUser(db, restaurantId, userId);
  await root(db, restaurantId)
    .collection("employees")
    .doc(userId)
    .set(
      {
        userId,
        displayName: user.displayName,
        email: user.email,
        position: positionForRole(user.role),
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  return user;
}

function openStatus(data: DocumentData | undefined): TimeEntryStatus | "not_started" {
  if (!data || data.status === "completed") return "not_started";
  return data.status === "on_break" ? "on_break" : "working";
}

async function latestEntryForEmployee(
  db: Firestore,
  restaurantId: string,
  employeeId: string,
) {
  const snapshot = await root(db, restaurantId)
    .collection("timeEntries")
    .where("employeeId", "==", employeeId)
    .where("workDate", "==", todayMadrid())
    .limit(10)
    .get();
  return snapshot.docs
    .map((doc) => ({ doc, data: doc.data() }))
    .sort((left, right) => {
      const l = left.data.clockInAt instanceof Timestamp ? left.data.clockInAt.toMillis() : 0;
      const r = right.data.clockInAt instanceof Timestamp ? right.data.clockInAt.toMillis() : 0;
      return r - l;
    })[0];
}

function expectedActions(status: TimeEntryStatus | "not_started"): ClockAction[] {
  if (status === "not_started") return ["clock_in"];
  if (status === "on_break") return ["break_end", "clock_out"];
  return ["break_start", "clock_out"];
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function verifyLocation(
  config: ReturnType<typeof getConfigValue>,
  latitudeValue: unknown,
  longitudeValue: unknown,
  accuracyValue: unknown,
) {
  if (config.latitude === null || config.longitude === null) {
    throw new SecureClockingError("CLOCK_LOCATION_NOT_CONFIGURED", 409);
  }
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const accuracy = Number(accuracyValue);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  ) {
    throw new SecureClockingError("INVALID_GEOLOCATION", 400);
  }
  if (accuracy > config.maxAccuracyMeters) {
    throw new SecureClockingError("LOCATION_ACCURACY_TOO_LOW", 422);
  }
  const distanceMeters = haversineMeters(
    config.latitude,
    config.longitude,
    latitude,
    longitude,
  );
  if (distanceMeters > config.radiusMeters) {
    throw new SecureClockingError("OUTSIDE_RESTAURANT_GEOFENCE", 403);
  }
  return {
    latitude: round(latitude, 4),
    longitude: round(longitude, 4),
    accuracyMeters: round(accuracy),
    distanceMeters: round(distanceMeters),
  };
}

function signBucket(secret: string, restaurantId: string, bucket: number) {
  return createHmac("sha256", secret)
    .update(`${restaurantId}:${bucket}`)
    .digest("base64url");
}

function verifyChallengeToken(
  config: ReturnType<typeof getConfigValue>,
  restaurantId: string,
  tokenValue: unknown,
) {
  const token = cleanText(tokenValue, 256);
  const [bucketRaw, signature] = token.split(".");
  const bucket = Number(bucketRaw);
  if (!Number.isInteger(bucket) || !signature || !config.qrSecret) {
    throw new SecureClockingError("INVALID_CLOCKING_QR", 400);
  }
  const currentBucket = Math.floor(Date.now() / CLOCK_BUCKET_MS);
  if (bucket !== currentBucket && bucket !== currentBucket - 1) {
    throw new SecureClockingError("CLOCKING_QR_EXPIRED", 410);
  }
  const expected = signBucket(config.qrSecret, restaurantId, bucket);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new SecureClockingError("INVALID_CLOCKING_QR", 400);
  }
}

async function appendClockVerification(input: {
  db: Firestore;
  restaurantId: string;
  employeeId: string;
  actorUid: string;
  action: ClockAction;
  method: "qr_geo" | "terminal_pin";
  networkMatch: boolean | null;
  location?: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    distanceMeters: number;
  };
}) {
  const latest = await latestEntryForEmployee(
    input.db,
    input.restaurantId,
    input.employeeId,
  );
  if (!latest) return;
  const at = Timestamp.now();
  const event = {
    action: input.action,
    at,
    actorUid: input.actorUid,
    method: input.method,
    verified: true,
    networkMatch: input.networkMatch,
    ...(input.location
      ? {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          accuracyMeters: input.location.accuracyMeters,
          distanceMeters: input.location.distanceMeters,
        }
      : {}),
  };
  await latest.doc.ref.update({
    clockEvents: FieldValue.arrayUnion(event),
    lastClockVerification: event,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function getClockingSelfState(input: {
  db: Firestore;
  restaurantId: string;
  employeeId: string;
}) {
  const employee = await ensureEmployeeProfile(
    input.db,
    input.restaurantId,
    input.employeeId,
  );
  const [configSnap, latest] = await Promise.all([
    configRef(input.db, input.restaurantId).get(),
    latestEntryForEmployee(input.db, input.restaurantId, input.employeeId),
  ]);
  const status = openStatus(latest?.data);
  const config = viewConfig(configSnap.exists ? configSnap.data() : undefined);
  return {
    employeeId: input.employeeId,
    displayName: employee.displayName,
    status,
    allowedActions: expectedActions(status),
    config: {
      enabled: config.enabled,
      locationConfigured: config.locationConfigured,
      networkConfigured: config.networkConfigured,
    },
  };
}

export async function getClockingAdminState(input: {
  db: Firestore;
  restaurantId: string;
  includeSensitive: boolean;
}) {
  const { data: ensured } = await ensureStoredConfig(input.db, input.restaurantId);
  const [users, pinSnapshot, timeSnapshot] = await Promise.all([
    listManagedRestaurantUsers(input.db, input.restaurantId),
    root(input.db, input.restaurantId).collection("employeeClockPins").get(),
    root(input.db, input.restaurantId)
      .collection("timeEntries")
      .where("workDate", "==", todayMadrid())
      .get(),
  ]);
  const pins = new Set(pinSnapshot.docs.map((doc) => doc.id));
  const stateByEmployee = new Map<string, TimeEntryStatus | "not_started">();
  for (const doc of timeSnapshot.docs) {
    const data = doc.data();
    const employeeId = cleanText(data.employeeId, 128);
    if (!employeeId) continue;
    const next = openStatus(data);
    if (next !== "not_started") stateByEmployee.set(employeeId, next);
    else if (!stateByEmployee.has(employeeId)) stateByEmployee.set(employeeId, next);
  }
  const employees: ClockingEmployeeState[] = users
    .filter((user) => user.status === "active" && !user.reviewRequired)
    .map((user) => ({
      id: user.id,
      displayName: user.displayName || user.email.split("@")[0] || "Empleado",
      ...(input.includeSensitive ? { email: user.email, role: user.role, status: user.status } : {}),
      pinConfigured: pins.has(user.id),
      clockStatus: stateByEmployee.get(user.id) ?? "not_started",
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "es"));
  return {
    config: viewConfig({
      ...ensured,
      qrSecret: undefined,
    }),
    employees,
  };
}

export async function saveClockingConfig(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  latitude: unknown;
  longitude: unknown;
  radiusMeters?: unknown;
  maxAccuracyMeters?: unknown;
  enabled?: unknown;
}) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new SecureClockingError("INVALID_RESTAURANT_LOCATION", 400);
  }
  const { ref } = await ensureStoredConfig(input.db, input.restaurantId);
  await ref.set(
    {
      enabled: input.enabled !== false,
      latitude,
      longitude,
      radiusMeters: clampNumber(
        input.radiusMeters,
        30,
        500,
        DEFAULT_RADIUS_METERS,
      ),
      maxAccuracyMeters: clampNumber(
        input.maxAccuracyMeters,
        30,
        500,
        DEFAULT_MAX_ACCURACY_METERS,
      ),
      updatedBy: input.actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function captureTrustedNetwork(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  ip: string;
}) {
  const ip = normalizeIp(input.ip);
  if (!ip) throw new SecureClockingError("NETWORK_IP_UNAVAILABLE", 422);
  const { ref } = await ensureStoredConfig(input.db, input.restaurantId);
  await ref.set(
    {
      trustedNetworkHash: hashNetwork(ip),
      networkUpdatedBy: input.actorUid,
      networkUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearTrustedNetwork(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
}) {
  const { ref } = await ensureStoredConfig(input.db, input.restaurantId);
  await ref.set(
    {
      trustedNetworkHash: FieldValue.delete(),
      networkUpdatedBy: input.actorUid,
      networkUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

function pinHash(pin: string, salt: string) {
  return scryptSync(pin, salt, 32).toString("hex");
}

export async function setEmployeeClockPin(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  employeeId: unknown;
  pin: unknown;
}) {
  const employeeId = cleanText(input.employeeId, 128);
  const pin = cleanText(input.pin, 12);
  if (!employeeId) throw new SecureClockingError("EMPLOYEE_ID_REQUIRED", 400);
  if (!/^\d{4,6}$/.test(pin)) {
    throw new SecureClockingError("PIN_MUST_BE_4_TO_6_DIGITS", 400);
  }
  await ensureEmployeeProfile(input.db, input.restaurantId, employeeId);
  const salt = randomBytes(16).toString("hex");
  await root(input.db, input.restaurantId)
    .collection("employeeClockPins")
    .doc(employeeId)
    .set({
      salt,
      hash: pinHash(pin, salt),
      failedAttempts: 0,
      lockedUntil: null,
      updatedBy: input.actorUid,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

async function verifyEmployeePin(input: {
  db: Firestore;
  restaurantId: string;
  employeeId: string;
  pin: string;
}) {
  const ref = root(input.db, input.restaurantId)
    .collection("employeeClockPins")
    .doc(input.employeeId);
  const snap = await ref.get();
  if (!snap.exists) throw new SecureClockingError("EMPLOYEE_PIN_NOT_CONFIGURED", 409);
  const data = snap.data() || {};
  const lockedUntil = data.lockedUntil instanceof Timestamp ? data.lockedUntil.toMillis() : 0;
  if (lockedUntil > Date.now()) {
    throw new SecureClockingError("EMPLOYEE_PIN_TEMPORARILY_LOCKED", 429);
  }
  const salt = cleanText(data.salt, 128);
  const storedHash = cleanText(data.hash, 128);
  const actualHash = pinHash(input.pin, salt);
  const valid =
    storedHash.length === actualHash.length &&
    timingSafeEqual(Buffer.from(storedHash), Buffer.from(actualHash));
  if (!valid) {
    const attempts = Math.max(0, Number(data.failedAttempts) || 0) + 1;
    await ref.update({
      failedAttempts: attempts,
      lockedUntil: attempts >= 5 ? Timestamp.fromMillis(Date.now() + PIN_LOCK_MS) : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    throw new SecureClockingError(
      attempts >= 5 ? "EMPLOYEE_PIN_TEMPORARILY_LOCKED" : "INVALID_EMPLOYEE_PIN",
      attempts >= 5 ? 429 : 403,
    );
  }
  await ref.update({
    failedAttempts: 0,
    lockedUntil: null,
    lastUsedAt: FieldValue.serverTimestamp(),
  });
}

export async function createClockingChallenge(input: {
  db: Firestore;
  restaurantId: string;
}) {
  const { data } = await ensureStoredConfig(input.db, input.restaurantId);
  if (!data.enabled) throw new SecureClockingError("CLOCKING_DISABLED", 409);
  if (data.latitude === null || data.longitude === null) {
    throw new SecureClockingError("CLOCK_LOCATION_NOT_CONFIGURED", 409);
  }
  const bucket = Math.floor(Date.now() / CLOCK_BUCKET_MS);
  return {
    token: `${bucket}.${signBucket(data.qrSecret, input.restaurantId, bucket)}`,
    refreshAt: (bucket + 1) * CLOCK_BUCKET_MS,
    expiresAt: (bucket + 2) * CLOCK_BUCKET_MS,
  };
}

export async function performQrClock(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  token: unknown;
  action: ClockAction;
  latitude: unknown;
  longitude: unknown;
  accuracy: unknown;
  ip: string;
}) {
  const { data } = await ensureStoredConfig(input.db, input.restaurantId);
  if (!data.enabled) throw new SecureClockingError("CLOCKING_DISABLED", 409);
  verifyChallengeToken(data, input.restaurantId, input.token);
  const location = verifyLocation(
    data,
    input.latitude,
    input.longitude,
    input.accuracy,
  );
  await ensureEmployeeProfile(input.db, input.restaurantId, input.actorUid);
  try {
    await applyClockAction({
      db: input.db,
      restaurantId: input.restaurantId,
      actorUid: input.actorUid,
      employeeId: input.actorUid,
      action: input.action,
      source: "self",
    });
  } catch (error) {
    if (error instanceof EmployeeOperationsError) {
      throw new SecureClockingError(error.code, error.httpStatus);
    }
    throw error;
  }
  await appendClockVerification({
    db: input.db,
    restaurantId: input.restaurantId,
    employeeId: input.actorUid,
    actorUid: input.actorUid,
    action: input.action,
    method: "qr_geo",
    networkMatch: networkMatchFor(data, input.ip),
    location,
  });
  return getClockingSelfState({
    db: input.db,
    restaurantId: input.restaurantId,
    employeeId: input.actorUid,
  });
}

export async function performTerminalClock(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  employeeId: unknown;
  pin: unknown;
  action: ClockAction;
  ip: string;
}) {
  const role = normalizeAuthorizationRole(input.actorRole);
  if (role !== "owner" && role !== "admin" && role !== "manager") {
    throw new SecureClockingError("CLOCK_TERMINAL_ROLE_REQUIRED", 403);
  }
  const employeeId = cleanText(input.employeeId, 128);
  const pin = cleanText(input.pin, 12);
  if (!employeeId) throw new SecureClockingError("EMPLOYEE_ID_REQUIRED", 400);
  if (!/^\d{4,6}$/.test(pin)) throw new SecureClockingError("INVALID_EMPLOYEE_PIN", 403);
  await ensureEmployeeProfile(input.db, input.restaurantId, employeeId);
  await verifyEmployeePin({
    db: input.db,
    restaurantId: input.restaurantId,
    employeeId,
    pin,
  });
  const { data } = await ensureStoredConfig(input.db, input.restaurantId);
  try {
    await applyClockAction({
      db: input.db,
      restaurantId: input.restaurantId,
      actorUid: input.actorUid,
      employeeId,
      action: input.action,
      source: "manager",
    });
  } catch (error) {
    if (error instanceof EmployeeOperationsError) {
      throw new SecureClockingError(error.code, error.httpStatus);
    }
    throw error;
  }
  await appendClockVerification({
    db: input.db,
    restaurantId: input.restaurantId,
    employeeId,
    actorUid: input.actorUid,
    action: input.action,
    method: "terminal_pin",
    networkMatch: networkMatchFor(data, input.ip),
  });
}
