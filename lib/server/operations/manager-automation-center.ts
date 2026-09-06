import type { Firestore } from "firebase-admin/firestore";
import {
  buildManagerAutomationCopy,
  managerAutomationPriority,
  resolveManagerAutomationStage,
  shouldReopenManagerAutomation,
  type ManagerAutomationItem,
  type ManagerAutomationStage,
  type ManagerAutomationStatus,
} from "@/lib/operations/manager-automations";
import {
  buildAndSyncOperationalAlertCenter,
  type OperationalAlertCenterAlert,
} from "@/lib/server/operations/operational-alert-center";

function automationsRef(db: Firestore, restaurantId: string) {
  return db.collection(`restaurants/${restaurantId}/managerAutomations`);
}

function fromData(id: string, data: Record<string, unknown>): ManagerAutomationItem {
  const action = data.action && typeof data.action === "object" ? data.action as Record<string, unknown> : {};
  return {
    id,
    restaurantId: String(data.restaurantId ?? ""),
    source: "operational_alert",
    sourceIncidentId: String(data.sourceIncidentId ?? ""),
    sourceAlertId: String(data.sourceAlertId ?? ""),
    sourceOrderId: String(data.sourceOrderId ?? ""),
    tableLabel: String(data.tableLabel ?? "Sin mesa"),
    stationLabel: String(data.stationLabel ?? ""),
    stage: String(data.stage ?? "attention") as ManagerAutomationStage,
    priority: String(data.priority ?? "medium") as ManagerAutomationItem["priority"],
    status: String(data.status ?? "active") as ManagerAutomationStatus,
    title: String(data.title ?? "Automatización operativa"),
    detail: String(data.detail ?? ""),
    action: {
      kind: "navigate",
      href: String(action.href ?? "/dashboard/operacion/activity/alerts"),
      label: String(action.label ?? "Abrir"),
    },
    firstPreparedAtMs: Number(data.firstPreparedAtMs) || 0,
    lastPreparedAtMs: Number(data.lastPreparedAtMs) || 0,
    updatedAtMs: Number(data.updatedAtMs) || 0,
    acknowledgedAtMs: data.acknowledgedAtMs == null ? null : Number(data.acknowledgedAtMs) || null,
    acknowledgedBy: typeof data.acknowledgedBy === "string" ? data.acknowledgedBy : null,
    resolvedAtMs: data.resolvedAtMs == null ? null : Number(data.resolvedAtMs) || null,
  };
}

export async function syncManagerAutomationsFromAlerts(
  db: Firestore,
  restaurantId: string,
  alerts: OperationalAlertCenterAlert[],
  nowMs = Date.now(),
): Promise<{ active: ManagerAutomationItem[]; history: ManagerAutomationItem[] }> {
  const collection = automationsRef(db, restaurantId);
  const refs = alerts.map((alert) => collection.doc(alert.incidentId));
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  const existingById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const batch = db.batch();
  let writes = 0;
  const activeIds = new Set<string>();

  for (const alert of alerts) {
    const id = alert.incidentId;
    activeIds.add(id);
    const ref = collection.doc(id);
    const snapshot = existingById.get(id);
    const existing = snapshot?.exists ? fromData(id, snapshot.data() as Record<string, unknown>) : null;
    const stage = resolveManagerAutomationStage(alert);
    const copy = buildManagerAutomationCopy(alert);
    const reopen = existing
      ? existing.status === "auto_resolved" || shouldReopenManagerAutomation({
          previousStatus: existing.status,
          previousStage: existing.stage,
          nextStage: stage,
        })
      : true;
    const status: ManagerAutomationStatus = !existing || reopen ? "active" : existing.status;
    const changed = !existing
      || existing.stage !== stage
      || existing.status !== status
      || existing.title !== copy.title
      || existing.detail !== copy.detail;
    if (!changed) continue;
    batch.set(ref, {
      restaurantId,
      source: "operational_alert",
      sourceIncidentId: alert.incidentId,
      sourceAlertId: alert.id,
      sourceOrderId: alert.orderId,
      tableLabel: alert.tableLabel,
      stationLabel: alert.stationLabel,
      stage,
      priority: managerAutomationPriority(stage),
      status,
      title: copy.title,
      detail: copy.detail,
      action: copy.action,
      firstPreparedAtMs: existing?.firstPreparedAtMs || nowMs,
      lastPreparedAtMs: nowMs,
      updatedAtMs: nowMs,
      acknowledgedAtMs: status === "active" ? null : existing?.acknowledgedAtMs ?? null,
      acknowledgedBy: status === "active" ? null : existing?.acknowledgedBy ?? null,
      resolvedAtMs: status === "active" ? null : existing?.resolvedAtMs ?? null,
    }, { merge: true });
    writes += 1;
  }

  const unresolved = await collection.where("status", "in", ["active", "acknowledged"]).limit(100).get();
  for (const snapshot of unresolved.docs) {
    if (activeIds.has(snapshot.id)) continue;
    batch.set(snapshot.ref, {
      status: "auto_resolved",
      resolvedAtMs: nowMs,
      updatedAtMs: nowMs,
    }, { merge: true });
    writes += 1;
  }
  if (writes > 0) await batch.commit();

  const historySnapshot = await collection.orderBy("updatedAtMs", "desc").limit(50).get();
  const history = historySnapshot.docs.map((snapshot) => fromData(snapshot.id, snapshot.data() as Record<string, unknown>));
  return { active: history.filter((item) => item.status === "active"), history };
}

export async function buildAndSyncManagerAutomationCenter(
  db: Firestore,
  restaurantId: string,
  nowMs = Date.now(),
): Promise<{ active: ManagerAutomationItem[]; history: ManagerAutomationItem[] }> {
  const alertCenter = await buildAndSyncOperationalAlertCenter(db, restaurantId, nowMs);
  return syncManagerAutomationsFromAlerts(db, restaurantId, alertCenter.alerts, nowMs);
}

export async function updateManagerAutomation(
  db: Firestore,
  restaurantId: string,
  automationId: string,
  action: "acknowledge" | "resolve",
  userId: string,
): Promise<void> {
  const ref = automationsRef(db, restaurantId).doc(automationId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.restaurantId !== restaurantId) throw new Error("AUTOMATION_NOT_FOUND");
  const nowMs = Date.now();
  if (action === "acknowledge") {
    await ref.set({ status: "acknowledged", acknowledgedAtMs: nowMs, acknowledgedBy: userId, updatedAtMs: nowMs }, { merge: true });
    return;
  }
  await ref.set({ status: "resolved", resolvedAtMs: nowMs, resolvedBy: userId, updatedAtMs: nowMs }, { merge: true });
}
