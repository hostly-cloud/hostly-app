import type { ProductDocument } from "@/lib/firestore/products";
import type { SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import type { ResolvedSaleModifier } from "@/lib/server/tpv/load-tpv-catalog-admin";
import { modifierInventoryFieldsToPayload } from "@/lib/modifiers/modifier-inventory-consumption";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";

export type BuildAuthoritativeSaleLineParams = {
  intent: SaleLineIntent;
  product: ProductDocument;
  modifiers: ResolvedSaleModifier[];
  existing?: Record<string, unknown>;
  defaultStatus?: "pending" | "sent";
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildAuthoritativeSaleLine(
  params: BuildAuthoritativeSaleLineParams,
): Record<string, unknown> {
  const { intent, product, modifiers, existing } = params;
  const basePrice = Number(product.price);
  const modifierTotal = modifiers.reduce((acc, m) => acc + m.priceDelta, 0);
  const unitPrice = roundMoney(basePrice + modifierTotal);
  const quantity = intent.quantity;
  const lineTotal = roundMoney(unitPrice * quantity);
  const displayName =
    modifiers.length > 0
      ? `${product.name} · ${modifiers.map((m) => m.optionName).join(" · ")}`
      : product.name;

  const preservedStatus = existing
    ? normalizeProductionLineStatus(existing.status)
    : params.defaultStatus ?? "pending";
  const status =
    preservedStatus === "cancelled"
      ? "cancelled"
      : params.defaultStatus && !existing
        ? params.defaultStatus
        : preservedStatus;

  const categoryName =
    typeof product.categoryName === "string" && product.categoryName.trim() !== ""
      ? product.categoryName.trim()
      : undefined;
  const operationStationId =
    typeof product.operationStationId === "string" &&
    product.operationStationId.trim() !== ""
      ? product.operationStationId.trim()
      : undefined;
  const operationStationName =
    typeof product.operationStationName === "string" &&
    product.operationStationName.trim() !== ""
      ? product.operationStationName.trim()
      : undefined;
  const course =
    typeof product.course === "number" && Number.isFinite(product.course)
      ? product.course
      : undefined;

  const line: Record<string, unknown> = {
    id: intent.lineId,
    productId: product.id,
    name: product.name,
    productName: product.name,
    qty: quantity,
    quantity,
    status,
    price: basePrice,
    precio: basePrice,
    ...(modifiers.length > 0 ? { modifierTotal } : {}),
    total: lineTotal,
    displayName,
    ...(categoryName !== undefined ? { categoryName, categoria: categoryName } : {}),
    ...(operationStationId !== undefined
      ? { stationId: operationStationId, operationStationId }
      : {}),
    ...(operationStationName !== undefined
      ? { stationName: operationStationName, operationStationName }
      : {}),
    ...(course !== undefined ? { course } : {}),
  };

  if (modifiers.length > 0) {
    line.selectedModifiers = modifiers.map((m) => ({
      groupId: m.groupId,
      groupName: m.groupName,
      optionId: m.optionId,
      optionName: m.optionName,
      priceDelta: m.priceDelta,
      ...modifierInventoryFieldsToPayload(m),
    }));
    const addonExtras = modifiers.map((m) => ({
      name: m.optionName,
      price: m.priceDelta,
    }));
    line.extras = addonExtras;
  }
  if (intent.note) line.note = intent.note;

  if (existing) {
    for (const key of [
      "addedAt",
      "createdAt",
      "sentAt",
      "preparedAt",
      "servedAt",
      "readyAt",
      "preparingAt",
      "cancelledAt",
      "cancelledBy",
      "orderItemDocId",
      "tableGroupSourceTableId",
      "tableGroupSourceOrderId",
      "inventoryCost",
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(existing, key) && existing[key] != null) {
        line[key] = existing[key];
      }
    }
  }

  return line;
}

export function computeAuthoritativeOrderTotal(
  items: readonly Record<string, unknown>[],
): number {
  let total = 0;
  for (const item of items) {
    const status = normalizeProductionLineStatus(item.status);
    if (status === "cancelled") continue;
    if (item.isComped === true) continue;
    const lineTotal = Number(item.total);
    if (Number.isFinite(lineTotal) && lineTotal >= 0) {
      total += lineTotal;
      continue;
    }
    const qty = Number(item.quantity ?? item.qty);
    const price = Number(item.price ?? item.precio);
    if (Number.isFinite(qty) && Number.isFinite(price) && qty > 0 && price >= 0) {
      total += roundMoney(price * qty + Number(item.modifierTotal ?? 0) * qty);
    }
  }
  return roundMoney(total);
}
