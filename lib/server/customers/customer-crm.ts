import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import type { CustomerCrmRecord, CustomerCrmSnapshot, CustomerPaymentInput, CustomerProfile, CustomerVisit } from "@/lib/customers/types";

const HISTORY_YEARS = 3;

type IdentitySource = {
  customerName?: unknown;
  customerPhone?: unknown;
  customerEmail?: unknown;
  displayName?: unknown;
  phone?: unknown;
  email?: unknown;
};

type ReservationRow = Record<string, unknown> & IdentitySource & {
  id: string;
  date?: unknown;
  time?: unknown;
  status?: unknown;
  partySize?: unknown;
  durationMinutes?: unknown;
  tableId?: unknown;
  tableLabel?: unknown;
  occasion?: unknown;
  notes?: unknown;
  allergies?: unknown;
  preferences?: unknown;
};

function clean(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function toMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return value.toMillis();
  return 0;
}
function phoneKey(value: unknown): string {
  const valueClean = clean(value, 80).replace(/[^\d+]/g, "").replace(/^00/, "+");
  return valueClean ? `phone:${valueClean}` : "";
}
function emailKey(value: unknown): string {
  const valueClean = clean(value, 200).toLocaleLowerCase("es-ES");
  return valueClean ? `email:${valueClean}` : "";
}
function nameKey(value: unknown): string {
  const valueClean = clean(value, 160).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-ES").replace(/\s+/g, " ");
  return valueClean ? `name:${valueClean}` : "";
}
function identityKeys(data: IdentitySource): string[] {
  return [...new Set([
    phoneKey(data.customerPhone ?? data.phone),
    emailKey(data.customerEmail ?? data.email),
    nameKey(data.customerName ?? data.displayName),
  ].filter(Boolean))];
}
function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function reservationStartMs(date: string, time: string): number {
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}
function mapProfile(doc: DocumentSnapshot): CustomerProfile {
  const data = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    displayName: clean(data.displayName, 160),
    phone: clean(data.phone, 80),
    email: clean(data.email, 200),
    birthday: clean(data.birthday, 10),
    vip: data.vip === true,
    tags: Array.isArray(data.tags) ? data.tags.map((v) => clean(v, 40)).filter(Boolean).slice(0, 12) : [],
    allergies: clean(data.allergies, 500),
    preferences: clean(data.preferences, 500),
    notes: clean(data.notes, 1200),
    identityKeys: Array.isArray(data.identityKeys) ? data.identityKeys.map((v) => clean(v, 220)).filter(Boolean) : [],
    createdAtMs: toMs(data.createdAt),
    updatedAtMs: toMs(data.updatedAt),
  };
}

export function customerCrmPermissions(role: unknown) {
  return {
    canView: serverRoleHasCapability(role, "tpv.sell") || serverRoleHasCapability(role, "analytics.view"),
    canEdit: serverRoleHasCapability(role, "tpv.sell"),
    canManageVip: serverRoleHasCapability(role, "tpv.refund") || serverRoleHasCapability(role, "users.manage"),
  };
}

function attributableSpend(reservation: ReservationRow, payments: readonly CustomerPaymentInput[]): number {
  const tableId = clean(reservation.tableId, 160);
  if (!tableId || (reservation.status !== "completed" && reservation.status !== "seated")) return 0;
  const start = reservationStartMs(clean(reservation.date, 10), clean(reservation.time, 5));
  if (!start) return 0;
  const duration = Math.max(60, Math.min(360, Number(reservation.durationMinutes) || 120));
  const from = start - 30 * 60_000;
  const to = start + (duration + 180) * 60_000;
  return Math.round(payments.reduce((sum, payment) => {
    if (payment.tableId !== tableId || payment.createdAtMs < from || payment.createdAtMs > to) return sum;
    if (payment.status === "paid") return sum + payment.amount;
    if (payment.status === "refunded" || payment.status === "cancelled") return sum - (payment.refundAmount || payment.amount);
    return sum;
  }, 0) * 100) / 100;
}

export async function getCustomerCrmSnapshot(input: { db: Firestore; restaurantId: string; actorRole: unknown }): Promise<CustomerCrmSnapshot> {
  const permissions = customerCrmPermissions(input.actorRole);
  if (!permissions.canView) throw new Error("CUSTOMER_CRM_ACCESS_REQUIRED");
  const from = new Date();
  from.setFullYear(from.getFullYear() - HISTORY_YEARS);
  const [reservationSnap, profileSnap, paymentSnap] = await Promise.all([
    input.db.collection("reservations").where("restaurantId", "==", input.restaurantId).get(),
    input.db.collection("restaurants").doc(input.restaurantId).collection("customerProfiles").get(),
    input.db.collection("payments").where("restaurantId", "==", input.restaurantId).get(),
  ]);
  const reservations: ReservationRow[] = reservationSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }) as ReservationRow)
    .filter((row) => clean(row.date, 10) >= ymd(from));
  const profiles = profileSnap.docs.map(mapProfile);
  const payments: CustomerPaymentInput[] = paymentSnap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return { id: doc.id, tableId: clean(data.tableId, 160), amount: money(data.amount ?? data.total), refundAmount: money(data.refundAmount), status: clean(data.status, 32).toLowerCase(), createdAtMs: toMs(data.createdAt) };
  });
  const groups = new Map<string, ReservationRow[]>();
  for (const reservation of reservations) {
    const keys = identityKeys(reservation);
    if (!keys.length) continue;
    const key = keys[0]!;
    const existing = groups.get(key) ?? [];
    existing.push(reservation);
    groups.set(key, existing);
  }
  const usedProfileIds = new Set<string>();
  const records: CustomerCrmRecord[] = [];
  for (const [sourceKey, rows] of groups) {
    rows.sort((a, b) => `${clean(a.date, 10)}T${clean(a.time, 5)}`.localeCompare(`${clean(b.date, 10)}T${clean(b.time, 5)}`));
    const sourceKeys = [...new Set(rows.flatMap(identityKeys))];
    const profile = profiles.find((item) => item.identityKeys.some((key) => sourceKeys.includes(key))) ?? null;
    if (profile) usedProfileIds.add(profile.id);
    const latest = rows[rows.length - 1]!;
    const completedRows = rows.filter((row) => row.status === "completed");
    const today = ymd(new Date());
    const futureRows = rows.filter((row) => clean(row.date, 10) > today && row.status !== "cancelled" && row.status !== "no_show");
    const visits: CustomerVisit[] = rows.map((row) => ({
      reservationId: row.id, date: clean(row.date, 10), time: clean(row.time, 5), status: clean(row.status, 32), partySize: Math.max(1, Number(row.partySize) || 1), tableLabel: clean(row.tableLabel, 160), occasion: clean(row.occasion, 160), notes: clean(row.notes, 1000), spend: attributableSpend(row, payments),
    }));
    const totalSpend = Math.round(visits.reduce((sum, visit) => sum + visit.spend, 0) * 100) / 100;
    const latestField = (field: string, max = 500) => [...rows].reverse().map((r) => clean(r[field], max)).find(Boolean) ?? "";
    const displayName = profile?.displayName || clean(latest.customerName, 160) || "Cliente";
    records.push({
      recordId: profile?.id || sourceKey, profileId: profile?.id ?? null, sourceKeys, displayName,
      phone: profile?.phone || clean(latest.customerPhone, 80), email: profile?.email || clean(latest.customerEmail, 200), birthday: profile?.birthday || "",
      vip: profile?.vip === true, vipSuggested: completedRows.length >= 5 || totalSpend >= 500, tags: profile?.tags ?? [],
      allergies: profile?.allergies || latestField("allergies"), preferences: profile?.preferences || latestField("preferences"), notes: profile?.notes || latestField("notes", 1200),
      reservations: rows.length, completedVisits: completedRows.length, noShows: rows.filter((r) => r.status === "no_show").length, cancelled: rows.filter((r) => r.status === "cancelled").length,
      futureReservations: futureRows.length, totalPax: rows.reduce((sum, row) => sum + Math.max(1, Number(row.partySize) || 1), 0), totalSpend,
      averageSpend: completedRows.length ? Math.round((totalSpend / completedRows.length) * 100) / 100 : 0,
      lastVisit: [...visits].reverse().find((visit) => visit.date <= today && visit.status !== "cancelled") ?? null,
      nextReservation: visits.find((visit) => visit.date > today && visit.status !== "cancelled" && visit.status !== "no_show") ?? null,
      timeline: [...visits].reverse().slice(0, 20),
    });
  }
  for (const profile of profiles) {
    if (usedProfileIds.has(profile.id)) continue;
    records.push({ recordId: profile.id, profileId: profile.id, sourceKeys: profile.identityKeys, displayName: profile.displayName || "Cliente", phone: profile.phone, email: profile.email, birthday: profile.birthday, vip: profile.vip, vipSuggested: false, tags: profile.tags, allergies: profile.allergies, preferences: profile.preferences, notes: profile.notes, reservations: 0, completedVisits: 0, noShows: 0, cancelled: 0, futureReservations: 0, totalPax: 0, totalSpend: 0, averageSpend: 0, lastVisit: null, nextReservation: null, timeline: [] });
  }
  records.sort((a, b) => Number(b.vip) - Number(a.vip) || b.completedVisits - a.completedVisits || b.totalSpend - a.totalSpend || a.displayName.localeCompare(b.displayName, "es"));
  return {
    records,
    summary: { totalCustomers: records.length, vipCustomers: records.filter((r) => r.vip).length, repeatCustomers: records.filter((r) => r.completedVisits >= 2).length, customersWithNoShow: records.filter((r) => r.noShows > 0).length, totalAttributedSpend: Math.round(records.reduce((sum, r) => sum + r.totalSpend, 0) * 100) / 100 },
    canEdit: permissions.canEdit,
    canManageVip: permissions.canManageVip,
  };
}

export async function saveCustomerProfile(input: { db: Firestore; restaurantId: string; actorUid: string; actorRole: unknown; payload: Record<string, unknown> }) {
  const permissions = customerCrmPermissions(input.actorRole);
  if (!permissions.canEdit) throw new Error("CUSTOMER_CRM_EDIT_REQUIRED");
  const displayName = clean(input.payload.displayName, 160);
  if (!displayName) throw new Error("CUSTOMER_NAME_REQUIRED");
  const phone = clean(input.payload.phone, 80);
  const email = clean(input.payload.email, 200).toLocaleLowerCase("es-ES");
  const birthday = clean(input.payload.birthday, 10);
  if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) throw new Error("INVALID_BIRTHDAY");
  const requestedVip = input.payload.vip === true;
  const tags = Array.isArray(input.payload.tags) ? [...new Set(input.payload.tags.map((tag) => clean(tag, 40)).filter(Boolean))].slice(0, 12) : [];
  const suppliedKeys = Array.isArray(input.payload.sourceKeys) ? input.payload.sourceKeys.map((key) => clean(key, 220)).filter(Boolean) : [];
  const keys = [...new Set([...identityKeys({ displayName, phone, email }), ...suppliedKeys])];
  if (!keys.length) throw new Error("CUSTOMER_IDENTITY_REQUIRED");
  const profileId = clean(input.payload.profileId, 160);
  const ref = profileId ? input.db.collection("restaurants").doc(input.restaurantId).collection("customerProfiles").doc(profileId) : input.db.collection("restaurants").doc(input.restaurantId).collection("customerProfiles").doc();
  await input.db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    const currentVip = current.exists && current.data()?.vip === true;
    if (requestedVip !== currentVip && !permissions.canManageVip) throw new Error("CUSTOMER_VIP_MANAGE_REQUIRED");
    tx.set(ref, {
      restaurantId: input.restaurantId, displayName, phone: phone || null, email: email || null, birthday: birthday || null, vip: requestedVip,
      tags, allergies: clean(input.payload.allergies, 500) || null, preferences: clean(input.payload.preferences, 500) || null, notes: clean(input.payload.notes, 1200) || null,
      identityKeys: keys, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorUid,
      ...(current.exists ? {} : { createdAt: FieldValue.serverTimestamp(), createdBy: input.actorUid }),
    }, { merge: true });
  });
  return { profileId: ref.id };
}
