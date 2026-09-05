import type { Firestore } from "firebase-admin/firestore";

export type FiscalInvoiceListFilters = {
  fromMs?: number;
  toMs?: number;
  status?: string;
  documentKind?: string;
  query?: string;
  limit?: number;
};

export type FiscalInvoiceListRow = Record<string, unknown> & {
  id: string;
  recordId: string;
  deliveryStatus: string;
  delivery: Record<string, unknown> | null;
};

function validTime(value: number | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

export async function listFiscalInvoices(
  db: Firestore,
  restaurantId: string,
  filters: FiscalInvoiceListFilters = {},
): Promise<FiscalInvoiceListRow[]> {
  const max = Math.min(500, Math.max(1, Math.floor(filters.limit ?? 200)));
  let query = db.collection("fiscalInvoices")
    .where("restaurantId", "==", restaurantId)
    .orderBy("issuedAtMs", "desc") as FirebaseFirestore.Query;
  if (validTime(filters.fromMs)) query = query.where("issuedAtMs", ">=", filters.fromMs);
  if (validTime(filters.toMs)) query = query.where("issuedAtMs", "<=", filters.toMs);
  const snapshot = await query.limit(max).get();
  let docs = snapshot.docs;
  if (filters.documentKind) docs = docs.filter((doc) => doc.data().documentKind === filters.documentKind);
  const normalizedQuery = filters.query?.trim().toLocaleLowerCase("es") ?? "";
  if (normalizedQuery) {
    docs = docs.filter((doc) => {
      const data = doc.data();
      return [data.invoiceNumber, data.customerSnapshot?.legalName, data.customerSnapshot?.nif]
        .some((value) => String(value ?? "").toLocaleLowerCase("es").includes(normalizedQuery));
    });
  }
  const deliveryRefs = docs.map((doc) => db.collection("fiscalDeliveryStates").doc(String(doc.data().recordId)));
  const deliverySnapshots = deliveryRefs.length ? await db.getAll(...deliveryRefs) : [];
  const deliveries = new Map(deliverySnapshots.map((snap) => [snap.id, snap.exists ? snap.data()! : null]));
  const rows = docs.map((doc) => {
    const data = doc.data();
    const recordId = String(data.recordId);
    const delivery = deliveries.get(recordId) ?? null;
    return { id: doc.id, ...data, recordId, deliveryStatus: String(delivery?.status ?? data.initialDeliveryStatus ?? "pending"), delivery };
  });
  return filters.status ? rows.filter((row) => row.deliveryStatus === filters.status) : rows;
}

function safeCsvText(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildFiscalInvoicesCsv(rows: readonly FiscalInvoiceListRow[]): string {
  const header = ["Número", "Fecha", "Tipo", "Cliente", "NIF cliente", "Base imponible", "IVA", "Total", "Métodos de pago", "Estado AEAT", "Factura original"];
  const lines = rows.map((row) => {
    const totals = (row.totals ?? {}) as Record<string, unknown>;
    const customer = (row.customerSnapshot ?? {}) as Record<string, unknown>;
    return [
      safeCsvText(row.invoiceNumber),
      safeCsvText(row.issueDate),
      safeCsvText(row.documentKind),
      safeCsvText(customer.legalName),
      safeCsvText(customer.nif),
      (Number(totals.taxableBaseCents) / 100).toFixed(2),
      (Number(totals.taxAmountCents) / 100).toFixed(2),
      (Number(totals.totalCents) / 100).toFixed(2),
      safeCsvText(Array.isArray(row.paymentMethods) ? row.paymentMethods.join("+") : ""),
      safeCsvText(row.deliveryStatus),
      safeCsvText(row.originalInvoiceId),
    ];
  });
  return `\uFEFF${[header.map(safeCsvText).join(";"), ...lines.map((line) => line.join(";"))].join("\r\n")}\r\n`;
}
