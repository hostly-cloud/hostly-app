import { normalizeValidGtin } from "@/lib/productos/gtin";

export type ProductGtinAuditRecord = {
  productId: string;
  barcode?: unknown;
  ean?: unknown;
  ean13?: unknown;
  gtin?: unknown;
};

export type ProductGtinIndexAuditRecord = {
  gtin: string;
  productId?: unknown;
};

export type ProductGtinAuditFinding =
  | { type: "invalid_product_gtin"; productId: string; rawValue: string }
  | { type: "duplicate_product_gtin"; gtin: string; productIds: string[] }
  | { type: "missing_index"; gtin: string; productId: string }
  | { type: "wrong_index_owner"; gtin: string; expectedProductId: string; actualProductId: string }
  | { type: "orphan_index"; gtin: string; productId: string }
  | { type: "invalid_index_gtin"; gtin: string; productId: string };

export type ProductGtinRepairPlanAction =
  | { action: "reserve_index"; gtin: string; productId: string }
  | { action: "replace_index_owner"; gtin: string; productId: string; previousProductId: string }
  | { action: "delete_orphan_index"; gtin: string; productId: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readLegacyProductGtin(record: ProductGtinAuditRecord): {
  rawValue: string;
  normalized: string;
} {
  const rawValue =
    text(record.barcode) || text(record.ean) || text(record.ean13) || text(record.gtin);
  return {
    rawValue,
    normalized: rawValue ? normalizeValidGtin(rawValue) ?? "" : "",
  };
}

export function auditProductGtinIndex(params: {
  products: ProductGtinAuditRecord[];
  indexes: ProductGtinIndexAuditRecord[];
}): {
  findings: ProductGtinAuditFinding[];
  repairPlan: ProductGtinRepairPlanAction[];
  stats: {
    products: number;
    productsWithGtin: number;
    indexes: number;
    findings: number;
    repairActions: number;
  };
} {
  const findings: ProductGtinAuditFinding[] = [];
  const repairPlan: ProductGtinRepairPlanAction[] = [];
  const ownersByGtin = new Map<string, string[]>();
  const validProductGtin = new Map<string, string>();

  for (const product of params.products) {
    const productId = product.productId.trim();
    if (!productId) continue;
    const gtin = readLegacyProductGtin(product);
    if (!gtin.rawValue) continue;
    if (!gtin.normalized) {
      findings.push({
        type: "invalid_product_gtin",
        productId,
        rawValue: gtin.rawValue,
      });
      continue;
    }
    validProductGtin.set(productId, gtin.normalized);
    const owners = ownersByGtin.get(gtin.normalized) ?? [];
    owners.push(productId);
    ownersByGtin.set(gtin.normalized, owners);
  }

  for (const [gtin, productIds] of ownersByGtin) {
    if (productIds.length > 1) {
      findings.push({ type: "duplicate_product_gtin", gtin, productIds: [...productIds].sort() });
    }
  }

  const indexByGtin = new Map<string, string>();
  for (const index of params.indexes) {
    const productId = text(index.productId);
    const normalized = normalizeValidGtin(index.gtin);
    if (!normalized) {
      findings.push({ type: "invalid_index_gtin", gtin: index.gtin, productId });
      continue;
    }
    indexByGtin.set(normalized, productId);
  }

  for (const [productId, gtin] of validProductGtin) {
    const productIds = ownersByGtin.get(gtin) ?? [];
    if (productIds.length !== 1) continue;
    const indexOwner = indexByGtin.get(gtin);
    if (indexOwner == null) {
      findings.push({ type: "missing_index", gtin, productId });
      repairPlan.push({ action: "reserve_index", gtin, productId });
    } else if (indexOwner !== productId) {
      findings.push({
        type: "wrong_index_owner",
        gtin,
        expectedProductId: productId,
        actualProductId: indexOwner,
      });
      repairPlan.push({
        action: "replace_index_owner",
        gtin,
        productId,
        previousProductId: indexOwner,
      });
    }
  }

  for (const [gtin, productId] of indexByGtin) {
    const expectedGtin = validProductGtin.get(productId);
    if (expectedGtin !== gtin) {
      findings.push({ type: "orphan_index", gtin, productId });
      repairPlan.push({ action: "delete_orphan_index", gtin, productId });
    }
  }

  const productsWithGtin = [...validProductGtin.keys()].length;
  return {
    findings,
    repairPlan,
    stats: {
      products: params.products.length,
      productsWithGtin,
      indexes: params.indexes.length,
      findings: findings.length,
      repairActions: repairPlan.length,
    },
  };
}
