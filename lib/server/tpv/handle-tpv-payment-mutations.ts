import { FieldValue } from "firebase-admin/firestore";
import type { AuthenticatedRestaurantContext } from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  computeOrderEconomics,
  sumPaidPayments,
} from "@/lib/server/tpv/compute-order-economics";
import type { TpvMutationError } from "@/lib/server/tpv/handle-tpv-order-mutations";
import { readOrderUpdatedAtMs } from "@/lib/server/tpv/order-projection";
import {
  computeSplitByItemsAmount,
  computeSplitEqualAmount,
} from "@/lib/server/tpv/split-payment-amounts";
import { isOrderEconomicallySettled } from "@/lib/server/tpv/order-payment-balance";
import {
  loadOrderPaymentsInTransaction,
  loadTableOrdersInTransaction,
} from "@/lib/server/tpv/table-occupancy-server";
import {
  idempotencyDocRef,
  buildIdempotencyPayload,
  readIdempotencyHit,
  stablePayloadHash,
  writeIdempotencyRecord,
} from "@/lib/server/tpv/tpv-idempotency";
import { isActiveOrderStatus } from "@/lib/server/tpv/table-group-order-utils";
import type {
  ChargeOrderIntent,
  RefundPaymentIntent,
  VoidPaymentIntent,
} from "@/lib/server/tpv/tpv-mutation-dtos";

const MONEY_EPS = 0.01;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function orderItemsArray(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
}

function assertExpectedVersion(
  orderData: Record<string, unknown>,
  expected?: number,
): TpvMutationError | null {
  if (expected == null) return null;
  const current = readOrderUpdatedAtMs(orderData);
  if (current != null && current !== expected) {
    return { status: 409, error: "VERSION_CONFLICT" };
  }
  return null;
}

function buildPaymentMetadata(
  ctx: AuthenticatedRestaurantContext,
  intent: ChargeOrderIntent,
  economics: ReturnType<typeof computeOrderEconomics>,
  chargeAmount: number,
  remainingAfterPayment: number,
  isAccountFinalPayment: boolean,
): Record<string, unknown> {
  const voucherUsed =
    intent.paymentMethod === "voucher"
      ? roundMoney(Math.min(intent.voucherAmount ?? chargeAmount, chargeAmount))
      : 0;
  const voucherRemaining =
    intent.paymentMethod === "voucher" && intent.voucherAmount != null
      ? roundMoney(Math.max(intent.voucherAmount - chargeAmount, 0))
      : null;

  let change = intent.change;
  if (intent.paymentMethod === "cash" && intent.cashReceived != null) {
    change = roundMoney(Math.max(intent.cashReceived - chargeAmount, 0));
  }

  const meta: Record<string, unknown> = {
    restaurantId: ctx.restaurantId,
    orderId: intent.orderId.trim(),
    tableId: intent.tableId?.trim() || null,
    tableName: intent.tableName?.trim() || null,
    amount: chargeAmount,
    total: chargeAmount,
    originalTotal: economics.subtotal,
    discountAmount: economics.discountAmountValue,
    discountPercent: economics.discountPercentValue,
    discountPercentAmount: economics.percentAmount,
    discountTotal: economics.discountTotal,
    finalTotal: chargeAmount,
    paymentMethod: intent.paymentMethod,
    status: "paid",
    type: intent.type,
    paymentKind: isAccountFinalPayment ? "final" : "partial",
    isPartial: !isAccountFinalPayment,
    remainingAfterPayment,
    accountFinalTotal: economics.finalTotal,
    createdBy: ctx.uid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    waiterId: intent.waiterId?.trim() || ctx.uid,
    waiterEmail: intent.waiterEmail?.trim() || ctx.email || null,
  };

  if (intent.orderSessionId) meta.orderSessionId = intent.orderSessionId;
  if (intent.part != null) meta.part = intent.part;
  if (intent.totalParts != null) meta.totalParts = intent.totalParts;
  if (intent.itemIds?.length) meta.itemIds = intent.itemIds;
  if (intent.tip != null && intent.tip > 0) meta.tip = intent.tip;
  if (intent.received != null) meta.received = intent.received;
  if (intent.cashReceived != null) meta.cashReceived = intent.cashReceived;
  if (change != null) meta.change = change;
  if (intent.voucherAmount != null) meta.voucherAmount = intent.voucherAmount;
  if (voucherUsed > 0) meta.voucherUsed = voucherUsed;
  if (voucherRemaining != null) meta.voucherRemaining = voucherRemaining;
  if (intent.voucherNumber) meta.voucherNumber = intent.voucherNumber;
  if (intent.ticketNumber) meta.ticketNumber = intent.ticketNumber;
  if (intent.invoiceNumber) meta.invoiceNumber = intent.invoiceNumber;
  if (intent.invoice) meta.invoice = intent.invoice;

  return meta;
}

export async function handleChargeOrder(
  ctx: AuthenticatedRestaurantContext,
  intent: ChargeOrderIntent,
): Promise<{ paymentId: string; amount: number; remainingAfterPayment: number } | TpvMutationError> {
  if (!serverRoleHasCapability(ctx.role, "tpv.charge")) {
    return { status: 403, error: "TPV_CHARGE_REQUIRED" };
  }

  const orderId = intent.orderId.trim();
  if (!orderId) return { status: 400, error: "ORDER_ID_REQUIRED" };

  const allowedMethods = ["cash", "card", "voucher"] as const;
  if (!allowedMethods.includes(intent.paymentMethod)) {
    return { status: 400, error: "PAYMENT_METHOD_INVALID" };
  }

  const allowedTypes = ["table_amount", "split_equal", "split_by_items"] as const;
  if (!allowedTypes.includes(intent.type)) {
    return { status: 400, error: "PAYMENT_TYPE_INVALID" };
  }

  const idemKey = intent.idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, "charge_order", {
      orderId,
      type: intent.type,
      amount: intent.amount,
      paymentMethod: intent.paymentMethod,
      itemIds: intent.itemIds ?? null,
      part: intent.part ?? null,
      totalParts: intent.totalParts ?? null,
      tip: intent.tip ?? null,
      cashReceived: intent.cashReceived ?? null,
      change: intent.change ?? null,
      voucherAmount: intent.voucherAmount ?? null,
      voucherNumber: intent.voucherNumber ?? null,
      ticketNumber: intent.ticketNumber ?? null,
      invoiceNumber: intent.invoiceNumber ?? null,
      invoice: intent.invoice ?? null,
    }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      "charge_order",
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.paymentId) {
      return {
        paymentId: String(hit.paymentId),
        amount: Number(hit.amount) || 0,
        remainingAfterPayment: Number(hit.remainingAfterPayment) || 0,
      };
    }
  }

  const orderRef = ctx.db.collection("orders").doc(orderId);
  const paymentRef = ctx.db.collection("payments").doc();
  let resultAmount = 0;
  let resultRemaining = 0;

  const preOrderSnap = await orderRef.get();
  const preOrderData = preOrderSnap.exists
    ? (preOrderSnap.data() as Record<string, unknown>)
    : null;
  const preTableId = preOrderData ? String(preOrderData.tableId ?? "").trim() : "";

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, "charge_order", payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.paymentId) {
          throw new Error(
            `IDEM_OK:${hit.paymentId}:${hit.amount ?? 0}:${hit.remainingAfterPayment ?? 0}`,
          );
        }
      }

      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
      const orderData = orderSnap.data() as Record<string, unknown>;
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) {
        throw new Error("TENANT_MISMATCH");
      }
      const verErr = assertExpectedVersion(orderData, intent.expectedUpdatedAtMs);
      if (verErr) throw new Error(verErr.error);

      const items = orderItemsArray(orderData.items);
      const economics = computeOrderEconomics(orderData, items);

      const paymentsSnap = await tx.get(
        ctx.db
          .collection("payments")
          .where("restaurantId", "==", ctx.restaurantId)
          .where("orderId", "==", orderId),
      );
      const payments = paymentsSnap.docs.map((d) => d.data() as Record<string, unknown>);
      const paidSoFar = sumPaidPayments(payments);
      const remaining = roundMoney(Math.max(0, economics.finalTotal - paidSoFar));

      let chargeAmount = roundMoney(intent.amount);
      if (intent.type === "split_by_items") {
        if (!intent.itemIds || intent.itemIds.length === 0) {
          throw new Error("ITEM_IDS_REQUIRED");
        }
        const computed = computeSplitByItemsAmount(orderData, items, intent.itemIds, payments);
        if (typeof computed !== "number") throw new Error(computed.error);
        chargeAmount = computed;
      } else if (intent.type === "split_equal") {
        if (intent.part == null || intent.totalParts == null) {
          throw new Error("SPLIT_PARTS_REQUIRED");
        }
        const computed = computeSplitEqualAmount(
          economics.finalTotal,
          intent.part,
          intent.totalParts,
          payments,
        );
        if (typeof computed !== "number") throw new Error(computed.error);
        chargeAmount = computed;
      } else if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
        throw new Error("AMOUNT_INVALID");
      }

      if (chargeAmount > remaining + MONEY_EPS) throw new Error(`OVERPAY:${remaining}`);

      const remainingAfterPayment = roundMoney(Math.max(0, remaining - chargeAmount));
      const isAccountFinalPayment = remainingAfterPayment <= MONEY_EPS;

      const orderTableId = String(orderData.tableId ?? "").trim();
      const tableId = intent.tableId?.trim() || orderTableId;
      if (intent.tableId?.trim() && intent.tableId.trim() !== orderTableId) {
        throw new Error("TABLE_ORDER_MISMATCH");
      }
      let tableRefInTx: FirebaseFirestore.DocumentReference | null = null;
      let tableSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let tableOrders: Awaited<ReturnType<typeof loadTableOrdersInTransaction>> = [];
      if (tableId) {
        tableRefInTx = ctx.db.collection("tables").doc(tableId);
        tableSnap = await tx.get(tableRefInTx);
        if (!tableSnap.exists) throw new Error("TABLE_NOT_FOUND");
        const tableData = tableSnap.data() as Record<string, unknown>;
        if (String(tableData.restaurantId ?? "") !== ctx.restaurantId) {
          throw new Error("TABLE_TENANT_MISMATCH");
        }
        tableOrders = await loadTableOrdersInTransaction(tx, ctx.db, ctx.restaurantId, tableId);
      }

      let canFreeTable = false;
      if (isAccountFinalPayment && tableId && tableRefInTx && tableSnap?.exists) {
        canFreeTable = true;
        for (const { ref, data } of tableOrders) {
          if (ref.id === orderId) continue;
          if (!isActiveOrderStatus(data.status)) continue;
          const siblingItems = orderItemsArray(data.items);
          const siblingPayments = await loadOrderPaymentsInTransaction(
            tx,
            ctx.db,
            ctx.restaurantId,
            ref.id,
          );
          if (!isOrderEconomicallySettled(data, siblingItems, siblingPayments)) {
            canFreeTable = false;
            break;
          }
        }
      }

      const paymentPayload = buildPaymentMetadata(
        ctx,
        { ...intent, tableId: tableId || intent.tableId },
        economics,
        chargeAmount,
        remainingAfterPayment,
        isAccountFinalPayment,
      );

      tx.set(paymentRef, paymentPayload);

      const orderUpdate: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (isAccountFinalPayment) {
        orderUpdate.status = "paid";
        orderUpdate.paidAt = Date.now();
      }
      tx.update(orderRef, orderUpdate);

      if (canFreeTable && tableRefInTx) {
        tx.update(tableRefInTx, {
          status: "free",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          "charge_order",
          payloadHash,
          {
            paymentId: paymentRef.id,
            amount: chargeAmount,
            remainingAfterPayment,
          },
        );
      }

      resultAmount = chargeAmount;
      resultRemaining = remainingAfterPayment;
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      const [, pid, amt, rem] = msg.split(":");
      return {
        paymentId: pid!,
        amount: Number(amt) || 0,
        remainingAfterPayment: Number(rem) || 0,
      };
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "VERSION_CONFLICT") return { status: 409, error: "VERSION_CONFLICT" };
    if (msg === "TABLE_NOT_FOUND") return { status: 404, error: "TABLE_NOT_FOUND" };
    if (msg === "TABLE_TENANT_MISMATCH") return { status: 403, error: "TABLE_TENANT_MISMATCH" };
    if (msg === "TABLE_ORDER_MISMATCH") return { status: 400, error: "TABLE_ORDER_MISMATCH" };
    if (msg === "ITEM_IDS_REQUIRED") return { status: 400, error: "ITEM_IDS_REQUIRED" };
    if (msg === "SPLIT_PARTS_REQUIRED") return { status: 400, error: "SPLIT_PARTS_REQUIRED" };
    if (msg === "SPLIT_PARTS_INVALID") return { status: 400, error: "SPLIT_PARTS_INVALID" };
    if (msg === "SPLIT_PART_ALREADY_PAID") return { status: 409, error: msg };
    if (msg === "AMOUNT_INVALID") return { status: 400, error: "AMOUNT_INVALID" };
    if (msg.startsWith("OVERPAY:")) {
      return {
        status: 400,
        error: "OVERPAYMENT_NOT_ALLOWED",
        details: msg.slice(8),
      };
    }
    if (
      msg === "LINE_NOT_FOUND" ||
      msg === "LINE_CANCELLED" ||
      msg === "LINE_ALREADY_PAID" ||
      msg === "DUPLICATE_ITEM_ID"
    ) {
      return { status: 400, error: msg };
    }
    throw e;
  }

  return {
    paymentId: paymentRef.id,
    amount: resultAmount,
    remainingAfterPayment: resultRemaining,
  };
}

async function mutatePaymentWithOrderBalance(
  ctx: AuthenticatedRestaurantContext,
  paymentId: string,
  kind: "refund_payment" | "void_payment",
  idempotencyKey: string | undefined,
  buildPaymentUpdate: (
    paymentData: Record<string, unknown>,
    refundAmount: number,
    nowMs: number,
  ) => Record<string, unknown>,
): Promise<{ paymentId: string; refundAmount: number } | TpvMutationError> {
  const capErr = serverRoleHasCapability(ctx.role, "tpv.refund")
    ? null
    : { status: 403 as const, error: "TPV_REFUND_REQUIRED" };
  if (capErr) return capErr;

  const pid = paymentId.trim();
  if (!pid) return { status: 400, error: "PAYMENT_ID_REQUIRED" };

  const idemKey = idempotencyKey?.trim();
  const payloadHash = stablePayloadHash(
    buildIdempotencyPayload(ctx.uid, ctx.restaurantId, kind, { paymentId: pid }),
  );

  if (idemKey) {
    const hit = readIdempotencyHit(
      await idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey).get(),
      kind,
      payloadHash,
    );
    if (hit?.conflict) return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (hit?.paymentId) {
      return {
        paymentId: String(hit.paymentId),
        refundAmount: Number(hit.refundAmount) || 0,
      };
    }
  }

  const paymentRef = ctx.db.collection("payments").doc(pid);
  let refundAmount = 0;

  try {
    await ctx.db.runTransaction(async (tx) => {
      if (idemKey) {
        const idemSnap = await tx.get(idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey));
        const hit = readIdempotencyHit(idemSnap, kind, payloadHash);
        if (hit?.conflict) throw new Error("IDEMPOTENCY_CONFLICT");
        if (hit?.paymentId) {
          throw new Error(`IDEM_OK:${hit.paymentId}:${hit.refundAmount ?? 0}`);
        }
      }

      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) throw new Error("PAYMENT_NOT_FOUND");
      const paymentData = paymentSnap.data() as Record<string, unknown>;
      if (String(paymentData.restaurantId ?? "") !== ctx.restaurantId) {
        throw new Error("TENANT_MISMATCH");
      }

      const status = String(paymentData.status ?? "").toLowerCase();
      if (status === "refunded" || status === "cancelled") {
        refundAmount = Number(paymentData.refundAmount ?? paymentData.amount ?? 0) || 0;
        throw new Error(`IDEM_OK:${pid}:${refundAmount}`);
      }
      if (status !== "paid") throw new Error("PAYMENT_NOT_REVERSIBLE");

      const orderId = String(paymentData.orderId ?? "").trim();
      if (!orderId) throw new Error("ORDER_ID_MISSING");
      const orderRef = ctx.db.collection("orders").doc(orderId);

      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
      const orderData = orderSnap.data() as Record<string, unknown>;
      if (String(orderData.restaurantId ?? "") !== ctx.restaurantId) {
        throw new Error("TENANT_MISMATCH");
      }

      const paymentsSnap = await tx.get(
        ctx.db
          .collection("payments")
          .where("restaurantId", "==", ctx.restaurantId)
          .where("orderId", "==", orderId),
      );
      const allPayments = paymentsSnap.docs.map((d) =>
        d.id === pid ? { id: d.id, ...paymentData } : { id: d.id, ...(d.data() as object) },
      );

      const tableId = String(orderData.tableId ?? "").trim();
      let tableRef: FirebaseFirestore.DocumentReference | null = null;
      let tableSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let tableOrders: Awaited<ReturnType<typeof loadTableOrdersInTransaction>> = [];
      if (tableId) {
        tableRef = ctx.db.collection("tables").doc(tableId);
        tableSnap = await tx.get(tableRef);
        if (tableSnap.exists) {
          const tableData = tableSnap.data() as Record<string, unknown>;
          if (String(tableData.restaurantId ?? "") !== ctx.restaurantId) {
            throw new Error("TABLE_TENANT_MISMATCH");
          }
          tableOrders = await loadTableOrdersInTransaction(tx, ctx.db, ctx.restaurantId, tableId);
        }
      }

      refundAmount = roundMoney(Number(paymentData.amount ?? paymentData.total) || 0);
      const nowMs = Date.now();
      const paymentUpdate = buildPaymentUpdate(paymentData, refundAmount, nowMs);

      const items = orderItemsArray(orderData.items);
      const economics = computeOrderEconomics(orderData, items);
      const paidAfter = sumPaidPayments(
        allPayments.map((p) => {
          if (p.id === pid) {
            return { ...paymentData, status: paymentUpdate.status ?? "cancelled" };
          }
          return p;
        }),
      );
      const remaining = roundMoney(Math.max(0, economics.finalTotal - paidAfter));
      const orderUpdate: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      const orderStatus = String(orderData.status ?? "").trim().toLowerCase();
      if (remaining > MONEY_EPS) {
        if (orderStatus === "paid" || orderStatus === "closed") {
          orderUpdate.status = "sent";
          orderUpdate.paidAt = FieldValue.delete();
          orderUpdate.closedAt = FieldValue.delete();
        }
      }

      let tableShouldBeOccupied = false;
      for (const { ref, data } of tableOrders) {
        const projectedStatus =
          ref.id === orderId && orderUpdate.status != null
            ? String(orderUpdate.status)
            : String(data.status ?? "");
        if (!isActiveOrderStatus(projectedStatus)) continue;
        const projectedItems = ref.id === orderId ? items : orderItemsArray(data.items);
        const projectedPayments =
          ref.id === orderId
            ? allPayments.map((p) =>
                p.id === pid
                  ? { ...paymentData, status: paymentUpdate.status ?? "cancelled" }
                  : p,
              )
            : await loadOrderPaymentsInTransaction(tx, ctx.db, ctx.restaurantId, ref.id);
        if (!isOrderEconomicallySettled(
          ref.id === orderId ? { ...orderData, ...orderUpdate } : data,
          projectedItems,
          projectedPayments,
        )) {
          tableShouldBeOccupied = true;
          break;
        }
      }

      tx.update(paymentRef, paymentUpdate);
      tx.update(orderRef, orderUpdate);

      if (tableRef && tableSnap?.exists) {
        const nextTableStatus = tableShouldBeOccupied ? "occupied" : "free";
        tx.update(tableRef, {
          status: nextTableStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (idemKey) {
        writeIdempotencyRecord(
          tx,
          idempotencyDocRef(ctx.db, ctx.restaurantId, idemKey),
          kind,
          payloadHash,
          { paymentId: pid, refundAmount },
        );
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("IDEM_OK:")) {
      const [, id, amt] = msg.split(":");
      return { paymentId: id!, refundAmount: Number(amt) || 0 };
    }
    if (msg === "IDEMPOTENCY_CONFLICT") return { status: 409, error: "IDEMPOTENCY_CONFLICT" };
    if (msg === "PAYMENT_NOT_FOUND") return { status: 404, error: "PAYMENT_NOT_FOUND" };
    if (msg === "TENANT_MISMATCH") return { status: 403, error: "TENANT_MISMATCH" };
    if (msg === "PAYMENT_NOT_REVERSIBLE") return { status: 400, error: "PAYMENT_NOT_REVERSIBLE" };
    if (msg === "ORDER_NOT_FOUND") return { status: 404, error: "ORDER_NOT_FOUND" };
    throw e;
  }

  return { paymentId: pid, refundAmount };
}

export async function handleRefundPayment(
  ctx: AuthenticatedRestaurantContext,
  intent: RefundPaymentIntent,
): Promise<{ paymentId: string; refundAmount: number } | TpvMutationError> {
  return mutatePaymentWithOrderBalance(
    ctx,
    intent.paymentId,
    "refund_payment",
    intent.idempotencyKey,
    (_paymentData, refundAmount, nowMs) => ({
      status: "refunded",
      refunded: true,
      refund: true,
      refundedAt: nowMs,
      refundAmount,
      updatedAt: nowMs,
    }),
  );
}

export async function handleVoidPayment(
  ctx: AuthenticatedRestaurantContext,
  intent: VoidPaymentIntent,
): Promise<{ paymentId: string; refundAmount: number } | TpvMutationError> {
  return mutatePaymentWithOrderBalance(
    ctx,
    intent.paymentId,
    "void_payment",
    intent.idempotencyKey,
    (_paymentData, refundAmount, nowMs) => ({
      status: "cancelled",
      cancelledAt: nowMs,
      refundAmount,
      updatedAt: nowMs,
    }),
  );
}
