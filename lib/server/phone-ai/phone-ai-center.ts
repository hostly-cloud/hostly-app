import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { PhoneAiTurn } from "@/lib/phone-ai/intent";

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
    fallbackPhone: clean(data.fallbackPhone, 32),
  };
}

export async function savePhoneAiSettings(db: Firestore, restaurantId: string, input: Record<string, unknown>): Promise<PhoneAiSettings> {
  const current = await readPhoneAiSettings(db, restaurantId);
  const next = {
    enabled: input.enabled === true && current.provisioningStatus === "verified",
    provider: "twilio",
    incomingNumber: current.incomingNumber,
    provisioningStatus: current.provisioningStatus,
    language: clean(input.language, 16) || current.language,
    fallbackPhone: clean(input.fallbackPhone, 32),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await db.collection("restaurants").doc(restaurantId).collection("integrations").doc("phoneAi").set(next, { merge: true });
  return readPhoneAiSettings(db, restaurantId);
}

export async function resolveRestaurantForIncomingNumber(db: Firestore, incomingNumber: string): Promise<{ restaurantId: string; settings: PhoneAiSettings } | null> {
  const snap = await db.collectionGroup("integrations").where("provider", "==", "twilio").where("incomingNumber", "==", incomingNumber).where("provisioningStatus", "==", "verified").limit(2).get();
  if (snap.size !== 1) return null;
  const doc = snap.docs[0];
  const restaurantId = doc.ref.parent.parent?.id ?? "";
  if (!restaurantId) return null;
  const settings = await readPhoneAiSettings(db, restaurantId);
  return settings.enabled ? { restaurantId, settings } : null;
}

export type PhoneAiSession = {
  restaurantId: string;
  callSid: string;
  callerPhone: string;
  turns: number;
  reservation?: PhoneAiTurn["reservation"];
  reservationId?: string;
};

export async function readPhoneAiSession(db: Firestore, restaurantId: string, callSid: string): Promise<PhoneAiSession | null> {
  const snap = await db.collection("restaurants").doc(restaurantId).collection("phoneAiCalls").doc(callSid).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    restaurantId,
    callSid,
    callerPhone: clean(data.callerPhone, 32),
    turns: Math.max(0, Math.round(Number(data.turns) || 0)),
    ...(data.reservation && typeof data.reservation === "object" ? { reservation: data.reservation as PhoneAiTurn["reservation"] } : {}),
    ...(clean(data.reservationId, 160) ? { reservationId: clean(data.reservationId, 160) } : {}),
  };
}

export async function upsertPhoneAiSession(db: Firestore, session: PhoneAiSession): Promise<void> {
  await db.collection("restaurants").doc(session.restaurantId).collection("phoneAiCalls").doc(session.callSid).set({
    restaurantId: session.restaurantId,
    callSid: session.callSid,
    callerPhone: session.callerPhone,
    turns: session.turns,
    reservation: session.reservation ?? null,
    reservationId: session.reservationId ?? null,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
