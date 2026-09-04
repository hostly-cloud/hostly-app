import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type {
  CashMovementType,
  CashMovementView,
  CashSessionView,
  CashTotals,
  CashWorkspaceSnapshot,
} from "@/lib/cash/types";

const REGISTER_ID = "main";
const REGISTER_NAME = "Caja principal";
const EPS = 0.01;

export class CashRegisterV2Error extends Error {
  constructor(readonly code: string, readonly httpStatus = 400) {
    super(code);
    this.name = "CashRegisterV2Error";
  }
}

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? round(n) : fallback;
};
const str = (v: unknown, max = 240) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const ms = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : v instanceof Timestamp
      ? v.toMillis()
      : 0;

function root(db: Firestore, restaurantId: string) {
  return db.collection("restaurants").doc(restaurantId);
}
function sessions(db: Firestore, restaurantId: string) {
  return root(db, restaurantId).collection("cashSessions");
}
function state(db: Firestore, restaurantId: string) {
  return root(db, restaurantId).collection("cashRegisterState").doc(REGISTER_ID);
}
function movements(db: Firestore, restaurantId: string, sessionId: string) {
  return sessions(db, restaurantId).doc(sessionId).collection("movements");
}

export function cashV2Permissions(role: unknown) {
  return {
    canOperate: serverRoleHasCapability(role, "tpv.charge"),
    canSupervise:
      serverRoleHasCapability(role, "tpv.refund") ||
      serverRoleHasCapability(role, "users.manage"),
  };
}

function method(data: Record<string, unknown>) {
  const value = str(data.paymentMethod, 32).toLowerCase();
  return value === "cash" || value === "card" || value === "voucher" ? value : "other";
}

async function ledgerTotals(input: {
  db: Firestore;
  restaurantId: string;
  sessionId: string;
  openedAtMs: number;
  endAtMs?: number | null;
  openingFloat: number;
}): Promise<CashTotals> {
  const [paymentsSnap, movementsSnap] = await Promise.all([
    input.db.collection("payments").where("restaurantId", "==", input.restaurantId).get(),
    movements(input.db, input.restaurantId, input.sessionId).get(),
  ]);
  const end = input.endAtMs && input.endAtMs > 0 ? input.endAtMs : Date.now();
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
    const createdAt = ms(data.createdAt);
    const status = str(data.status, 32).toLowerCase();
    const paymentAmount = num(data.amount ?? data.total);
    const paymentMethod = method(data);
    if (createdAt >= input.openedAtMs && createdAt <= end) {
      grossSales += paymentAmount;
      paymentCount += 1;
      tips += num(data.tip);
      if (paymentMethod === "cash") cashSales += paymentAmount;
      else if (paymentMethod === "card") cardSales += paymentAmount;
      else if (paymentMethod === "voucher") voucherSales += paymentAmount;
      else otherSales += paymentAmount;
    }
    const reversedAt = ms(data.refundedAt ?? data.cancelledAt);
    if ((status === "refunded" || status === "cancelled") && reversedAt >= input.openedAtMs && reversedAt <= end) {
      const reversed = num(data.refundAmount) || paymentAmount;
      refunds += reversed;
      refundCount += 1;
      if (paymentMethod === "cash") cashRefunds += reversed;
    }
  }

  let cashIn = 0;
  let cashOut = 0;
  for (const doc of movementsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.type === "cash_in") cashIn += num(data.amount);
    if (data.type === "cash_out") cashOut += num(data.amount);
  }

  return {
    grossSales: round(grossSales),
    cashSales: round(cashSales),
    cardSales: round(cardSales),
    voucherSales: round(voucherSales),
    otherSales: round(otherSales),
    refunds: round(refunds),
    cashRefunds: round(cashRefunds),
    tips: round(tips),
    cashIn: round(cashIn),
    cashOut: round(cashOut),
    expectedCash: round(input.openingFloat + cashSales + cashIn - cashOut - cashRefunds),
    paymentCount,
    refundCount,
  };
}

async function movementViews(db: Firestore, restaurantId: string, sessionId: string) {
  const snap = await movements(db, restaurantId, sessionId).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        type: data.type === "cash_out" ? "cash_out" : "cash_in",
        amount: num(data.amount),
        reason: str(data.reason, 500),
        createdAtMs: ms(data.createdAtMs ?? data.createdAt),
        createdBy: str(data.createdBy, 128),
        createdByEmail: str(data.createdByEmail, 180) || undefined,
      } satisfies CashMovementView;
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
}

async function viewSession(input: {
  db: Firestore;
  restaurantId: string;
  id: string;
  data: Record<string, unknown>;
  canSupervise: boolean;
}): Promise<CashSessionView> {
  const status = input.data.status === "closed" ? "closed" : input.data.status === "counted" ? "counted" : "open";
  const openingFloat = num(input.data.openingFloat);
  const openedAtMs = ms(input.data.openedAtMs ?? input.data.openedAt);
  const closedAtMs = ms(input.data.closedAtMs ?? input.data.closedAt) || null;
  const countedCash = typeof input.data.countedCash === "number" ? num(input.data.countedCash) : null;
  const showExpected = input.canSupervise || status === "closed";
  const totals =
    status === "closed" && input.data.closedTotals
      ? (input.data.closedTotals as CashTotals)
      : showExpected
        ? await ledgerTotals({
            db: input.db,
            restaurantId: input.restaurantId,
            sessionId: input.id,
            openedAtMs,
            endAtMs: closedAtMs,
            openingFloat,
          })
        : null;
  return {
    id: input.id,
    registerId: str(input.data.registerId, 80) || REGISTER_ID,
    registerName: str(input.data.registerName, 120) || REGISTER_NAME,
    operatorUid: str(input.data.operatorUid, 128),
    operatorEmail: str(input.data.operatorEmail, 180),
    status,
    openedAtMs,
    closedAtMs,
    openingFloat,
    countedCash,
    difference: countedCash != null && totals ? round(countedCash - totals.expectedCash) : typeof input.data.difference === "number" ? num(input.data.difference) : null,
    discrepancyReason: showExpected ? str(input.data.discrepancyReason, 500) || null : null,
    countedBy: str(input.data.countedBy, 128) || null,
    closedBy: str(input.data.closedBy, 128) || null,
    totals,
    movements: await movementViews(input.db, input.restaurantId, input.id),
    canSeeExpected: showExpected,
    canClose: input.canSupervise && status === "counted",
  };
}

export async function getCashWorkspaceV2(input: {
  db: Firestore;
  restaurantId: string;
  actorRole: unknown;
}): Promise<CashWorkspaceSnapshot> {
  const permissions = cashV2Permissions(input.actorRole);
  if (!permissions.canOperate && !permissions.canSupervise) throw new CashRegisterV2Error("CASH_REGISTER_ACCESS_REQUIRED", 403);
  const snap = await sessions(input.db, input.restaurantId).get();
  const ordered = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .sort((a, b) => ms(b.data.openedAtMs ?? b.data.openedAt) - ms(a.data.openedAtMs ?? a.data.openedAt));
  const activeRaw = ordered.find((item) => item.data.status !== "closed") ?? null;
  const activeSession = activeRaw
    ? await viewSession({ db: input.db, restaurantId: input.restaurantId, id: activeRaw.id, data: activeRaw.data, canSupervise: permissions.canSupervise })
    : null;
  const history = await Promise.all(
    ordered
      .filter((item) => item.data.status === "closed")
      .slice(0, 30)
      .map((item) => viewSession({ db: input.db, restaurantId: input.restaurantId, id: item.id, data: item.data, canSupervise: permissions.canSupervise })),
  );
  return { activeSession, history, ...permissions };
}

export async function openCashSessionV2(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorEmail: string;
  actorRole: unknown;
  openingFloat: unknown;
}) {
  if (!cashV2Permissions(input.actorRole).canOperate) throw new CashRegisterV2Error("CASH_REGISTER_OPERATE_REQUIRED", 403);
  const openingFloat = num(input.openingFloat, Number.NaN);
  if (!Number.isFinite(openingFloat) || openingFloat < 0 || openingFloat > 100000) throw new CashRegisterV2Error("INVALID_OPENING_FLOAT");
  const stateRef = state(input.db, input.restaurantId);
  const sessionRef = sessions(input.db, input.restaurantId).doc();
  const now = Date.now();
  await input.db.runTransaction(async (tx) => {
    const currentState = await tx.get(stateRef);
    const currentId = str(currentState.data()?.activeSessionId, 128);
    if (currentId) {
      const current = await tx.get(sessions(input.db, input.restaurantId).doc(currentId));
      if (current.exists && current.data()?.status !== "closed") throw new CashRegisterV2Error("CASH_SESSION_ALREADY_OPEN", 409);
    }
    tx.set(sessionRef, {
      restaurantId: input.restaurantId,
      registerId: REGISTER_ID,
      registerName: REGISTER_NAME,
      operatorUid: input.actorUid,
      operatorEmail: input.actorEmail,
      status: "open",
      openingFloat,
      openedAt: FieldValue.serverTimestamp(),
      openedAtMs: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(stateRef, { activeSessionId: sessionRef.id, registerId: REGISTER_ID, registerName: REGISTER_NAME, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return sessionRef.id;
}

export async function addCashMovementV2(input: {
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
  if (!cashV2Permissions(input.actorRole).canOperate) throw new CashRegisterV2Error("CASH_REGISTER_OPERATE_REQUIRED", 403);
  const sessionId = str(input.sessionId, 128);
  const amount = num(input.amount, Number.NaN);
  const reason = str(input.reason, 500);
  const type: CashMovementType = input.type === "cash_out" ? "cash_out" : "cash_in";
  if (!sessionId) throw new CashRegisterV2Error("CASH_SESSION_REQUIRED");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new CashRegisterV2Error("INVALID_CASH_MOVEMENT_AMOUNT");
  if (reason.length < 3) throw new CashRegisterV2Error("CASH_MOVEMENT_REASON_REQUIRED");
  const sessionRef = sessions(input.db, input.restaurantId).doc(sessionId);
  const movementRef = movements(input.db, input.restaurantId, sessionId).doc();
  await input.db.runTransaction(async (tx) => {
    const current = await tx.get(sessionRef);
    if (!current.exists) throw new CashRegisterV2Error("CASH_SESSION_NOT_FOUND", 404);
    if (current.data()?.status !== "open") throw new CashRegisterV2Error("CASH_SESSION_NOT_OPEN", 409);
    tx.set(movementRef, { restaurantId: input.restaurantId, sessionId, type, amount, reason, createdBy: input.actorUid, createdByEmail: input.actorEmail, createdAt: FieldValue.serverTimestamp(), createdAtMs: Date.now() });
    tx.update(sessionRef, { updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function countCashBlindV2(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  sessionId: unknown;
  countedCash: unknown;
}) {
  if (!cashV2Permissions(input.actorRole).canOperate) throw new CashRegisterV2Error("CASH_REGISTER_OPERATE_REQUIRED", 403);
  const sessionId = str(input.sessionId, 128);
  const countedCash = num(input.countedCash, Number.NaN);
  if (!sessionId) throw new CashRegisterV2Error("CASH_SESSION_REQUIRED");
  if (!Number.isFinite(countedCash) || countedCash < 0 || countedCash > 1000000) throw new CashRegisterV2Error("INVALID_COUNTED_CASH");
  const ref = sessions(input.db, input.restaurantId).doc(sessionId);
  await input.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) throw new CashRegisterV2Error("CASH_SESSION_NOT_FOUND", 404);
    if (current.data()?.status !== "open") throw new CashRegisterV2Error("CASH_SESSION_NOT_OPEN", 409);
    tx.update(ref, { status: "counted", countedCash, countedBy: input.actorUid, countedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function reopenCashCountV2(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  sessionId: unknown;
  reason: unknown;
}) {
  if (!cashV2Permissions(input.actorRole).canSupervise) throw new CashRegisterV2Error("CASH_REGISTER_SUPERVISE_REQUIRED", 403);
  const sessionId = str(input.sessionId, 128);
  const reason = str(input.reason, 500);
  if (reason.length < 3) throw new CashRegisterV2Error("REOPEN_REASON_REQUIRED");
  const ref = sessions(input.db, input.restaurantId).doc(sessionId);
  await input.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) throw new CashRegisterV2Error("CASH_SESSION_NOT_FOUND", 404);
    if (current.data()?.status !== "counted") throw new CashRegisterV2Error("CASH_SESSION_NOT_COUNTED", 409);
    tx.update(ref, { status: "open", previousCountedCash: current.data()?.countedCash ?? null, countedCash: FieldValue.delete(), countedBy: FieldValue.delete(), countedAt: FieldValue.delete(), reopenReason: reason, reopenedBy: input.actorUid, reopenedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function closeCashSessionV2(input: {
  db: Firestore;
  restaurantId: string;
  actorUid: string;
  actorRole: unknown;
  sessionId: unknown;
  discrepancyReason?: unknown;
}) {
  if (!cashV2Permissions(input.actorRole).canSupervise) throw new CashRegisterV2Error("CASH_REGISTER_SUPERVISE_REQUIRED", 403);
  const sessionId = str(input.sessionId, 128);
  const reason = str(input.discrepancyReason, 500);
  const ref = sessions(input.db, input.restaurantId).doc(sessionId);
  const current = await ref.get();
  if (!current.exists) throw new CashRegisterV2Error("CASH_SESSION_NOT_FOUND", 404);
  const data = current.data() as Record<string, unknown>;
  if (data.status !== "counted") throw new CashRegisterV2Error("CASH_SESSION_NOT_COUNTED", 409);
  const countedCash = num(data.countedCash, Number.NaN);
  const closeAtMs = Date.now();
  const totals = await ledgerTotals({
    db: input.db,
    restaurantId: input.restaurantId,
    sessionId,
    openedAtMs: ms(data.openedAtMs ?? data.openedAt),
    endAtMs: closeAtMs,
    openingFloat: num(data.openingFloat),
  });
  const difference = round(countedCash - totals.expectedCash);
  if (Math.abs(difference) > EPS && reason.length < 3) throw new CashRegisterV2Error("DISCREPANCY_REASON_REQUIRED");
  const stateRef = state(input.db, input.restaurantId);
  await input.db.runTransaction(async (tx) => {
    const [fresh, currentState] = await Promise.all([tx.get(ref), tx.get(stateRef)]);
    if (!fresh.exists) throw new CashRegisterV2Error("CASH_SESSION_NOT_FOUND", 404);
    if (fresh.data()?.status !== "counted") throw new CashRegisterV2Error("CASH_SESSION_NOT_COUNTED", 409);
    if (str(currentState.data()?.activeSessionId, 128) !== sessionId) throw new CashRegisterV2Error("CASH_SESSION_NOT_ACTIVE", 409);
    tx.update(ref, { status: "closed", difference, discrepancyReason: reason || null, closedTotals: totals, closedBy: input.actorUid, closedAt: FieldValue.serverTimestamp(), closedAtMs: closeAtMs, updatedAt: FieldValue.serverTimestamp() });
    tx.set(stateRef, { activeSessionId: null, lastClosedSessionId: sessionId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { difference, totals };
}
