import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  sanitizeAndMergeOrderItems,
  type TpvOrderItemsOperation,
} from "@/lib/server/tpv/order-mutation-contract";
import type { TableOperatorAssignment } from "@/lib/tpv/table-operator-assignment";

function buildTableOperatorAssignmentAdminFields(
  operator:
    | Pick<TableOperatorAssignment, "assignedOperatorId" | "assignedOperatorName">
    | null
    | undefined,
): Record<string, unknown> {
  const operatorId = operator?.assignedOperatorId?.trim() ?? "";
  const operatorName = operator?.assignedOperatorName?.trim() ?? "";
  if (!operatorId || !operatorName) return {};
  return {
    assignedOperatorId: operatorId,
    assignedOperatorName: operatorName,
    assignedAt: FieldValue.serverTimestamp(),
  };
}

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ ok: false, error, details: details ?? null }, { status });
}

function resolveOperationCapability(operation: TpvOrderItemsOperation): "tpv.sell" | "tpv.cancel_line" {
  return operation === "cancel_lines" ? "tpv.cancel_line" : "tpv.sell";
}

export async function handleSyncOrderItemsRequest(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authCtx)) {
    return authCtx;
  }

  const body = (await req.json().catch(() => null)) as {
    operation?: unknown;
    orderId?: unknown;
    tableId?: unknown;
    tableLabel?: unknown;
    items?: unknown;
    total?: unknown;
    cancelledLineIds?: unknown;
    restaurantId?: unknown;
    operatorAssignment?: unknown;
    markSent?: unknown;
  } | null;

  if (!body || typeof body !== "object") {
    return jsonError(400, "INVALID_JSON");
  }

  if ("restaurantId" in body && body.restaurantId != null) {
    return jsonError(400, "RESTAURANT_ID_NOT_ALLOWED");
  }

    const operation = body.operation;
  if (
    operation !== "create_open" &&
    operation !== "persist_items" &&
    operation !== "send_items" &&
    operation !== "cancel_lines"
  ) {
    return jsonError(400, "INVALID_OPERATION");
  }

  const markSent = body.markSent === true;

  const capability = resolveOperationCapability(operation);
  if (!serverRoleHasCapability(authCtx.role, capability)) {
    return jsonError(403, capability === "tpv.cancel_line" ? "TPV_CANCEL_REQUIRED" : "TPV_SELL_REQUIRED");
  }

  if (!Array.isArray(body.items)) {
    return jsonError(400, "ITEMS_REQUIRED");
  }

  const clientItems = body.items.filter(
    (row): row is Record<string, unknown> =>
      row != null && typeof row === "object" && !Array.isArray(row),
  );

  const tableId = typeof body.tableId === "string" ? body.tableId.trim() : "";
  const tableLabel = typeof body.tableLabel === "string" ? body.tableLabel.trim() : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";

  const db = authCtx.db;
  const restaurantId = authCtx.restaurantId;

  if (operation === "create_open") {
    if (orderId) {
      return jsonError(400, "ORDER_ID_NOT_ALLOWED_ON_CREATE");
    }
    if (!tableId) {
      return jsonError(400, "TABLE_ID_REQUIRED");
    }

    const mergeResult = sanitizeAndMergeOrderItems([], clientItems, operation);
    if ("error" in mergeResult) {
      return jsonError(400, "INVALID_ITEMS", mergeResult.error);
    }

    let operatorAssignment: Pick<
      TableOperatorAssignment,
      "assignedOperatorId" | "assignedOperatorName"
    > | null = null;
    if (
      body.operatorAssignment != null &&
      typeof body.operatorAssignment === "object" &&
      !Array.isArray(body.operatorAssignment)
    ) {
      const raw = body.operatorAssignment as Record<string, unknown>;
      if (
        typeof raw.assignedOperatorId === "string" &&
        typeof raw.assignedOperatorName === "string"
      ) {
        operatorAssignment = {
          assignedOperatorId: raw.assignedOperatorId,
          assignedOperatorName: raw.assignedOperatorName,
        };
      }
    }

    const docRef = await db.collection("orders").add({
      restaurantId,
      tableId,
      table: tableLabel || tableId,
      status: markSent ? "sent" : "open",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      items: mergeResult.items,
      total: mergeResult.total,
      ...buildTableOperatorAssignmentAdminFields(operatorAssignment),
    });

    return NextResponse.json({
      ok: true,
      orderId: docRef.id,
      total: mergeResult.total,
    });
  }

  if (!orderId) {
    return jsonError(400, "ORDER_ID_REQUIRED");
  }

  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    return jsonError(404, "ORDER_NOT_FOUND");
  }

  const existing = snap.data() as Record<string, unknown>;
  if (String(existing.restaurantId ?? "") !== restaurantId) {
    return jsonError(403, "TENANT_MISMATCH");
  }

  const mergeResult = sanitizeAndMergeOrderItems(existing.items, clientItems, operation);
  if ("error" in mergeResult) {
    return jsonError(400, "INVALID_ITEMS", mergeResult.error);
  }

  const updatePayload: Record<string, unknown> = {
    items: mergeResult.items,
    total: mergeResult.total,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (operation === "send_items") {
    updatePayload.status = "sent";
  }

  if (operation === "cancel_lines" && Array.isArray(body.cancelledLineIds)) {
    updatePayload.cancelledLineIds = body.cancelledLineIds;
  }

  await orderRef.update(updatePayload);

  return NextResponse.json({
    ok: true,
    orderId,
    total: mergeResult.total,
  });
}
