export type CustomerProfile = {
  id: string;
  displayName: string;
  phone: string;
  email: string;
  birthday: string;
  vip: boolean;
  tags: string[];
  allergies: string;
  preferences: string;
  notes: string;
  identityKeys: string[];
  createdAtMs: number;
  updatedAtMs: number;
};

export type CustomerPaymentInput = {
  id: string;
  tableId: string;
  amount: number;
  refundAmount: number;
  status: string;
  createdAtMs: number;
};

export type CustomerVisit = {
  reservationId: string;
  date: string;
  time: string;
  status: string;
  partySize: number;
  tableLabel: string;
  occasion: string;
  notes: string;
  spend: number;
};

export type CustomerCrmRecord = {
  recordId: string;
  profileId: string | null;
  sourceKeys: string[];
  displayName: string;
  phone: string;
  email: string;
  birthday: string;
  vip: boolean;
  vipSuggested: boolean;
  tags: string[];
  allergies: string;
  preferences: string;
  notes: string;
  reservations: number;
  completedVisits: number;
  noShows: number;
  cancelled: number;
  futureReservations: number;
  totalPax: number;
  totalSpend: number;
  averageSpend: number;
  lastVisit: CustomerVisit | null;
  nextReservation: CustomerVisit | null;
  timeline: CustomerVisit[];
};

export type CustomerCrmSummary = {
  totalCustomers: number;
  vipCustomers: number;
  repeatCustomers: number;
  customersWithNoShow: number;
  totalAttributedSpend: number;
};

export type CustomerCrmSnapshot = {
  records: CustomerCrmRecord[];
  summary: CustomerCrmSummary;
  canEdit: boolean;
  canManageVip: boolean;
};
