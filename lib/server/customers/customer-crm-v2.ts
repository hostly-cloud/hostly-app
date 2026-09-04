import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { getCustomerCrmSnapshot, customerCrmPermissions } from "@/lib/server/customers/customer-crm";
import { availableLoyaltyRewards, customerSegments, netPaymentAmount, type MarketingConsent } from "@/lib/customers/crm-v2-policy";
import type { CustomerCrmSnapshot, CustomerLoyaltyConfig, CustomerVisit, TpvCustomerOrder } from "@/lib/customers/types";
import { isActiveOrderStatus } from "@/lib/server/tpv/table-group-order-utils";

function clean(value: unknown, max = 500): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function toMs(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as {toMillis?:()=>number}).toMillis === "function") return (value as {toMillis:()=>number}).toMillis();
  return 0;
}
function money(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function moment(ms: number) { const d = new Date(ms || Date.now()); return { date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`, time: `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}` }; }
function readConsent(value: unknown): MarketingConsent { return value === "granted" || value === "denied" ? value : "unknown"; }
function loyaltyConfig(data: Record<string, unknown> | undefined): CustomerLoyaltyConfig {
  return { enabled: data?.enabled === true, visitGoal: Math.max(2, Math.min(50, Math.round(Number(data?.visitGoal) || 10))), rewardLabel: clean(data?.rewardLabel, 120) || "Detalle de la casa" };
}

export async function getCustomerCrmSnapshotV2(input: { db: Firestore; restaurantId: string; actorRole: unknown }): Promise<CustomerCrmSnapshot> {
  const base = await getCustomerCrmSnapshot(input);
  const [profilesSnap, ordersSnap, paymentsSnap, loyaltySnap] = await Promise.all([
    input.db.collection("restaurants").doc(input.restaurantId).collection("customerProfiles").get(),
    input.db.collection("orders").where("restaurantId", "==", input.restaurantId).get(),
    input.db.collection("payments").where("restaurantId", "==", input.restaurantId).get(),
    input.db.collection("restaurants").doc(input.restaurantId).collection("config").doc("customerLoyalty").get(),
  ]);
  const loyalty = loyaltyConfig(loyaltySnap.data() as Record<string, unknown> | undefined);
  const profileData = new Map(profilesSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const payments = paymentsSnap.docs.map((doc) => { const d = doc.data() as Record<string, unknown>; return { id: doc.id, tableId: clean(d.tableId,160), orderSessionId: clean(d.orderSessionId,160), createdAtMs: toMs(d.createdAt), amount: money(d.amount ?? d.total), refundAmount: money(d.refundAmount), status: clean(d.status,32) }; });
  const activeOrders: TpvCustomerOrder[] = [];
  const visitsByProfile = new Map<string, CustomerVisit[]>();

  for (const doc of ordersSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const tableId = clean(d.tableId,160);
    const profileId = clean(d.customerProfileId,160);
    const openedAtMs = toMs(d.createdAt) || toMs(d.openedAt) || toMs(d.updatedAt);
    if (isActiveOrderStatus(d.status)) activeOrders.push({ orderId: doc.id, tableId, tableLabel: clean(d.tableLabel ?? d.tableName,160) || tableId, customerProfileId: profileId || null, customerName: clean(d.customerName,160), openedAtMs });
    if (!profileId) continue;
    const closedAtMs = toMs(d.closedAt) || toMs(d.updatedAt) || Date.now();
    if (isActiveOrderStatus(d.status)) continue;
    const orderPayments = payments.filter((p) => p.orderSessionId === doc.id || (p.tableId === tableId && p.createdAtMs >= openedAtMs - 15*60_000 && p.createdAtMs <= closedAtMs + 90*60_000));
    const spend = Math.max(0, Math.round(orderPayments.reduce((sum,p) => sum + netPaymentAmount(p), 0) * 100) / 100);
    const when = moment(openedAtMs);
    const visit: CustomerVisit = { reservationId: `order:${doc.id}`, id: `order:${doc.id}`, source: "tpv", date: when.date, time: when.time, status: clean(d.status,32) || "closed", partySize: Math.max(1, Math.round(Number(d.diners ?? d.partySize) || 1)), tableLabel: clean(d.tableLabel ?? d.tableName,160) || tableId, occasion: "", notes: "", spend };
    visitsByProfile.set(profileId, [...(visitsByProfile.get(profileId) ?? []), visit]);
  }
  activeOrders.sort((a,b) => a.tableLabel.localeCompare(b.tableLabel,"es"));

  for (const record of base.records) {
    const profile = record.profileId ? profileData.get(record.profileId) : undefined;
    const marketingConsent = readConsent(profile?.marketingConsent);
    const redemptions = Math.max(0, Math.round(Number(profile?.loyaltyRedemptions) || 0));
    const tpvVisits = record.profileId ? (visitsByProfile.get(record.profileId) ?? []) : [];
    const reservationKeys = new Set(record.timeline.map(v => `${v.date}|${v.tableLabel}`));
    const uniqueTpv = tpvVisits.filter(v => !reservationKeys.has(`${v.date}|${v.tableLabel}`));
    const combined = [...record.timeline, ...tpvVisits].sort((a,b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)).slice(0,30);
    const spendFromTpv = Math.round(tpvVisits.reduce((s,v)=>s+v.spend,0)*100)/100;
    const totalSpend = Math.max(record.totalSpend, spendFromTpv);
    const completedVisits = record.completedVisits + uniqueTpv.length;
    const lastVisit = combined.find(v => v.status !== "cancelled" && v.status !== "no_show") ?? record.lastVisit;
    const available = availableLoyaltyRewards({ completedVisits, visitGoal: loyalty.visitGoal, redemptions, enabled: loyalty.enabled });
    record.marketingConsent = marketingConsent;
    record.tpvVisits = tpvVisits.length;
    record.completedVisits = completedVisits;
    record.totalSpend = totalSpend;
    record.averageSpend = completedVisits ? Math.round((totalSpend/completedVisits)*100)/100 : 0;
    record.timeline = combined;
    record.lastVisit = lastVisit;
    record.loyaltyRedemptions = redemptions;
    record.loyaltyAvailableRewards = available;
    record.loyaltyProgress = loyalty.enabled ? completedVisits % loyalty.visitGoal : 0;
    record.segments = customerSegments({ vip: record.vip, completedVisits, noShows: record.noShows, totalSpend, birthday: record.birthday, lastVisitDate: lastVisit?.date, marketingConsent });
  }
  base.records.sort((a,b) => Number(b.vip)-Number(a.vip) || (b.completedVisits-a.completedVisits) || (b.totalSpend-a.totalSpend));
  const permissions = customerCrmPermissions(input.actorRole);
  return { ...base, loyalty, activeOrders, canManageLoyalty: permissions.canManageVip, summary: { ...base.summary, marketingOptIn: base.records.filter(r=>r.marketingConsent === "granted").length, rewardsAvailable: base.records.reduce((s,r)=>s+(r.loyaltyAvailableRewards ?? 0),0), totalAttributedSpend: Math.round(base.records.reduce((s,r)=>s+r.totalSpend,0)*100)/100 } };
}

export async function attachCustomerToOrder(input: { db: Firestore; restaurantId: string; actorUid: string; actorRole: unknown; tableId: string; orderId?: string; profileId: string }) {
  const permissions = customerCrmPermissions(input.actorRole); if (!permissions.canEdit) throw new Error("CUSTOMER_CRM_EDIT_REQUIRED");
  const profileId = clean(input.profileId,160); const tableId = clean(input.tableId,160); if (!profileId || !tableId) throw new Error("CUSTOMER_AND_TABLE_REQUIRED");
  const profileRef = input.db.collection("restaurants").doc(input.restaurantId).collection("customerProfiles").doc(profileId);
  const profileSnap = await profileRef.get(); if (!profileSnap.exists) throw new Error("CUSTOMER_NOT_FOUND");
  const p = profileSnap.data() as Record<string, unknown>;
  let orderDoc: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null = null;
  if (clean(input.orderId,160)) { const snap = await input.db.collection("orders").doc(clean(input.orderId,160)).get(); if (snap.exists) orderDoc = snap; }
  else { const snap = await input.db.collection("orders").where("restaurantId","==",input.restaurantId).get(); const matches = snap.docs.filter(d => { const x=d.data(); return clean(x.tableId,160)===tableId && isActiveOrderStatus(x.status); }); if (matches.length > 1) throw new Error("MULTIPLE_ACTIVE_ORDERS"); orderDoc = matches[0] ?? null; }
  if (!orderDoc?.exists) throw new Error("ACTIVE_ORDER_NOT_FOUND");
  const o = orderDoc.data() as Record<string, unknown>; if (clean(o.restaurantId,120)!==input.restaurantId) throw new Error("ORDER_TENANT_MISMATCH"); if (clean(o.tableId,160)!==tableId) throw new Error("ORDER_TABLE_MISMATCH"); if (!isActiveOrderStatus(o.status)) throw new Error("ORDER_NOT_ACTIVE");
  await orderDoc.ref.update({ customerProfileId: profileId, customerName: clean(p.displayName,160), customerPhone: clean(p.phone,80)||null, customerEmail: clean(p.email,200)||null, customerAttachedAt: FieldValue.serverTimestamp(), customerAttachedBy: input.actorUid });
  return { orderId: orderDoc.id, profileId };
}

export async function detachCustomerFromOrder(input: { db: Firestore; restaurantId: string; actorRole: unknown; orderId: string }) {
  if (!customerCrmPermissions(input.actorRole).canEdit) throw new Error("CUSTOMER_CRM_EDIT_REQUIRED");
  const ref=input.db.collection("orders").doc(clean(input.orderId,160)); const snap=await ref.get(); if(!snap.exists) throw new Error("ORDER_NOT_FOUND"); const d=snap.data() as Record<string,unknown>; if(clean(d.restaurantId,120)!==input.restaurantId) throw new Error("ORDER_TENANT_MISMATCH");
  await ref.update({ customerProfileId: FieldValue.delete(), customerName: FieldValue.delete(), customerPhone: FieldValue.delete(), customerEmail: FieldValue.delete(), customerAttachedAt: FieldValue.delete(), customerAttachedBy: FieldValue.delete() }); return { orderId: ref.id };
}

export async function saveLoyaltyConfig(input: { db: Firestore; restaurantId: string; actorUid: string; actorRole: unknown; payload: Record<string, unknown> }) {
  if (!customerCrmPermissions(input.actorRole).canManageVip) throw new Error("CUSTOMER_LOYALTY_MANAGE_REQUIRED"); const cfg=loyaltyConfig(input.payload);
  await input.db.collection("restaurants").doc(input.restaurantId).collection("config").doc("customerLoyalty").set({ ...cfg, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorUid },{merge:true}); return cfg;
}

export async function redeemLoyaltyReward(input: { db: Firestore; restaurantId: string; actorUid: string; actorRole: unknown; profileId: string }) {
  if (!customerCrmPermissions(input.actorRole).canManageVip) throw new Error("CUSTOMER_LOYALTY_MANAGE_REQUIRED"); const ref=input.db.collection("restaurants").doc(input.restaurantId).collection("customerProfiles").doc(clean(input.profileId,160));
  await input.db.runTransaction(async tx=>{ const snap=await tx.get(ref); if(!snap.exists) throw new Error("CUSTOMER_NOT_FOUND"); tx.set(ref,{ loyaltyRedemptions: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorUid },{merge:true}); const event=ref.collection("loyaltyEvents").doc(); tx.create(event,{ type:"reward_redeemed", createdAt:FieldValue.serverTimestamp(), createdBy:input.actorUid }); }); return { profileId: ref.id };
}
