import type { BillingCustomer } from "@/types/billing-customer";

function normalizeSearchToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

/**
 * Filtra clientes de facturación por razón social, CIF/NIF o email (client-side).
 */
export function searchBillingCustomers(
  customers: readonly BillingCustomer[],
  query: string,
  limit = 8,
): BillingCustomer[] {
  const raw = query.trim();
  if (!raw) return [];

  const q = raw.toLowerCase();
  const qCompact = normalizeSearchToken(raw);

  const matches = customers.filter((customer) => {
    const name = customer.companyName.toLowerCase();
    const email = customer.email.toLowerCase();
    const taxId = customer.taxId.toLowerCase();
    const taxIdCompact = normalizeSearchToken(customer.taxId);

    return (
      name.includes(q) ||
      email.includes(q) ||
      taxId.includes(q) ||
      (qCompact.length > 0 &&
        (taxIdCompact.includes(qCompact) || name.replace(/\s+/g, "").includes(qCompact)))
    );
  });

  matches.sort((a, b) =>
    a.companyName.localeCompare(b.companyName, "es", { sensitivity: "base" }),
  );

  return matches.slice(0, limit);
}
