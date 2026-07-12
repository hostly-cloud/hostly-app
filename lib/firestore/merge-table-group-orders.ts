import {
  serverTimestamp,
  updateDoc,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { DbgWriteBatch } from "@/lib/firestore/instrumentedWrites";
import {
  computeBillableTotalFromOrderDocLike,
  readOrderCreatedAtMs,
} from "@/lib/firestore/order-table-occupancy";
import {
  fetchActiveOrdersForTable,
  sortOpenOrderDocsByCreatedAt,
} from "@/lib/firestore/open-orders-same-table";
import {
  fetchActiveOrdersSnapshotByTable,
  formatFirestoreOrderItems,
  logTableJoinMergeError,
  printTableJoinFirestoreDebugReport,
  type TableJoinFirestoreDebugReport,
} from "@/lib/firestore/table-join-merge-diagnostic";

function generateOrderLineId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function asFirestoreRawItems(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => ({ ...(x as Record<string, unknown>) }));
}

function normalizeMergedFirestoreItems(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return items.map((it) => {
    const next = { ...it };
    let id = typeof next.id === "string" ? next.id : "";
    if (!id || seen.has(id)) {
      id = generateOrderLineId();
      next.id = id;
    }
    seen.add(id);
    return next;
  });
}

function withTableGroupLineOrigin(
  item: Record<string, unknown>,
  sourceTableId: string,
  sourceOrderId: string,
): Record<string, unknown> {
  const tid = sourceTableId.trim();
  const oid = sourceOrderId.trim();
  return {
    ...item,
    ...(tid ? { tableGroupSourceTableId: tid } : {}),
    ...(oid ? { tableGroupSourceOrderId: oid } : {}),
  };
}

function isPaymentRequestedAtSet(raw: unknown): boolean {
  if (raw == null) return false;
  if (typeof raw === "number" && Number.isFinite(raw)) return true;
  if (
    raw &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis?: () => number }).toMillis === "function"
  ) {
    return true;
  }
  return false;
}

function pickDestinationOrderDoc(
  docs: QueryDocumentSnapshot[],
  mainTableId: string,
): QueryDocumentSnapshot | null {
  if (docs.length === 0) return null;
  const onMain = docs.filter((d) => {
    const tid = String((d.data() as { tableId?: unknown }).tableId ?? "").trim();
    return tid === mainTableId;
  });
  if (onMain.length > 0) {
    return sortOpenOrderDocsByCreatedAt(onMain)[0] ?? null;
  }
  return sortOpenOrderDocsByCreatedAt(docs)[0] ?? null;
}

export type MergeOpenOrdersForTableGroupOptions = {
  secondaryTableId?: string;
};

export type MergeOpenOrdersForTableGroupResult = {
  merged: boolean;
  destOrderId?: string;
  debugReport: TableJoinFirestoreDebugReport;
};

function initDebugReport(
  restaurantId: string,
  mainTableId: string,
  memberIds: string[],
  options?: MergeOpenOrdersForTableGroupOptions,
): TableJoinFirestoreDebugReport {
  return {
    mergeExecuted: true,
    mergeMerged: false,
    brokenAtStep: null,
    brokenReason: null,
    restaurantId: restaurantId.trim(),
    mainTableId: mainTableId.trim(),
    secondaryTableId: options?.secondaryTableId?.trim() || null,
    memberIds: [...memberIds],
    beforeByTable: {},
    destOrderId: null,
    destTableIdBefore: null,
    plannedFinalItems: [],
    mergedSourceOrderIds: [],
    afterByTable: {},
  };
}

function finishReport(
  report: TableJoinFirestoreDebugReport,
  brokenAtStep: string,
  brokenReason: string,
): TableJoinFirestoreDebugReport {
  report.brokenAtStep = brokenAtStep;
  report.brokenReason = brokenReason;
  printTableJoinFirestoreDebugReport(report);
  return report;
}

/**
 * Fusiona comandas activas de todas las mesas del grupo en la mesa principal.
 * Imprime informe Firestore ANTES/DESPUÉS en consola (sin alterar lógica operativa).
 */
export async function mergeOpenOrdersForTableGroup(
  db: Firestore,
  restaurantId: string,
  mainTableId: string,
  memberIds: string[],
  options?: MergeOpenOrdersForTableGroupOptions,
): Promise<MergeOpenOrdersForTableGroupResult> {
  const rid = restaurantId.trim();
  const mainId = mainTableId.trim();
  const report = initDebugReport(rid, mainId, memberIds, options);

  if (!rid || !mainId) {
    finishReport(report, "1-validacion-ids", "restaurantId o mainTableId vacío");
    return { merged: false, debugReport: report };
  }

  const uniqueMemberIds = [
    ...new Set(
      memberIds.map((id) => String(id ?? "").trim()).filter(Boolean),
    ),
  ];
  report.memberIds = uniqueMemberIds;

  if (uniqueMemberIds.length === 0) {
    finishReport(report, "2-memberIds", "memberIds vacío tras normalizar");
    return { merged: false, debugReport: report };
  }

  report.beforeByTable = await fetchActiveOrdersSnapshotByTable(
    db,
    rid,
    uniqueMemberIds,
  );

  const allDocs: QueryDocumentSnapshot[] = [];
  const seenOrderIds = new Set<string>();
  for (const tableId of uniqueMemberIds) {
    const docs = await fetchActiveOrdersForTable(db, rid, tableId);
    for (const d of docs) {
      if (seenOrderIds.has(d.id)) continue;
      const data = d.data() as { restaurantId?: string };
      if (data.restaurantId !== rid) continue;
      seenOrderIds.add(d.id);
      allDocs.push(d);
    }
  }

  const totalOrdersBefore = allDocs.length;
  if (totalOrdersBefore === 0) {
    finishReport(
      report,
      "4-fetch-activas",
      "fetchActiveOrdersForTable no encontró ninguna order activa en ningún memberId",
    );
    return { merged: false, debugReport: report };
  }

  const destDoc = pickDestinationOrderDoc(allDocs, mainId);
  if (!destDoc) {
    finishReport(report, "6-destino", "pickDestinationOrderDoc devolvió null");
    return { merged: false, debugReport: report };
  }

  report.destOrderId = destDoc.id;
  const destData = destDoc.data() as {
    restaurantId?: string;
    tableId?: string;
    items?: unknown;
    note?: unknown;
    paymentRequestedAt?: unknown;
  };
  report.destTableIdBefore = String(destData.tableId ?? "").trim() || null;

  if (destData.restaurantId !== rid) {
    finishReport(
      report,
      "6-destino",
      `restaurantId del destino (${destData.restaurantId}) ≠ ${rid}`,
    );
    return { merged: false, debugReport: report };
  }

  const sources = allDocs.filter((d) => d.id !== destDoc.id);
  const destTableId = String(destData.tableId ?? "").trim();

  if (sources.length === 0) {
    if (destTableId === mainId) {
      report.plannedFinalItems = formatFirestoreOrderItems(destData.items);
      report.afterByTable = report.beforeByTable;
      finishReport(
        report,
        "5-solo-una-order",
        `Solo 1 order activa (${destDoc.id}) ya en mainTableId; no hay segunda comanda que fusionar`,
      );
      return { merged: false, debugReport: report };
    }

    report.plannedFinalItems = formatFirestoreOrderItems(destData.items);
    try {
      await updateDoc(destDoc.ref, {
        tableId: mainId,
        updatedAt: serverTimestamp(),
      });
      report.mergeMerged = true;
      report.resultDestOrderId = destDoc.id;
      report.afterByTable = await fetchActiveOrdersSnapshotByTable(
        db,
        rid,
        uniqueMemberIds,
      );
      printTableJoinFirestoreDebugReport(report);
      return { merged: true, destOrderId: destDoc.id, debugReport: report };
    } catch (error) {
      logTableJoinMergeError("merge:relocate-failed", error, {
        destOrderId: destDoc.id,
      });
      finishReport(
        report,
        "8-batch-commit",
        "updateDoc relocate falló (ver error merge:relocate-failed)",
      );
      return { merged: false, debugReport: report };
    }
  }

  const destItems = asFirestoreRawItems(destData.items).map((item) =>
    withTableGroupLineOrigin(item, destTableId || mainId, destDoc.id),
  );
  const flatSource = sources.flatMap((s) => {
    const sourceData = s.data() as { items?: unknown; tableId?: unknown };
    const sourceTableId = String(sourceData.tableId ?? "").trim();
    return asFirestoreRawItems(sourceData.items).map((item) =>
      withTableGroupLineOrigin(item, sourceTableId, s.id),
    );
  });
  const mergedItems = normalizeMergedFirestoreItems([...destItems, ...flatSource]);
  const mergedTotal = computeBillableTotalFromOrderDocLike({
    items: mergedItems,
    total: 0,
  });

  report.plannedFinalItems = formatFirestoreOrderItems(mergedItems);
  report.mergedSourceOrderIds = sources.map((s) => s.id);

  const noteParts: string[] = [];
  const pushNote = (n: unknown) => {
    const s = typeof n === "string" ? n.trim() : "";
    if (s) noteParts.push(s);
  };
  pushNote(destData.note);
  for (const s of sources) {
    pushNote((s.data() as { note?: unknown }).note);
  }
  const mergedNote = noteParts.join("\n");

  const prRaw: unknown[] = [destData.paymentRequestedAt];
  for (const s of sources) {
    prRaw.push((s.data() as { paymentRequestedAt?: unknown }).paymentRequestedAt);
  }
  let mergedPr: unknown = null;
  let bestMs = -1;
  for (const raw of prRaw) {
    if (!isPaymentRequestedAtSet(raw)) continue;
    const ms = readOrderCreatedAtMs(raw) ?? 0;
    if (ms > bestMs) {
      bestMs = ms;
      mergedPr = raw;
    }
  }

  try {
    const batch = new DbgWriteBatch(db, {
      label: "mergeOpenOrdersForTableGroup",
      collection: "orders",
      restaurantId: rid,
      tableId: mainId,
      orderId: destDoc.id,
    });
    batch.update(destDoc.ref, {
      tableId: mainId,
      items: mergedItems,
      total: Number.isFinite(mergedTotal) ? mergedTotal : 0,
      note: mergedNote,
      paymentRequestedAt: mergedPr,
      updatedAt: serverTimestamp(),
    });
    for (const s of sources) {
      const sourceData = s.data() as {
        status?: unknown;
        paymentRequestedAt?: unknown;
      };
      const originalStatus = String(sourceData.status ?? "").trim();
      batch.update(s.ref, {
        status: "merged",
        mergedIntoOrderId: destDoc.id,
        mergedIntoTableId: mainId,
        ...(originalStatus ? { tableGroupMergeOriginalStatus: originalStatus } : {}),
        ...(isPaymentRequestedAtSet(sourceData.paymentRequestedAt)
          ? { tableGroupMergeOriginalPaymentRequestedAt: sourceData.paymentRequestedAt }
          : {}),
        paymentRequestedAt: null,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    logTableJoinMergeError("merge:batch-failed", error, {
      destOrderId: destDoc.id,
      mergedSourceOrderIds: report.mergedSourceOrderIds,
    });
    finishReport(
      report,
      "8-batch-commit",
      "DbgWriteBatch.commit falló (permisos, red o reglas)",
    );
    return { merged: false, debugReport: report };
  }

  report.mergeMerged = true;
  report.resultDestOrderId = destDoc.id;
  report.afterByTable = await fetchActiveOrdersSnapshotByTable(
    db,
    rid,
    uniqueMemberIds,
  );

  const afterMainOrders = report.afterByTable[mainId] ?? [];
  const destAfter = afterMainOrders.find((o) => o.orderId === destDoc.id);
  const secondaryStillHasOrders = uniqueMemberIds
    .filter((id) => id !== mainId)
    .some((id) => (report.afterByTable[id] ?? []).length > 0);

  if (!destAfter) {
    finishReport(
      report,
      "9-post-lectura",
      `Tras commit, order destino ${destDoc.id} no aparece activa en mainTableId ${mainId}`,
    );
    return { merged: true, destOrderId: destDoc.id, debugReport: report };
  }

  if (destAfter.items.length !== report.plannedFinalItems.length) {
    finishReport(
      report,
      "9-post-lectura",
      `Items en Firestore (${destAfter.items.join(", ")}) ≠ planificados (${report.plannedFinalItems.join(", ")})`,
    );
    return { merged: true, destOrderId: destDoc.id, debugReport: report };
  }

  if (secondaryStillHasOrders) {
    const secondaryLines = uniqueMemberIds
      .filter((id) => id !== mainId)
      .flatMap((id) => report.afterByTable[id] ?? [])
      .map((o) => `mesa ${o.tableId} order ${o.orderId}: [${o.items.join(", ")}]`);
    finishReport(
      report,
      "9-post-lectura",
      `Mesas secundarias siguen con orders activas: ${secondaryLines.join(" | ")}`,
    );
    return { merged: true, destOrderId: destDoc.id, debugReport: report };
  }

  printTableJoinFirestoreDebugReport(report);
  return { merged: true, destOrderId: destDoc.id, debugReport: report };
}
