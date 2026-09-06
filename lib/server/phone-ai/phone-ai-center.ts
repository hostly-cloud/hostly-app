import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { PhoneAiTurn } from "@/lib/phone-ai/intent";
import { normalizePhoneNumber } from "@/lib/phone-ai/twilio";

export type PhoneAiSettings = {
  enabled: boolean;
  provider: "twilio";
  incomingNumber: string;
  provisioningStatus: "unconfigured" | "pending" | "verified";
  language: string;
  fallbackPhone: string;
};

const DEFAULTS: PhoneAiSettings = {
  enabled: false,
  provider: "twilio",
  incomingNumber: "",
  provisioningStatus: "unconfigured",
  language: "es-ES",
  fallbackPhone: "",
};

function clean(value: unknown, max = 160): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function phoneAiNumberMappingId(incomingNumber: string): string {
  return createHash("sha256").update(incomingNumber).digest("hex");
}

export function phoneAiReservationId(restaurantId: string, callSid: string): string {
  return `phone_${createHash("sha256").update(`${restaurantId}:${callSid}`).digest("hex").slice(0, 40)}`;
}

export async function readPhoneAiSettings(db: Firestore, restaurantId: string): Promise<PhoneAiSettings> {
  const snap = await db.collection("restaurants").doc(restaurantId).collection("integrations").doc("phoneAi").get();
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const status = data.provisioningStatus === "verified" || data.provisioningStatus === "pending" ? data.provisioningStatus : "unconfigured";
  return {
    enabled: data.enabled === true && status === "verified",
    provider: "twilio",
    incomingNumber: clean(data.incomingNumber, 32),
    provisioningStatus: status,
    language: clean(data.language, 16) || DEFAULTS.language,
    fallbackPhone: normalizePhoneNumber(data.fallbackPhone),
  };
}

export async function savePhoneAiSettings(db: Firestore, restaurantId: string, input: Record<string, unknown>): Promise<PhoneAiSettings> {
  const current = await readPhoneAiSettings(db, restaurantId);
  const requestedFallbackPhone = input.fallbackPhone === undefined ? current.fallbackPhone : normalizePhoneNumber(input.fallbackPhone);
  if (input.fallbackPhone !== undefined && clean(input.fallbackPhone, 32) && !requestedFallbackPhone) {
    throw new Error("INVALID_FALLBACK_PHONE");
  }
  const next = {
    enabled: input.enabled === true && current.provisioningStatus === "verified",
    provider: "twilio",
    incomingNumber: current.incomingNumber,
    provisioningStatus: current.provisioningStatus,
    language: clean(input.language, 16) || current.language,
    fallbackPhone: requestedFallbackPhone,
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection("restaurants").doc(restaurantId).collection("integrations").doc("phoneAi").set(next, { merge: true });
  return readPhoneAiSettings(db, restaurantId);
}

export async function resolveRestaurantForIncomingNumber(db: Firestore, incomingNumber: string): Promise<{ restaurantId: string; settings: PhoneAiSettings } | null> {
  const mapping = await db.collection("_phoneAiNumberMappings").doc(phoneAiNumberMappingId(incomingNumber)).get();
  if (!mapping.exists) return null;
  const restaurantId = clean(mapping.data()?.restaurantId, 120);
  if (!restaurantId || mapping.data()?.verified !== true) return null;
  const settings = await readPhoneAiSettings(db, restaurantId);
  if (!settings.enabled || settings.incomingNumber !== incomingNumber || settings.provisioningStatus !== "verified") return null;
  return { restaurantId, settings };
}

export type PhoneAiSession = {
  restaurantId: string;
  callSid: string;
  callerPhone: string;
  turns: number;
  reservation?: PhoneAiTurn["reservation"];
  reservationId?: string;
  reservationCreationState?: "creating" | "created" | "failed";
};

function sessionRef(db: Firestore, restaurantId: string, callSid: string) {
  return db.collection("restaurants").doc(restaurantId).collection("phoneAiCalls").doc(callSid);
}

export async function readPhoneAiSession(db: Firestore, restaurantId: string, callSid: string): Promise<PhoneAiSession | null> {
  const snap = await sessionRef(db, restaurantId, callSid).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const rawState = clean(data.reservationCreationState, 16);
  const reservationCreationState = rawState === "creating" || rawState === "created" || rawState === "failed" ? rawState : undefined;
  return {
    restaurantId,
    callSid,
    callerPhone: clean(data.callerPhone, 32),
    turns: Math.max(0, Math.round(Number(data.turns) || 0)),
    ...(data.reservation && typeof data.reservation === "object" ? { reservation: data.reservation as PhoneAiTurn["reservation"] } : {}),
    ...(clean(data.reservationId, 160) ? { reservationId: clean(data.reservationId, 160) } : {}),
    ...(reservationCreationState ? { reservationCreationState } : {}),
  };
}

export async function createPhoneAiSessionIfAbsent(db: Firestore, session: PhoneAiSession): Promise<PhoneAiSession> {
  const ref = sessionRef(db, session.restaurantId, session.callSid);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return;
    tx.create(ref, {
      restaurantId: session.restaurantId,
      callSid: session.callSid,
      callerPhone: session.callerPhone,
      turns: session.turns,
      reservation: session.reservation ?? null,
      reservationId: session.reservationId ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return (await readPhoneAiSession(db, session.restaurantId, session.callSid)) ?? session;
}

export async function updatePhoneAiSession(db: Firestore, session: PhoneAiSession): Promise<void> {
  await sessionRef(db, session.restaurantId, session.callSid).update({
    restaurantId: session.restaurantId,
    callSid: session.callSid,
    callerPhone: session.callerPhone,
    turns: session.turns,
    reservation: session.reservation ?? null,
    ...(session.reservationId !== undefined ? { reservationId: session.reservationId } : {}),
    ...(session.reservationCreationState !== undefined ? { reservationCreationState: session.reservationCreationState } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export type PhoneAiReservationClaim =
  | { status: "claimed"; reservationId: string }
  | { status: "created"; reservationId: string }
  | { status: "busy"; reservationId: string };

export async function claimPhoneAiReservationCreation(args: {
  db: Firestore;
  restaurantId: string;
  callSid: string;
  leaseMs?: number;
}): Promise<PhoneAiReservationClaim> {
  const ref = sessionRef(args.db, args.restaurantId, args.callSid);
  const reservationId = phoneAiReservationId(args.restaurantId, args.callSid);
  const leaseMs = Math.max(5_000, args.leaseMs ?? 30_000);
  return args.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("PHONE_AI_SESSION_NOT_FOUND");
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const storedReservationId = clean(data.reservationId, 160) || reservationId;
    if (data.reservationCreationState === "created" || clean(data.reservationId, 160)) {
      return { status: "created" as const, reservationId: storedReservationId };
    }
    const leaseUntil = data.reservationCreationLeaseUntil instanceof Timestamp ? data.reservationCreationLeaseUntil.toMillis() : 0;
    if (data.reservationCreationState === "creating" && leaseUntil > Date.now()) {
      return { status: "busy" as const, reservationId: storedReservationId };
    }
    tx.update(ref, {
      reservationCreationState: "creating",
      reservationCreationLeaseUntil: Timestamp.fromMillis(Date.now() + leaseMs),
      reservationCandidateId: reservationId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { status: "claimed" as const, reservationId };
  });
}

export async function completePhoneAiReservationCreation(args: {
  db: Firestore;
  restaurantId: string;
  callSid: string;
  reservationId: string;
}): Promise<void> {
  await sessionRef(args.db, args.restaurantId, args.callSid).update({
    reservationId: args.reservationId,
    reservationCreationState: "created",
    reservationCreationLeaseUntil: FieldValue.delete(),
    reservationCandidateId: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function failPhoneAiReservationCreation(args: {
  db: Firestore;
  restaurantId: string;
  callSid: string;
}): Promise<void> {
  await sessionRef(args.db, args.restaurantId, args.callSid).update({
    reservationCreationState: "failed",
    reservationCreationLeaseUntil: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
