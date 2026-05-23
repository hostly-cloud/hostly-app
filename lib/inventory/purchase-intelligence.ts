import {
  convertInventoryQuantity,
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";

/** Periodo de lookback para estimar consumo diario. */
export const PURCHASE_INTELLIGENCE_LOOKBACK_DAYS = 14;

const CONSUMPTION_SOURCES = new Set([
  "modifier_sale",
  "recipe_sale",
  "modifier_sale_reversal",
  "recipe_sale_reversal",
]);

export type PurchaseRiskLevel =
  | "out"
  | "urgent"
  | "soon"
  | "watch"
  | "ok"
  | "unknown";

export type PurchaseStockMovementInput = {
  productId: string;
  source: string;
  type: string;
  quantityDelta: number;
  unit: string;
  createdAtMs: number | null;
};

export type PurchaseIntelligenceProductInput = {
  productId: string;
  name: string;
  currentStock: number | null;
  minStock?: number | null;
  unit: string;
  productFamilyName?: string | null;
  productFamilyType?: string | null;
  productKind?: string | null;
  historicalMarginPercent?: number | null;
};

export type PurchaseIntelligenceRow = {
  productId: string;
  productName: string;
  currentStock: number | null;
  minStock: number | null;
  unit: string;
  familyLabel: string;
  kindLabel: string;
  periodConsumption: number;
  dailyConsumption: number | null;
  daysRemaining: number | null;
  riskLevel: PurchaseRiskLevel;
  riskLabel: string;
  historicalMarginPercent: number | null;
};

export type PurchaseIntelligenceFilter =
  | "all"
  | "urgent"
  | "soon"
  | "watch"
  | "unknown";

export type BuildPurchaseIntelligenceRowsParams = {
  products: PurchaseIntelligenceProductInput[];
  movements: PurchaseStockMovementInput[];
  lookbackDays?: number;
  nowMs?: number;
};

export type PurchaseIntelligencePeriod = {
  startMs: number;
  endMs: number;
  periodDays: number;
};

function readMovementSourceKey(source: string, type: string): string {
  return (source || type || "").trim().toLowerCase();
}

function isConsumptionMovement(source: string, type: string): boolean {
  return CONSUMPTION_SOURCES.has(readMovementSourceKey(source, type));
}

function movementInPeriod(
  createdAtMs: number | null,
  period: PurchaseIntelligencePeriod,
): boolean {
  if (createdAtMs == null || !Number.isFinite(createdAtMs)) return false;
  return createdAtMs >= period.startMs && createdAtMs <= period.endMs;
}

export function resolvePurchaseIntelligencePeriod(
  lookbackDays = PURCHASE_INTELLIGENCE_LOOKBACK_DAYS,
  nowMs = Date.now(),
): PurchaseIntelligencePeriod {
  const days = Math.max(1, Math.floor(lookbackDays));
  const endMs = nowMs;
  const startMs = endMs - days * 24 * 60 * 60 * 1000;
  return { startMs, endMs, periodDays: days };
}

export function purchaseRiskLabel(level: PurchaseRiskLevel): string {
  switch (level) {
    case "out":
      return "Sin stock";
    case "urgent":
      return "Urgente";
    case "soon":
      return "Comprar pronto";
    case "watch":
      return "Vigilar";
    case "ok":
      return "OK";
    default:
      return "Sin datos";
  }
}

export function purchaseRiskPriority(level: PurchaseRiskLevel): number {
  switch (level) {
    case "out":
      return 0;
    case "urgent":
      return 1;
    case "soon":
      return 2;
    case "watch":
      return 3;
    case "unknown":
      return 4;
    case "ok":
      return 5;
    default:
      return 6;
  }
}

export function resolvePurchaseRiskLevel(params: {
  currentStock: number | null;
  daysRemaining: number | null;
  dailyConsumption: number | null;
}): PurchaseRiskLevel {
  const stock = params.currentStock;
  if (stock != null && Number.isFinite(stock) && stock <= 0) return "out";

  const daily = params.dailyConsumption;
  const days = params.daysRemaining;
  if (daily == null || daily <= 0 || days == null || !Number.isFinite(days)) {
    return "unknown";
  }

  if (days <= 1) return "urgent";
  if (days <= 3) return "soon";
  if (days <= 7) return "watch";
  return "ok";
}

export function calculateAverageDailyConsumption(
  periodConsumption: number,
  periodDays: number,
): number | null {
  if (!Number.isFinite(periodConsumption) || periodConsumption <= 0) return null;
  const days = Math.max(1, Math.floor(periodDays));
  return roundInventoryQuantity(periodConsumption / days);
}

export function calculateEstimatedDaysRemaining(
  currentStock: number | null,
  dailyConsumption: number | null,
): number | null {
  if (currentStock == null || !Number.isFinite(currentStock)) return null;
  if (dailyConsumption == null || dailyConsumption <= 0) return null;
  return roundInventoryQuantity(currentStock / dailyConsumption);
}

function convertMovementDeltaToProductUnit(params: {
  quantityDelta: number;
  movementUnit: string;
  productUnit: string;
}): number | null {
  const absQty = Math.abs(params.quantityDelta);
  if (!Number.isFinite(absQty) || absQty <= 0) return 0;
  const converted = convertInventoryQuantity({
    quantity: absQty,
    fromUnit: params.movementUnit,
    toUnit: params.productUnit,
  });
  if (converted == null) return null;
  return params.quantityDelta < 0 ? -converted : converted;
}

export function aggregateConsumptionFromStockMovements(params: {
  productId: string;
  productUnit: string;
  movements: PurchaseStockMovementInput[];
  period: PurchaseIntelligencePeriod;
}): number {
  const pid = params.productId.trim();
  const productUnit = normalizeInventoryUnitAlias(params.productUnit) || "unit";
  if (!pid) return 0;

  let netConsumption = 0;
  for (const movement of params.movements) {
    if (movement.productId.trim() !== pid) continue;
    if (!isConsumptionMovement(movement.source, movement.type)) continue;
    if (!movementInPeriod(movement.createdAtMs, params.period)) continue;

    const convertedDelta = convertMovementDeltaToProductUnit({
      quantityDelta: movement.quantityDelta,
      movementUnit: movement.unit,
      productUnit,
    });
    if (convertedDelta == null) continue;
    netConsumption += -convertedDelta;
  }

  return roundInventoryQuantity(Math.max(0, netConsumption));
}

function resolveFamilyLabel(product: PurchaseIntelligenceProductInput): string {
  return (
    product.productFamilyName?.trim() ||
    product.productFamilyType?.trim() ||
    "Sin familia"
  );
}

function resolveKindLabel(product: PurchaseIntelligenceProductInput): string {
  return product.productKind?.trim() || "—";
}

export function buildPurchaseIntelligenceRows(
  params: BuildPurchaseIntelligenceRowsParams,
): PurchaseIntelligenceRow[] {
  const period = resolvePurchaseIntelligencePeriod(
    params.lookbackDays ?? PURCHASE_INTELLIGENCE_LOOKBACK_DAYS,
    params.nowMs,
  );

  const rows = params.products.map((product) => {
    const productUnit =
      normalizeInventoryUnitAlias(product.unit) || product.unit || "unit";
    const periodConsumption = aggregateConsumptionFromStockMovements({
      productId: product.productId,
      productUnit,
      movements: params.movements,
      period,
    });
    const dailyConsumption = calculateAverageDailyConsumption(
      periodConsumption,
      period.periodDays,
    );
    const daysRemaining = calculateEstimatedDaysRemaining(
      product.currentStock,
      dailyConsumption,
    );
    const riskLevel = resolvePurchaseRiskLevel({
      currentStock: product.currentStock,
      daysRemaining,
      dailyConsumption,
    });

    return {
      productId: product.productId,
      productName: product.name,
      currentStock: product.currentStock,
      minStock:
        product.minStock != null && Number.isFinite(product.minStock)
          ? product.minStock
          : null,
      unit: productUnit,
      familyLabel: resolveFamilyLabel(product),
      kindLabel: resolveKindLabel(product),
      periodConsumption,
      dailyConsumption,
      daysRemaining,
      riskLevel,
      riskLabel: purchaseRiskLabel(riskLevel),
      historicalMarginPercent: product.historicalMarginPercent ?? null,
    };
  });

  return rows.sort((a, b) => {
    const riskDiff = purchaseRiskPriority(a.riskLevel) - purchaseRiskPriority(b.riskLevel);
    if (riskDiff !== 0) return riskDiff;
    const daysA = a.daysRemaining ?? Number.POSITIVE_INFINITY;
    const daysB = b.daysRemaining ?? Number.POSITIVE_INFINITY;
    if (daysA !== daysB) return daysA - daysB;
    return a.productName.localeCompare(b.productName, "es", { sensitivity: "base" });
  });
}

export function matchesPurchaseIntelligenceFilter(
  row: PurchaseIntelligenceRow,
  filter: PurchaseIntelligenceFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "urgent") {
    return row.riskLevel === "out" || row.riskLevel === "urgent";
  }
  if (filter === "soon") return row.riskLevel === "soon";
  if (filter === "watch") return row.riskLevel === "watch";
  return row.riskLevel === "unknown";
}

export function mapCentralMovementToPurchaseInput(
  movement: {
    productId?: string | null;
    source: string;
    type: string;
    quantityDelta: number;
    unit: string;
    createdAtMs: number | null;
  },
): PurchaseStockMovementInput | null {
  const productId =
    typeof movement.productId === "string" ? movement.productId.trim() : "";
  if (!productId) return null;
  return {
    productId,
    source: movement.source,
    type: movement.type,
    quantityDelta: movement.quantityDelta,
    unit: movement.unit,
    createdAtMs: movement.createdAtMs,
  };
}
