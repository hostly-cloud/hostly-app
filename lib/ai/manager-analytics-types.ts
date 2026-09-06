import type { HostlyPlan } from "@/lib/subscription/hostly-plan";

export type ManagerAnalyticsSeverity = "positive" | "neutral" | "watch" | "critical";

export type ManagerAnalyticsSignal = {
  key: string;
  severity: ManagerAnalyticsSeverity;
  title: string;
  detail: string;
  evidence: string;
};

export type ManagerAnalyticsAction = {
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
};

export type ManagerAnalyticsContext = {
  range: {
    from: string;
    to: string;
    days: number;
    previousFrom: string;
    previousTo: string;
  };
  sales: {
    total: number;
    payments: number;
    averageTicket: number;
    previousTotal: number;
    previousPayments: number;
    previousAverageTicket: number;
    deltaPercent: number | null;
    averageTicketDeltaPercent: number | null;
    cash: number;
    card: number;
    voucher: number;
  };
  reservations: {
    total: number;
    attended: number;
    noShow: number;
    noShowRate: number;
    previousTotal: number;
    previousNoShow: number;
    previousNoShowRate: number;
  };
  operations: {
    activeOrders: number;
    pendingItems: number;
    preparingItems: number;
    readyItems: number;
  };
  dataQuality: {
    alerts: string[];
  };
};

export type ManagerAnalyticsReport = {
  headline: string;
  summary: string;
  signals: ManagerAnalyticsSignal[];
  actions: ManagerAnalyticsAction[];
};

export type ManagerAnalyticsResult = {
  generatedAtMs: number;
  source: "ai" | "heuristic";
  model: string | null;
  context: ManagerAnalyticsContext;
  report: ManagerAnalyticsReport;
};

export type ManagerAnalyticsAccessResponse = {
  ok: true;
  effectivePlan: HostlyPlan;
  entitled: boolean;
  canGenerate: boolean;
};

export type ManagerAnalyticsGenerationResponse =
  | (ManagerAnalyticsAccessResponse & {
      entitled: true;
      canGenerate: true;
      result: ManagerAnalyticsResult;
    })
  | ManagerAnalyticsAccessResponse
  | {
      ok: false;
      error: string;
    };
