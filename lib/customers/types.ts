import type { CustomerSegment, MarketingConsent } from "@/lib/customers/crm-v2-policy";

export type CustomerProfile = {
  id: string; displayName: string; phone: string; email: string; birthday: string; vip: boolean;
  tags: string[]; allergies: string; preferences: string; notes: string; identityKeys: string[];
  marketingConsent?: MarketingConsent; marketingConsentAtMs?: number; loyaltyRedemptions?: number;
  createdAtMs: number; updatedAtMs: number;
};
export type CustomerPaymentInput = { id: string; tableId: string; orderSessionId?: string; amount: number; refundAmount: number; status: string; createdAtMs: number };
export type CustomerVisit = {
  reservationId: string; id?: string; source?: "reservation" | "tpv"; date: string; time: string; status: string;
  partySize: number; tableLabel: string; occasion: string; notes: string; spend: number;
};
export type CustomerLoyaltyConfig = { enabled: boolean; visitGoal: number; rewardLabel: string };
export type CustomerCrmRecord = {
  recordId: string; profileId: string | null; sourceKeys: string[]; displayName: string; phone: string; email: string;
  birthday: string; vip: boolean; vipSuggested: boolean; tags: string[]; allergies: string; preferences: string; notes: string;
  marketingConsent?: MarketingConsent; reservations: number; tpvVisits?: number; completedVisits: number; noShows: number; cancelled: number;
  futureReservations: number; totalPax: number; totalSpend: number; averageSpend: number; segments?: CustomerSegment[];
  loyaltyRedemptions?: number; loyaltyAvailableRewards?: number; loyaltyProgress?: number;
  lastVisit: CustomerVisit | null; nextReservation: CustomerVisit | null; timeline: CustomerVisit[];
};
export type TpvCustomerOrder = { orderId: string; tableId: string; tableLabel: string; customerProfileId: string | null; customerName: string; openedAtMs: number };
export type CustomerCrmSummary = {
  totalCustomers: number; vipCustomers: number; repeatCustomers: number; customersWithNoShow: number;
  marketingOptIn?: number; rewardsAvailable?: number; totalAttributedSpend: number;
};
export type CustomerCrmSnapshot = {
  records: CustomerCrmRecord[]; summary: CustomerCrmSummary; loyalty?: CustomerLoyaltyConfig; activeOrders?: TpvCustomerOrder[];
  canEdit: boolean; canManageVip: boolean; canManageLoyalty?: boolean;
};
