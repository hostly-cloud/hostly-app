import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type {
  CashMovementType,
  CashMovementView,
  CashSessionView,
  CashTotals,
  CashWorkspaceSnapshot,
} from "@/lib/cash/types";

const DEFAULT_REGISTER_ID = "main";
const DEFAULT_REGISTER_NAME = "Caja principal";
const MONEY_EPS = 0.01;

export class CashRegisterError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus = 400,
  ) {
    super(code);
    this.name = "CashRegisterError";
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function money(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? roundMoney(n) : fallback;
}

function text(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return value.toMillis();
  return 0;
}

function restaurantRef(db: Firestore, restaurantId: string) {
  return db.collection("restaurants").doc(restaurantId);
}

function registerStateRef(db: Firestore, restaurantId: string, registerId: string) {
  return restaurantRef(db, restaurantId).collection("cashRegisterState").doc(registerId);
}

function sessionsRef(db: Firestore, restaurantId: string) {
  return restaurantRef(db, restaurantId).collection("cashSessions");
}

function movementRef(db: Firestore, restaurantId: string, sessionId: string) {
  return sessionsRef(db, restaurantId).doc(sessionId).collection("movements");
}

export function cashPermissions(role: unknown) {
  const canOperate = serverRoleHasCapability(role, "tpv.charge");
  const canSupervise =
    serverRoleHasCapability(role, "tpv.refund") ||
    serverRoleHasCapability(role, "users.manage");
  return { canOperate, canSupervise };
}

function paymentMethod(data: Record<string, unknown>): "cash" | "card" | "voucher" | "other" {
  const method = text(data.paymentMethod, 32).toLowerCase();
  if (method === "cash") return "cash";
  if (method === "card") return "card";
  if (method === "voucher") return "voucher";
  return "other";
}

async function calculateTotals(input: {
  db: Firestore;
  restaurantId: string;
  sessionId: string;
  openingFloat: number;
}): Promise<CashTotals> {
  const [paymentsSnap, movementsSnap] = await Promise.all([
    input.db
      .collection("payments")
      .where("restaurantId", "==", input.restaurantId)
      .where("cashSessionId", "==", input.sessionId)
      .get(),
    movementRef(input.db, input.restaurantId, input.sessionId).get(),
  ]);

  let grossSales = 0;
  let cashSales = 0;
  let cardSales = 0;
  let voucherSales = 0;
  let otherSales = 0;
  let refunds = 0;
  let cashRefunds = 0;
  let tips = 0;
  let paymentCount = 0;
  let refundCount = 0;

  for (const doc of paymentsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const amount = money(data.amount ?? data.total);
    const method = paymentMethod(data);
    const status = text(data.status, 32).toLowerCase();
    const refundAmount = money(data.refundAmount);
    const isRefunded = status === "refunded" || status === "cancelled";

    if (!isRefunded && status === "paid") {
      grossSales += amount;
      paymentCount += 1;
      tips += money(data.tip);
      if (method === "cash") cashSales += amount;
      else if (method === "card") cardSales += amount;
      else if (method === "voucher") voucherSales += amount;
      else otherSales += amount;
    } else if (isRefunded) {
      const reversed = refundAmount > 0 ? refundAmount : amount;
      refunds += reversed;
      refundCount += 1;
      if (method === "cash") cashRefunds += reversed;
    }
  }

  let cashIn = 0;
  let cashOut = 0;
  for (const doc of movementsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const amount = money(data.amount);
    if (data.type === "cash_in") cashIn += amount;
    if (data.type === "cash_out") cashOut += amount;
  }

  return {
    grossSales: roundMoney(grossSales),
    cashSales: roundMoney(cashSales),
    cardSales: roundMoney(cardSales),
    voucherSales: roundMoney(voucherSales),
    otherSales: roundMoney(otherSales),
    refunds: roundMoney(refunds),
    cashRefunds: roundMoney(cashRefunds),
    tips: roundMoney(tips),
    cashIn: roundMoney(cashIn),
    cashOut: roundMoney(cashOut),
    expectedCash: roundMoney(input.openingFloat + cashSales + cashIn - cashOut - cashRefunds),
    paymentCount,
    refundCount,
  };
}

async function readMovements(
  db: Firestore,
  restaurantId: string,
  sessionId: string,
): Promise<CashMovementView[]> {
  const snap = await movementRef(db, restaurantId, sessionId).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        type: data.type === "cash_out" ? "cash_out" : "cash_in",
        amount: money(data.amount),
        reason: text(data.reason, 300),
        createdAtMs: toMs(data.createdAt),
        createdBy: text(data.createdBy, 128),
        createdByEmail: text(data.createdByEmail, 180) || undefined,
      } satisfies CashMovementView;
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

async function toSessionView(input: {
  db: Firestore;
  restaurantId: string;
  id: string;
  data: Record<string, unknown>;
  canSupervise: boolean;
  actorUid: string;
}): Promise<CashSessionView> {
  const openingFloat = money(input.data.openingFloat);
  const status =
    input.data.status === "closed"
      ? "closed"
      : input.data.status === "counted"
        ? "counted"
        : "open";
  const countedCash =
    typeof input.data.countedCash === "number" ? money(input.data.countedCash) : null;
  const storedTotals = input.data.closedTotals as CashTotals | undefined;
  const showExpected = input.canSupervise || status === "closed";
  const liveTotals =
    status === "closed" && storedTotals
      ? storedTotals
      : showExpected
        ? await calculateTotals({
            db: input.db,
            restaurantId: input.restaurantId,
            sessionId: input.id,
            openingFloat,
          })
        : null;
  const difference =
    countedCash != null && liveTotals
      ? roundMoney(countedCash - liveTotals.expectedCash)
      : typeof input.data.difference === "number"
        ? money(input.data.difference)
        : null;

  return {
    id: input.id,
    registerId: text(input.data.registerId, 80) || DEFAULT_REGISTER_ID,
    registerName: text(input.data.registerName, 120) || DEFAULT_REGISTER_NAME,
    operatorUid: text(input.data.operatorUid, 128),
    operatorEmail: text(input.data.operatorEmail, 180),
    status,
    openedAtMs: toMs(input.data.openedAt),
    closedAtMs: input.data.closedAt ? toMs(input.data.closedAt) : null,
    openingFloat,
    countedCash,
    difference: showExpected ? difference : null,
    discrepancyReason: showExpected ? text(input.data.discrepancyReason, 500) || null : null,
    countedBy: text(input.data.countedBy, 128) || null,
    closedBy: text(input.data.closedBy, 128) || null,
    totals: liveTotals,
    movements: await readMovements(input.db, input.restaurantId, input.id),
    canSeeExpected: showExpected,
    canClose: input.canSupervise && status === "counted",
  };
}

export async function getCashWorkspace(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
}): Promise<CashWorkspaceSnapshot> {
  const { canOperate, canSupervise } = cashPermissions(input.actorRole);
  if (!canOperate && !canSupervise) {
    throw new CashRegisterError("CASH_REGISTER_ACCESS_REQUIRED", 403);
  }

  const sessions = await sessionsRef(input.db, input.restaurantId).get();
  const ordered = sessions.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .sort((a, b) => toMs(b.data.openedAt) - toMs(a.data.openedAt));

  const activeRaw = ordered.find((item) => item.data.status !== "closed") ?? null;
  const activeSession = activeRaw
    ? await toSessionView({
        db: input.db,
        restaurantId: input.restaurantId,
        id: activeRaw.id,
        data: activeRaw.data,
        canSupervise,
        actorUid: input.actorUid,
      })
    : null;

  const historyRaw = ordered.filter((item) => item.data.status === "closed").slice(0, 30);
  const history = await Promise.all(
    historyRaw.map((item) =>
      toSessionView({
        db: input.db,
        restaurantId: input.restaurantId,
        id: item.id,
        data: item.data,
        canSupervise,
        actorUid: input.actorUid,
      }),
    ),
  );

  return { activeSession, history, canOperate, canSupervise };
}

export async function openCashSession(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: unknown;
  openingFloat: unknown;
  registerId?: unknown;
  registerName?: unknown;
}) {
  const { canOperate } = cashPermissions(input.actorRole);
  if (!canOperate) throw new CashRegisterError("CASH_REGISTER_OPERATE_REQUIRED", 403);

  const openingFloat = money(input.openingFloat, Number.NaN);
  if (!Number.isFinite(openingFloat) || openingFloat < 0 || openingFloat > 100_000) {
    throw new CashRegisterError("INVALID_OPENING_FLOAT", 400);
  }
  const registerId = text(input.registerId, 80) || DEFAULT_REGISTER_ID;
  const registerName = text(input.registerName, 120) || DEFAULT_REGISTER_NAME;
  const stateRef = registerStateRef(input.db, input.restaurantId, registerId);
  const sessionRef = sessionsRef(input.db, input.restaurantId).doc();

  await input.db.runTransaction(async (tx) => {
    const state = await tx.get(stateRef);
    const activeSessionId = text(state.data()?.activeSessionId, 128);
    if (activeSessionId) {
      const current = await tx.get(sessionsRef(input.db, input.restaurantId).doc(activeSessionId));
      if (current.exists && current.data()?.status !== "closed") {
        throw new CashRegisterError("CASH_SESSION_ALREADY_OPEN", 409);
      }
    }
    tx.set(sessionRef, {
      restaurantId: input.restaurantId,
      registerId,
      registerName,
      operatorUid: input.actorUid,
      operatorEmail: input.actorEmail,
      status: "open",
      openingFloat,
      openedAt: FieldValue.serverTimestamp(),
      openedAtMs: Date.now(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      stateRef,
      {
        activeSessionId: sessionRef.id,
        registerId,
        registerName,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
  return sessionRef.id;
}

export async function addCashMovement(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: unknown;
  sessionId: unknown;
  type: unknown;
  amount: unknown;
  reason: unknown;
}) {
  const { canOperate } = cashPermissions(input.actorRole);
  if (!canOperate) throw new CashRegisterError("CASH_REGISTER_OPERATE_REQUIRED", 403);
  const sessionId = text(input.sessionId, 128);
  const type: CashMovementType = input.type === "cash_out" ? "cash_out" : "cash_in";
  const amount = money(input.amount, Number.NaN);
  const reason = text(input.reason, 500);
  if (!sessionId) throw new CashRegisterError("CASH_SESSION_REQUIRED", 400);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    throw new CashRegisterError("INVALID_CASH_MOVEMENT_AMOUNT", 400);
  }
  if (reason.length < 3) throw new CashRegisterError("CASH_MOVEMENT_REASON_REQUIRED", 400);

  const sessionRef = sessionsRef(input.db, input.restaurantId).doc(sessionId);
  const movement = movementRef(input.db, input.restaurantId, sessionId).doc();
  await input.db.runTransaction(async (tx) => {
    const session = await tx.get(sessionRef);
    if (!session.exists) throw new CashRegisterError("CASH_SESSION_NOT_FOUND", 404);
    if (session.data()?.status !== "open") {
      throw new CashRegisterError("CASH_SESSION_NOT_OPEN", 409);
    }
    tx.set(movement, {
      restaurantId: input.restaurantId,
      sessionId,
      type,
      amount,
      reason,
      createdBy: input.actorUid,
      createdByEmail: input.actorEmail,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    });
    tx.update(sessionRef, { updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function countCashBlind(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  sessionId: unknown;
  countedCash: unknown;
}) {
  const { canOperate } = cashPermissions(input.actorRole);
  if (!canOperate) throw new CashRegisterError("CASH_REGISTER_OPERATE_REQUIRED", 403);
  const sessionId = text(input.sessionId, 128);
  const countedCash = money(input.countedCash, Number.NaN);
  if (!sessionId) throw new CashRegisterError("CASH_SESSION_REQUIRED", 400);
  if (!Number.isFinite(countedCash) || countedCash < 0 || countedCash > 1_000_000) {
    throw new CashRegisterError("INVALID_COUNTED_CASH", 400);
  }
  const ref = sessionsRef(input.db, input.restaurantId).doc(sessionId);
  await input.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CashRegisterError("CASH_SESSION_NOT_FOUND", 404);
    if (snap.data()?.status !== "open") {
      throw new CashRegisterError("CASH_SESSION_NOT_OPEN", 409);
    }
    tx.update(ref, {
      status: "counted",
      countedCash,
      countedBy: input.actorUid,
      countedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function reopenCashCount(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  sessionId: unknown;
  reason: unknown;
}) {
  const { canSupervise } = cashPermissions(input.actorRole);
  if (!canSupervise) throw new CashRegisterError("CASH_REGISTER_SUPERVISE_REQUIRED", 403);
  const sessionId = text(input.sessionId, 128);
  const reason = text(input.reason, 500);
  if (reason.length < 3) throw new CashRegisterError("REOPEN_REASON_REQUIRED", 400);
  const ref = sessionsRef(input.db, input.restaurantId).doc(sessionId);
  await input.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new CashRegisterError("CASH_SESSION_NOT_FOUND", 404);
    if (snap.data()?.status !== "counted") throw new CashRegisterError("CASH_SESSION_NOT_COUNTED", 409);
    tx.update(ref, {
      status: "open",
      previousCountedCash: snap.data()?.countedCash ?? null,
      countedCash: FieldValue.delete(),
      countedBy: FieldValue.delete(),
      countedAt: FieldValue.delete(),
      reopenReason: reason,
      reopenedBy: input.actorUid,
      reopenedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function closeCashSession(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  sessionId: unknown;
  discrepancyReason?: unknown;
}) {
  const { canSupervise } = cashPermissions(input.actorRole);
  if (!canSupervise) throw new CashRegisterError("CASH_REGISTER_SUPERVISE_REQUIRED", 403);
  const sessionId = text(input.sessionId, 128);
  const discrepancyReason = text(input.discrepancyReason, 500);
  if (!sessionId) throw new CashRegisterError("CASH_SESSION_REQUIRED", 400);

  const ref = sessionsRef(input.db, input.restaurantId).doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new CashRegisterError("CASH_SESSION_NOT_FOUND", 404);
  const data = snap.data() as Record<string, unknown>;
  if (data.status !== "counted") throw new CashRegisterError("CASH_SESSION_NOT_COUNTED", 409);
  const countedCash = money(data.countedCash, Number.NaN);
  if (!Number.isFinite(countedCash)) throw new CashRegisterError("CASH_COUNT_REQUIRED", 409);
  const totals = await calculateTotals({
    db: input.db,
    restaurantId: input.restaurantId,
    sessionId,
    openingFloat: money(data.openingFloat),
  });
  const difference = roundMoney(countedCash - totals.expectedCash);
  if (Math.abs(difference) > MONEY_EPS && discrepancyReason.length < 3) {
    throw new CashRegisterError("DISCREPANCY_REASON_REQUIRED", 400);
  }
  const registerId = text(data.registerId, 80) || DEFAULT_REGISTER_ID;
  const stateRef = registerStateRef(input.db, input.restaurantId, registerId);

  await input.db.runTransaction(async (tx) => {
    const [fresh, state] = await Promise.all([tx.get(ref), tx.get(stateRef)]);
    if (!fresh.exists) throw new CashRegisterError("CASH_SESSION_NOT_FOUND", 404);
    if (fresh.data()?.status !== "counted") throw new CashRegisterError("CASH_SESSION_NOT_COUNTED", 409);
    if (text(state.data()?.activeSessionId, 128) !== sessionId) {
      throw new CashRegisterError("CASH_SESSION_NOT_ACTIVE", 409);
    }
    tx.update(ref, {
      status: "closed",
      difference,
      discrepancyReason: discrepancyReason || null,
      closedTotals: totals,
      closedBy: input.actorUid,
      closedAt: FieldValue.serverTimestamp(),
      closedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      stateRef,
      {
        activeSessionId: null,
        lastClosedSessionId: sessionId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return { difference, totals };
}

export async function activeCashSessionId(
  db: Firestore,
  restaurantId: string,
  registerId = DEFAULT_REGISTER_ID,
): Promise<string | null> {
  const state = await registerStateRef(db, restaurantId, registerId).get();
  const sessionId = text(state.data()?.activeSessionId, 128);
  if (!sessionId) return null;
  const session = await sessionsRef(db, restaurantId).doc(sessionId).get();
  if (!session.exists || session.data()?.status === "closed") return null;
  return sessionId;
}
