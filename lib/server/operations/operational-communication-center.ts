import type { Firestore } from "firebase-admin/firestore";
import {
  DEFAULT_OPERATIONAL_COMMUNICATION_POLICY,
  sanitizeOperationalCommunicationPolicy,
  type OperationalCommunicationPolicy,
} from "@/lib/operations/operational-communications";

export type OperationalCommunicationDeliverySummary = {
  id: string;
  incidentId: string;
  stage: string;
  channel: string;
  recipientId: string;
  status: string;
  terminal: boolean;
  attemptCount: number;
  sentAtMs: number | null;
  updatedAtMs: number;
  errorCode: string | null;
};

function settingsRef(db: Firestore, restaurantId: string) {
  return db.doc(`restaurants/${restaurantId}/operationalSettings/communications`);
}

function deliveriesRef(db: Firestore, restaurantId: string) {
  return db.collection(`restaurants/${restaurantId}/operationalNotificationDeliveries`);
}

export async function readOperationalCommunicationPolicy(
  db: Firestore,
  restaurantId: string,
): Promise<OperationalCommunicationPolicy> {
  const snapshot = await settingsRef(db, restaurantId).get();
  return snapshot.exists
    ? sanitizeOperationalCommunicationPolicy(snapshot.data())
    : DEFAULT_OPERATIONAL_COMMUNICATION_POLICY;
}

export async function saveOperationalCommunicationPolicy(
  db: Firestore,
  restaurantId: string,
  value: unknown,
  userId: string,
): Promise<OperationalCommunicationPolicy> {
  const policy = sanitizeOperationalCommunicationPolicy(value);
  const nowMs = Date.now();
  await settingsRef(db, restaurantId).set({
    ...policy,
    restaurantId,
    updatedAtMs: nowMs,
    updatedBy: userId,
  }, { merge: true });
  return policy;
}

export async function readOperationalCommunicationHistory(
  db: Firestore,
  restaurantId: string,
  limit = 50,
): Promise<OperationalCommunicationDeliverySummary[]> {
  const snapshot = await deliveriesRef(db, restaurantId)
    .orderBy("updatedAtMs", "desc")
    .limit(Math.max(1, Math.min(100, Math.floor(limit))))
    .get();
  return snapshot.docs.map((document) => {
    const data = document.data() as Record<string, unknown>;
    return {
      id: document.id,
      incidentId: String(data.incidentId ?? ""),
      stage: String(data.stage ?? ""),
      channel: String(data.channel ?? ""),
      recipientId: String(data.recipientId ?? ""),
      status: String(data.status ?? ""),
      terminal: data.terminal === true,
      attemptCount: Math.max(0, Number(data.attemptCount) || 0),
      sentAtMs: data.sentAtMs == null ? null : Number(data.sentAtMs) || null,
      updatedAtMs: Number(data.updatedAtMs) || 0,
      errorCode: typeof data.errorCode === "string" ? data.errorCode : null,
    };
  });
}
