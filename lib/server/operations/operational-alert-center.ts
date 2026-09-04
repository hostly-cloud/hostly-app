import type { Firestore } from "firebase-admin/firestore";
import {
  buildOperationalDelayAlerts,
  type OperationalDelayAlert,
  type OperationalOrderRecord,
} from "@/lib/operations/operational-delay-alerts";
import {
  DEFAULT_OPERATIONAL_ALERT_POLICY,
  sanitizeOperationalAlertPolicy,
  type OperationalAlertPolicy,
} from "@/lib/operations/operational-alert-policy";

export type OperationalAlertIncidentStatus = "open" | "acknowledged" | "snoozed" | "resolved" | "auto_resolved";

export type OperationalAlertIncident = {
  id: string;
  restaurantId: string;
  alertId: string;
  orderId: string;
  tableLabel: string;
  station: string;
  stationLabel: string;
  level: string;
  escalated: boolean;
  status: OperationalAlertIncidentStatus;
  startedAtMs: number;
  lastSeenAtMs: number;
  resolvedAtMs?: number | null;
  acknowledgedAtMs?: number | null;
  acknowledgedBy?: string | null;
  snoozedUntilMs?: number | null;
  updatedAtMs: number;
};

export type OperationalAlertCenterAlert = OperationalDelayAlert & {
  incidentId: string;
  incidentStatus: OperationalAlertIncidentStatus;
  snoozedUntilMs: number | null;
};

function settingsRef(db: Firestore, restaurantId: string) {
  return db.doc(`restaurants/${restaurantId}/operationalSettings/alerts`);
}

function incidentsRef(db: Firestore, restaurantId: string) {
  return db.collection(`restaurants/${restaurantId}/operationalAlertIncidents`);
}

function incidentId(alert: OperationalDelayAlert): string {
  return `${alert.orderId}__${alert.station}__${alert.oldestSentAtMs}`.replaceAll("/", "_");
}

function incidentFromData(id: string, data: Record<string, unknown>): OperationalAlertIncident {
  return {
    id,
    restaurantId: String(data.restaurantId ?? ""),
    alertId: String(data.alertId ?? ""),
    orderId: String(data.orderId ?? ""),
    tableLabel: String(data.tableLabel ?? "Sin mesa"),
    station: String(data.station ?? ""),
    stationLabel: String(data.stationLabel ?? ""),
    level: String(data.level ?? "attention"),
    escalated: data.escalated === true,
    status: String(data.status ?? "open") as OperationalAlertIncidentStatus,
    startedAtMs: Number(data.startedAtMs) || 0,
    lastSeenAtMs: Number(data.lastSeenAtMs) || 0,
    resolvedAtMs: data.resolvedAtMs == null ? null : Number(data.resolvedAtMs) || null,
    acknowledgedAtMs: data.acknowledgedAtMs == null ? null : Number(data.acknowledgedAtMs) || null,
    acknowledgedBy: typeof data.acknowledgedBy === "string" ? data.acknowledgedBy : null,
    snoozedUntilMs: data.snoozedUntilMs == null ? null : Number(data.snoozedUntilMs) || null,
    updatedAtMs: Number(data.updatedAtMs) || 0,
  };
}

export async function readOperationalAlertPolicy(db: Firestore, restaurantId: string): Promise<OperationalAlertPolicy> {
  const snapshot = await settingsRef(db, restaurantId).get();
  return snapshot.exists ? sanitizeOperationalAlertPolicy(snapshot.data()) : DEFAULT_OPERATIONAL_ALERT_POLICY;
}

export async function saveOperationalAlertPolicy(
  db: Firestore,
  restaurantId: string,
  value: unknown,
  userId: string,
): Promise<OperationalAlertPolicy> {
  const policy = sanitizeOperationalAlertPolicy(value);
  const now = Date.now();
  await settingsRef(db, restaurantId).set({
    ...policy,
    restaurantId,
    updatedAtMs: now,
    updatedBy: userId,
  }, { merge: true });
  return policy;
}

export async function buildAndSyncOperationalAlertCenter(
  db: Firestore,
  restaurantId: string,
  nowMs = Date.now(),
): Promise<{
  policy: OperationalAlertPolicy;
  alerts: OperationalAlertCenterAlert[];
  history: OperationalAlertIncident[];
}> {
  const [policy, ordersSnapshot] = await Promise.all([
    readOperationalAlertPolicy(db, restaurantId),
    db.collection("orders").where("restaurantId", "==", restaurantId).get(),
  ]);
  const orders: OperationalOrderRecord[] = ordersSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<OperationalOrderRecord, "id">),
  }));
  const rawAlerts = buildOperationalDelayAlerts({ orders, restaurantId, nowMs, policy });
  const collection = incidentsRef(db, restaurantId);
  const activeRefs = rawAlerts.map((alert) => collection.doc(incidentId(alert)));
  const activeSnapshots = activeRefs.length ? await db.getAll(...activeRefs) : [];
  const existingById = new Map(activeSnapshots.map((snapshot) => [snapshot.id, snapshot]));
  const batch = db.batch();
  let pendingWrites = 0;
  const visibleAlerts: OperationalAlertCenterAlert[] = [];
  const activeIds = new Set<string>();

  rawAlerts.forEach((alert) => {
    const id = incidentId(alert);
    activeIds.add(id);
    const ref = collection.doc(id);
    const snapshot = existingById.get(id);
    const existing = snapshot?.exists ? incidentFromData(id, snapshot.data() as Record<string, unknown>) : null;
    const stillSnoozed = existing?.status === "snoozed" && (existing.snoozedUntilMs ?? 0) > nowMs;
    const status: OperationalAlertIncidentStatus = stillSnoozed
      ? "snoozed"
      : existing?.status === "acknowledged"
        ? "acknowledged"
        : existing?.status === "resolved"
          ? "resolved"
          : "open";
    const snoozedUntilMs = stillSnoozed ? existing?.snoozedUntilMs ?? null : null;
    const shouldPersist = !existing
      || existing.level !== alert.level
      || existing.escalated !== alert.escalated
      || existing.status !== status
      || nowMs - existing.lastSeenAtMs >= 60_000;

    if (shouldPersist) {
      batch.set(ref, {
        restaurantId,
        alertId: alert.id,
        orderId: alert.orderId,
        tableLabel: alert.tableLabel,
        station: alert.station,
        stationLabel: alert.stationLabel,
        level: alert.level,
        escalated: alert.escalated,
        delayedLineCount: alert.delayedLineCount,
        startedAtMs: existing?.startedAtMs || alert.oldestSentAtMs,
        lastSeenAtMs: nowMs,
        status,
        snoozedUntilMs,
        resolvedAtMs: status === "resolved" ? existing?.resolvedAtMs ?? nowMs : null,
        updatedAtMs: nowMs,
      }, { merge: true });
      pendingWrites += 1;
    }

    if (status !== "resolved" && !stillSnoozed) {
      visibleAlerts.push({ ...alert, incidentId: id, incidentStatus: status, snoozedUntilMs });
    }
  });

  const unresolvedSnapshot = await collection.where("status", "in", ["open", "acknowledged", "snoozed"]).limit(100).get();
  unresolvedSnapshot.docs.forEach((snapshot) => {
    if (activeIds.has(snapshot.id)) return;
    batch.set(snapshot.ref, {
      status: "auto_resolved",
      resolvedAtMs: nowMs,
      updatedAtMs: nowMs,
    }, { merge: true });
    pendingWrites += 1;
  });
  if (pendingWrites > 0) await batch.commit();

  const historySnapshot = await collection.orderBy("updatedAtMs", "desc").limit(50).get();
  const history = historySnapshot.docs.map((snapshot) => incidentFromData(snapshot.id, snapshot.data() as Record<string, unknown>));
  return { policy, alerts: visibleAlerts, history };
}

export async function updateOperationalAlertIncident(
  db: Firestore,
  restaurantId: string,
  incidentIdValue: string,
  action: "acknowledge" | "snooze" | "resolve",
  userId: string,
  snoozeMinutes?: number,
): Promise<void> {
  const ref = incidentsRef(db, restaurantId).doc(incidentIdValue);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.restaurantId !== restaurantId) throw new Error("ALERT_NOT_FOUND");
  const now = Date.now();
  if (action === "acknowledge") {
    await ref.set({ status: "acknowledged", acknowledgedAtMs: now, acknowledgedBy: userId, snoozedUntilMs: null, updatedAtMs: now }, { merge: true });
    return;
  }
  if (action === "snooze") {
    const minutes = Math.min(60, Math.max(1, Math.round(Number(snoozeMinutes) || 5)));
    await ref.set({ status: "snoozed", snoozedUntilMs: now + minutes * 60_000, updatedAtMs: now }, { merge: true });
    return;
  }
  await ref.set({ status: "resolved", resolvedAtMs: now, snoozedUntilMs: null, updatedAtMs: now, resolvedBy: userId }, { merge: true });
}
