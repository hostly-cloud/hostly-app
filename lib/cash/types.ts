export type CashSessionStatus = "open" | "counted" | "closed";
export type CashMovementType = "cash_in" | "cash_out";
export type CashPaymentMethod = "cash" | "card" | "voucher" | "other";

export type CashTotals = {
  grossSales: number;
  cashSales: number;
  cardSales: number;
  voucherSales: number;
  otherSales: number;
  refunds: number;
  cashRefunds: number;
  tips: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  paymentCount: number;
  refundCount: number;
};

export type CashMovementView = {
  id: string;
  type: CashMovementType;
  amount: number;
  reason: string;
  createdAtMs: number;
  createdBy: string;
  createdByEmail?: string;
};

export type CashSessionView = {
  id: string;
  registerId: string;
  registerName: string;
  operatorUid: string;
  operatorEmail: string;
  status: CashSessionStatus;
  openedAtMs: number;
  closedAtMs: number | null;
  openingFloat: number;
  countedCash: number | null;
  difference: number | null;
  discrepancyReason: string | null;
  countedBy: string | null;
  closedBy: string | null;
  totals: CashTotals | null;
  movements: CashMovementView[];
  canSeeExpected: boolean;
  canClose: boolean;
};

export type CashWorkspaceSnapshot = {
  activeSession: CashSessionView | null;
  history: CashSessionView[];
  canOperate: boolean;
  canSupervise: boolean;
};
