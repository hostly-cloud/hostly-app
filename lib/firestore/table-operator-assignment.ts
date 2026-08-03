import {
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { dbgUpdateDoc } from "@/lib/firestore/instrumentedWrites";
import {
  hasTableOperatorAssignment,
  type TableOperatorAssignment,
} from "@/lib/tpv/table-operator-assignment";

const UNAUTHORIZED_TABLE_ACCESS = "No autorizado para modificar esta mesa";

type AssignTableOperatorViaApiParams = {
  tableId: string;
  orderId?: string;
  assignedOperatorId: string;
  assignedOperatorName: string;
};

type AssignTableOperatorViaApiResult =
  | { ok: true; assigned: boolean; tableId: string; orderId?: string }
  | { ok: false; error: string; details?: string | null };

type AssignTableOperatorViaApiFn = (
  params: AssignTableOperatorViaApiParams,
) => Promise<AssignTableOperatorViaApiResult>;

let assignTableOperatorViaApiImpl: AssignTableOperatorViaApiFn | null = null;

async function resolveAssignTableOperatorViaApi(): Promise<AssignTableOperatorViaApiFn> {
  if (assignTableOperatorViaApiImpl) return assignTableOperatorViaApiImpl;
  const mod = await import("@/lib/firestore/tpv-mutations-via-api");
  return mod.assignTableOperatorViaApi;
}

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
  /** Solo información visual en UI; no afecta la llamada server-side. */
  tableAssignmentHint?: TableOperatorAssignment | null;
};

/** Hook interno para tests; restaurar con `null` al terminar. */
export function setAssignTableOperatorViaApiForTests(
  impl: AssignTableOperatorViaApiFn | null,
): void {
  assignTableOperatorViaApiImpl = impl;
}

/**
 * Primera apertura TPV: delega la asignación de operador al servidor.
 * No aplica política write-once en cliente.
 */
export async function assignTableOperatorOnFirstOpen(
  params: AssignTableOperatorOnFirstOpenParams,
): Promise<boolean> {
  const rid = params.restaurantId.trim();
  const tid = params.tableId.trim();
  const operatorId = params.operator.assignedOperatorId.trim();
  const operatorName = params.operator.assignedOperatorName.trim();
  if (!rid || !tid || !operatorId || !operatorName) return false;

  const callApi = await resolveAssignTableOperatorViaApi();
  const result = await callApi({
    tableId: tid,
    assignedOperatorId: operatorId,
    assignedOperatorName: operatorName,
  });
  if (!result.ok) return false;
  return result.assigned;
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
