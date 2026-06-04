import type { Firestore } from "firebase/firestore";
import { fetchActiveOrdersForTable } from "@/lib/firestore/open-orders-same-table";

/** Evento cliente: fusión operativa de comandas tras unir mesas (invalidar caché TPV). */
export const TABLE_GROUP_ORDERS_MERGED_EVENT = "hostly:tableGroupOrdersMerged";

export type TableGroupOrdersMergedDetail = {
  restaurantId: string;
  mainTableId: string;
  memberIds: string[];
  destOrderId?: string;
};

/** Logs de diagnóstico del flujo unir mesas → fusionar comandas. Solo consola; no altera datos. */
const PREFIX = "[Hostly:TableJoinMerge]";

export type TableJoinMergeDiagnosticPayload = Record<string, unknown>;

export type TableJoinOrderSnapshot = {
  orderId: string;
  tableId: string;
  status: string | null;
  items: string[];
  itemCount: number;
  total: number | null;
};

export type TableJoinFirestoreDebugReport = {
  mergeExecuted: boolean;
  mergeMerged: boolean;
  brokenAtStep: string | null;
  brokenReason: string | null;
  restaurantId: string;
  mainTableId: string;
  secondaryTableId: string | null;
  memberIds: string[];
  beforeByTable: Record<string, TableJoinOrderSnapshot[]>;
  destOrderId: string | null;
  destTableIdBefore: string | null;
  plannedFinalItems: string[];
  mergedSourceOrderIds: string[];
  afterByTable: Record<string, TableJoinOrderSnapshot[]>;
  resultDestOrderId?: string;
};

export function logTableJoinMerge(
  phase: string,
  payload: TableJoinMergeDiagnosticPayload = {},
): void {
  if (typeof console === "undefined") return;
  console.log(PREFIX, phase, payload);
}

export function logTableJoinMergeWarn(
  phase: string,
  payload: TableJoinMergeDiagnosticPayload = {},
): void {
  if (typeof console === "undefined") return;
  console.warn(PREFIX, phase, payload);
}

export function logTableJoinMergeError(
  phase: string,
  error: unknown,
  payload: TableJoinMergeDiagnosticPayload = {},
): void {
  if (typeof console === "undefined") return;
  console.error(PREFIX, phase, { ...payload, error });
}

function readItemDisplayName(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "?";
  const row = raw as Record<string, unknown>;
  return String(row.name ?? row.nombre ?? row.displayName ?? "?").trim() || "?";
}

function readItemQty(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const row = raw as Record<string, unknown>;
  return Math.max(0, Number(row.quantity ?? row.qty) || 0);
}

function readItemStatus(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  return String((raw as Record<string, unknown>).status ?? "").trim();
}

/** Líneas legibles tipo `1x Ruinart (sent)` para consola. */
export function formatFirestoreOrderItems(rawItems: unknown): string[] {
  if (!Array.isArray(rawItems)) return [];
  const out: string[] = [];
  for (const raw of rawItems) {
    const qty = readItemQty(raw);
    if (qty <= 0) continue;
    const st = readItemStatus(raw);
    const cancelled =
      st === "cancelled" ||
      st === "canceled" ||
      st === "cancelado";
    if (cancelled) continue;
    const name = readItemDisplayName(raw);
    out.push(st ? `${qty}x ${name} (${st})` : `${qty}x ${name}`);
  }
  return out;
}

export function snapshotOrderDoc(
  doc: { id: string; data: () => Record<string, unknown> },
): TableJoinOrderSnapshot {
  const data = doc.data();
  const items = formatFirestoreOrderItems(data.items);
  const totalRaw = data.total;
  return {
    orderId: doc.id,
    tableId: String(data.tableId ?? "").trim(),
    status: data.status != null ? String(data.status) : null,
    items,
    itemCount: items.length,
    total:
      typeof totalRaw === "number" && Number.isFinite(totalRaw) ? totalRaw : null,
  };
}

/** Resumen compacto (logs intermedios). */
export function summarizeOrderDocForDiagnostic(
  doc: { id: string; data: () => Record<string, unknown> },
): Record<string, unknown> {
  const snap = snapshotOrderDoc(doc);
  return {
    orderId: snap.orderId,
    tableId: snap.tableId,
    status: snap.status,
    restaurantId: doc.data().restaurantId ?? null,
    itemCount: snap.itemCount,
    items: snap.items,
    total: snap.total,
  };
}

export async function fetchActiveOrdersSnapshotByTable(
  db: Firestore,
  restaurantId: string,
  tableIds: string[],
): Promise<Record<string, TableJoinOrderSnapshot[]>> {
  const rid = restaurantId.trim();
  const out: Record<string, TableJoinOrderSnapshot[]> = {};
  for (const tableId of tableIds) {
    const tid = String(tableId ?? "").trim();
    if (!tid) continue;
    const docs = await fetchActiveOrdersForTable(db, rid, tid);
    out[tid] = docs.map((d) => snapshotOrderDoc(d));
  }
  return out;
}

function formatTableOrdersBlock(
  label: string,
  byTable: Record<string, TableJoinOrderSnapshot[]>,
  memberIds: string[],
): string[] {
  const lines: string[] = [label];
  for (const tableId of memberIds) {
    const orders = byTable[tableId] ?? [];
    if (orders.length === 0) {
      lines.push(`  mesa ${tableId}: (sin orders activas en Firestore)`);
      continue;
    }
    for (const order of orders) {
      const itemsText =
        order.items.length > 0 ? `[${order.items.join(", ")}]` : "[]";
      lines.push(
        `  mesa ${tableId} order ${order.orderId} (tableId=${order.tableId}, status=${order.status ?? "?"}): ${itemsText}`,
      );
    }
  }
  return lines;
}

/** Informe legible en consola — filtrar DevTools por `[Hostly:TableJoinMerge]`. */
export function printTableJoinFirestoreDebugReport(
  report: TableJoinFirestoreDebugReport,
): void {
  if (typeof console === "undefined") return;

  const header = `${PREFIX} ═══ FIRESTORE REAL (join mesas) ═══`;
  const body = [
    `restaurantId: ${report.restaurantId}`,
    `mainTableId: ${report.mainTableId}`,
    `secondaryTableId: ${report.secondaryTableId ?? "(no indicada)"}`,
    `memberIds: [${report.memberIds.join(", ")}]`,
    `mergeExecuted: ${report.mergeExecuted}`,
    `mergeMerged: ${report.mergeMerged}`,
    "",
    ...formatTableOrdersBlock("ANTES:", report.beforeByTable, report.memberIds),
    "",
    report.destOrderId
      ? `DESTINO elegido: order ${report.destOrderId} (tableId antes=${report.destTableIdBefore ?? "?"})`
      : "DESTINO elegido: (ninguno)",
    report.plannedFinalItems.length > 0
      ? `ITEMS FINALES a guardar: [${report.plannedFinalItems.join(", ")}]`
      : "ITEMS FINALES a guardar: []",
    report.mergedSourceOrderIds.length > 0
      ? `ORDERS ORIGEN → status merged: [${report.mergedSourceOrderIds.join(", ")}]`
      : "ORDERS ORIGEN → status merged: (ninguna)",
    "",
    ...formatTableOrdersBlock("DESPUÉS (re-lectura Firestore):", report.afterByTable, report.memberIds),
  ];

  if (report.brokenAtStep) {
    body.push("");
    body.push(`⚠ ROMPE EN PASO: ${report.brokenAtStep}`);
    if (report.brokenReason) {
      body.push(`  Motivo: ${report.brokenReason}`);
    }
  }

  console.group(header);
  for (const line of body) {
    if (line.startsWith("⚠")) {
      console.warn(line);
    } else if (line === "ANTES:" || line.startsWith("DESPUÉS")) {
      console.log(`\n${line}`);
    } else {
      console.log(line);
    }
  }
  console.groupEnd();
}
