import type { ProductDocument } from "@/lib/firestore/products";
import type { SaleLineIntent } from "@/lib/server/tpv/tpv-mutation-dtos";
import type { ResolvedSaleModifier } from "@/lib/server/tpv/load-tpv-catalog-admin";
import { modifierInventoryFieldsToPayload } from "@/lib/modifiers/modifier-inventory-consumption";
import { normalizeProductionLineStatus } from "@/lib/firestore/merge-order-items-for-persist";
import { normalizeMenuCourseValue } from "@/lib/carta/menu-course";
import {
  mapPreparationAreaToStation,
  mapStationToPreparationArea,
} from "@/lib/carta/map-station-to-preparation-area";

function normalizeKdsStation(
  raw: unknown,
): "kitchen" | "bar" | "cocktail" | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "kitchen" || s === "cocina") return "kitchen";
  if (s === "bar" || s === "barra") return "bar";
  if (s === "cocktail" || s === "cocteleria") return "cocktail";
  return null;
}

function normalizeKdsPreparationArea(
  raw: unknown,
): "cocina" | "barra" | "cocteleria" | null {
  const mapped = mapStationToPreparationArea(
    typeof raw === "string" ? raw : undefined,
  );
  if (mapped === "cocina" || mapped === "barra" || mapped === "cocteleria") {
    return mapped;
  }
  return null;
}

/** Deriva station/preparationArea desde catálogo (origen histórico KDS). */
function resolveCatalogStationFields(product: ProductDocument): {
  station?: "kitchen" | "bar" | "cocktail";
  preparationArea?: "cocina" | "barra" | "cocteleria";
} {
  const stationFromProduct = normalizeKdsStation(product.station);
  const prepFromProduct = normalizeKdsPreparationArea(product.preparationArea);
  const stationFromPrep = normalizeKdsStation(
    mapPreparationAreaToStation(prepFromProduct ?? product.preparationArea ?? null),
  );
  const station = stationFromProduct ?? stationFromPrep ?? undefined;
  const preparationArea =
    prepFromProduct ??
    (station
      ? normalizeKdsPreparationArea(mapStationToPreparationArea(station))
      : undefined) ??
    undefined;
  const out: {
    station?: "kitchen" | "bar" | "cocktail";
    preparationArea?: "cocina" | "barra" | "cocteleria";
  } = {};
  if (station) out.station = station;
  if (preparationArea) out.preparationArea = preparationArea;
  return out;
}

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
    total: lineTotal,
    displayName,
  };

  if (modifiers.length > 0) {
    line.modifierTotal = modifierTotal;
  }

  const categoryId =
    typeof product.categoryId === "string" && product.categoryId.trim() !== ""
      ? product.categoryId.trim()
      : null;
  if (categoryId) {
    line.categoryId = categoryId;
  }

  const categoryName =
    typeof product.categoryName === "string" && product.categoryName.trim() !== ""
      ? product.categoryName.trim()
      : null;
  if (categoryName) {
    line.categoryName = categoryName;
    line.categoria = categoryName;
  }

  const operationStationId =
    typeof product.operationStationId === "string" && product.operationStationId.trim() !== ""
      ? product.operationStationId.trim()
      : null;
  if (operationStationId) {
    line.stationId = operationStationId;
    line.operationStationId = operationStationId;
  }

  const operationStationName =
    typeof product.operationStationName === "string" &&
    product.operationStationName.trim() !== ""
      ? product.operationStationName.trim()
      : null;
  if (operationStationName) {
    line.stationName = operationStationName;
    line.operationStationName = operationStationName;
  }

  // Precedencia course: intent Carta (pase operativo) → catálogo → sin course.
  // Excepción de autoridad: solo `course` puede venir del cliente; station/precio no.
  const intentCourse = normalizeMenuCourseValue(intent.course);
  if (intentCourse != null) {
    line.course = intentCourse;
  } else {
    const catalogCourse = normalizeMenuCourseValue(product.course);
    if (catalogCourse != null) line.course = catalogCourse;
  }

  // station/preparationArea desde catálogo (no del cliente) — parity KDS junio.
  const existingStation = existing
    ? normalizeKdsStation(existing.station)
    : null;
  const existingPrep = existing
    ? normalizeKdsPreparationArea(existing.preparationArea)
    : null;
  const catalogStation = resolveCatalogStationFields(product);
  const station = existingStation ?? catalogStation.station;
  const preparationArea = existingPrep ?? catalogStation.preparationArea;
  if (station) line.station = station;
  if (preparationArea) line.preparationArea = preparationArea;

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
