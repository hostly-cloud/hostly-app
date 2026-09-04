export type CustomerSegment =
  | "vip"
  | "frequent"
  | "new"
  | "inactive"
  | "birthday_30d"
  | "no_show"
  | "high_spend"
  | "marketing_opt_in";

export type MarketingConsent = "unknown" | "granted" | "denied";

export type SegmentInput = {
  vip: boolean;
  completedVisits: number;
  noShows: number;
  totalSpend: number;
  birthday?: string;
  lastVisitDate?: string;
  marketingConsent?: MarketingConsent;
};

function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function daysUntilBirthday(birthday: string, today = new Date()): number | null {
  const parsed = parseYmd(birthday);
  if (!parsed) return null;
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (next.getTime() < current.getTime()) {
    next = new Date(today.getFullYear() + 1, parsed.getMonth(), parsed.getDate());
  }
  return Math.round((next.getTime() - current.getTime()) / 86_400_000);
}

export function customerSegments(input: SegmentInput, today = new Date()): CustomerSegment[] {
  const out: CustomerSegment[] = [];
  if (input.vip) out.push("vip");
  if (input.completedVisits >= 5) out.push("frequent");
  if (input.completedVisits <= 1) out.push("new");
  if (input.noShows > 0) out.push("no_show");
  if (input.totalSpend >= 500) out.push("high_spend");
  if (input.marketingConsent === "granted") out.push("marketing_opt_in");
  const birthdayDays = daysUntilBirthday(input.birthday ?? "", today);
  if (birthdayDays != null && birthdayDays <= 30) out.push("birthday_30d");
  const lastVisit = parseYmd(input.lastVisitDate ?? "");
  if (lastVisit && today.getTime() - lastVisit.getTime() > 90 * 86_400_000) out.push("inactive");
  return out;
}

export function availableLoyaltyRewards(input: {
  completedVisits: number;
  visitGoal: number;
  redemptions: number;
  enabled: boolean;
}): number {
  if (!input.enabled) return 0;
  const goal = Math.max(2, Math.min(50, Math.round(input.visitGoal || 0)));
  const earned = Math.floor(Math.max(0, input.completedVisits) / goal);
  return Math.max(0, earned - Math.max(0, Math.round(input.redemptions || 0)));
}

export function netPaymentAmount(input: {
  amount: number;
  refundAmount?: number;
  status: string;
}): number {
  const amount = Math.max(0, Number(input.amount) || 0);
  const refunded = Math.max(0, Number(input.refundAmount) || 0);
  const status = String(input.status || "").toLowerCase();
  if (status === "paid") return Math.round(amount * 100) / 100;
  if (status === "refunded" || status === "cancelled") {
    return Math.max(0, Math.round((amount - (refunded || amount)) * 100) / 100);
  }
  return 0;
}
