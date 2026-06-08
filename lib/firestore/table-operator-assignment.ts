import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { dbgUpdateDoc } from "@/lib/firestore/instrumentedWrites";
import { fetchOpenOrderForTable } from "@/lib/firestore/open-orders-same-table";
import {
  hasTableOperatorAssignment,
  type TableOperatorAssignment,
} from "@/lib/tpv/table-operator-assignment";

const UNAUTHORIZED_TABLE_ACCESS = "No autorizado para modificar esta mesa";

function assertTableTenant(
  data: Record<string, unknown>,
  activeRestaurantId: string,
): void {
  const rid = activeRestaurantId.trim();
  const docRid =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRid !== "" && docRid === rid) return;
  throw new Error(UNAUTHORIZED_TABLE_ACCESS);
}

export type AssignTableOperatorOnFirstOpenParams = {
  db: Firestore;
  restaurantId: string;
  tableId: string;
  operator: Pick<TableOperatorAssignment, "assignedOperatorId" | "assignedOperatorName">;
  /** Evita lectura si la mesa en memoria ya tiene asignación. */
  tableAssignmentHint?: TableOperatorAssignment | null;
};

/**
 * Primera apertura TPV: registra operador activo en mesa y, si existe, en la
 * comanda abierta. No sobrescribe asignaciones existentes.
 */
export async function assignTableOperatorOnFirstOpen(
  params: AssignTableOperatorOnFirstOpenParams,
): Promise<boolean> {
  const rid = params.restaurantId.trim();
  const tid = params.tableId.trim();
  const operatorId = params.operator.assignedOperatorId.trim();
  const operatorName = params.operator.assignedOperatorName.trim();
  if (!rid || !tid || !operatorId || !operatorName) return false;

  if (params.tableAssignmentHint?.assignedOperatorId) return false;

  const tableRef = doc(params.db, "tables", tid);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return false;

  const tableData = tableSnap.data() as Record<string, unknown>;
  assertTableTenant(tableData, rid);
  if (hasTableOperatorAssignment(tableData)) return false;

  const openOrderSnap = await fetchOpenOrderForTable(params.db, rid, tid);
  if (
    openOrderSnap &&
    hasTableOperatorAssignment(openOrderSnap.data() as Record<string, unknown>)
  ) {
    return false;
  }

  const assignmentPayload = {
    assignedOperatorId: operatorId,
    assignedOperatorName: operatorName,
    assignedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies DocumentData;

  await dbgUpdateDoc(tableRef, assignmentPayload, {
    label: "tpv:assignTableOperatorOnFirstOpen:table",
    collection: "tables",
    restaurantId: rid,
    tableId: tid,
  });

  if (openOrderSnap) {
    await dbgUpdateDoc(
      doc(params.db, "orders", openOrderSnap.id),
      assignmentPayload,
      {
        label: "tpv:assignTableOperatorOnFirstOpen:order",
        collection: "orders",
        restaurantId: rid,
        tableId: tid,
        orderId: openOrderSnap.id,
      },
    );
  }

  return true;
}

/** Campos Firestore para borrar asignación TPV en `tables` (no tocar `orders`). */
export function tableOperatorAssignmentClearFields(): DocumentData {
  return {
    assignedOperatorId: deleteField(),
    assignedOperatorName: deleteField(),
    assignedAt: deleteField(),
  };
}

/**
 * Libera la mesa para el siguiente servicio: quita asignación de operador en
 * `tables/{tableId}` sin modificar comandas históricas.
 */
export async function clearTableOperatorAssignment(params: {
  db: Firestore;
  restaurantId: string;
  tableId: string;
}): Promise<void> {
  const rid = params.restaurantId.trim();
  const tid = params.tableId.trim();
  if (!rid || !tid) return;

  const tableRef = doc(params.db, "tables", tid);
  const tableSnap = await getDoc(tableRef);
  if (!tableSnap.exists()) return;

  const tableData = tableSnap.data() as Record<string, unknown>;
  assertTableTenant(tableData, rid);
  if (!hasTableOperatorAssignment(tableData)) return;

  await dbgUpdateDoc(
    tableRef,
    {
      ...tableOperatorAssignmentClearFields(),
      updatedAt: serverTimestamp(),
    },
    {
      label: "tpv:clearTableOperatorAssignment",
      collection: "tables",
      restaurantId: rid,
      tableId: tid,
    },
  );
}

/** Payload para crear `orders` con la misma asignación (solo alta nueva). */
export function tableOperatorAssignmentCreateFields(
  assignment: Pick<
    TableOperatorAssignment,
    "assignedOperatorId" | "assignedOperatorName"
  > | null | undefined,
): DocumentData {
  if (!assignment?.assignedOperatorId?.trim() || !assignment.assignedOperatorName?.trim()) {
    return {};
  }
  return {
    assignedOperatorId: assignment.assignedOperatorId.trim(),
    assignedOperatorName: assignment.assignedOperatorName.trim(),
    assignedAt: serverTimestamp(),
  };
}
