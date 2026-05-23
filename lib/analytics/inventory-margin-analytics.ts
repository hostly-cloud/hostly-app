import {
  parseFirestoreLineInventoryCost,
  type CartOrderLineInventoryCost,
} from "@/lib/inventory/tpv-line-cost";

export type InventoryMarginLineInput = {
  id?: string;
  productId?: string;
  name?: string;
  productName?: string;
  qty?: number;
  quantity?: number;
  total?: number;
  price?: number;
  precio?: number;
  status?: string;
  categoryId?: string;
  categoryName?: string;
  categoria?: string;
  productFamilyId?: string;
  productFamilyName?: string;
  productFamilyType?: string;
  operationStationId?: string;
  operationStationName?: string;
  inventoryCost?: unknown;
};

export type InventoryMarginOrderInput = {
  id?: string;
  createdAt?: unknown;
  items?: InventoryMarginLineInput[];
};

export type InventoryMarginLineCostStatus = "complete" | "incomplete" | "excluded";

export type InventoryMarginLineResult = {
  lineId: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  familyId: string;
  familyName: string;
  operationStationId: string;
  operationStationName: string;
  quantity: number;
  sales: number;
  cost: number | null;
  margin: number | null;
  marginPercent: number | null;
  inventoryCost: CartOrderLineInventoryCost | null;
  costStatus: InventoryMarginLineCostStatus;
};

export type InventoryMarginAggregateRow = {
  key: string;
  label: string;
  sales: number;
  cost: number;
  margin: number;
  marginPercent: number | null;
  units: number;
  lineCount: number;
  incompleteCostCount: number;
};

export type InventoryMarginAnalyticsFilters = {
  familyName?: string | null;
  categoryName?: string | null;
};

export type InventoryMarginAnalyticsSummary = {
  salesTotal: number;
  costTotal: number;
  grossMargin: number;
  grossMarginPercent: number | null;
  unitsTotal: number;
  completeLineCount: number;
  incompleteCostCount: number;
  excludedNoCostCount: number;
};

export type InventoryMarginAnalyticsResult = {
  lines: InventoryMarginLineResult[];
  summary: InventoryMarginAnalyticsSummary;
  byProduct: InventoryMarginAggregateRow[];
  byCategory: InventoryMarginAggregateRow[];
  byFamily: InventoryMarginAggregateRow[];
  byOperationStation: InventoryMarginAggregateRow[];
  topProfitableProducts: InventoryMarginAggregateRow[];
  highVolumeLowMarginProducts: InventoryMarginAggregateRow[];
  filterOptions: {
    families: string[];
    categories: string[];
  };
};

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function readLineQuantity(line: InventoryMarginLineInput): number {
  const qty = Math.max(0, Number(line.qty ?? line.quantity) || 0);
  return qty > 0 ? qty : 1;
}

function readLineSales(line: InventoryMarginLineInput): number {
  const total = Number(line.total);
  if (Number.isFinite(total) && total >= 0) return roundMoney(total);
  const qty = readLineQuantity(line);
  const unit = Number(line.price ?? line.precio) || 0;
  return roundMoney(unit * qty);
}

function isCancelledLineStatus(status: unknown): boolean {
  const st = String(status ?? "").trim().toLowerCase();
  return st === "cancelled" || st === "canceled";
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveCategoryFields(line: InventoryMarginLineInput): {
  categoryId: string;
  categoryName: string;
} {
  const categoryId = readTrimmedString(line.categoryId);
  const categoryName =
    readTrimmedString(line.categoryName) ||
    readTrimmedString(line.categoria) ||
    "Sin categoría";
  return { categoryId, categoryName };
}

function resolveFamilyFields(line: InventoryMarginLineInput): {
  familyId: string;
  familyName: string;
} {
  const familyId = readTrimmedString(line.productFamilyId);
  const familyName =
    readTrimmedString(line.productFamilyName) ||
    readTrimmedString(line.productFamilyType) ||
    "Sin familia";
  return { familyId, familyName };
}

function resolveOperationStationFields(line: InventoryMarginLineInput): {
  operationStationId: string;
  operationStationName: string;
} {
  const operationStationId = readTrimmedString(line.operationStationId);
  const operationStationName =
    readTrimmedString(line.operationStationName) || "Sin estación";
  return { operationStationId, operationStationName };
}

function resolveProductFields(line: InventoryMarginLineInput): {
  productId: string;
  productName: string;
} {
  const productId = readTrimmedString(line.productId) || "unknown";
  const productName =
    readTrimmedString(line.name) ||
    readTrimmedString(line.productName) ||
    productId;
  return { productId, productName };
}

export function calculateGrossMarginPercent(
  margin: number,
  sales: number,
): number | null {
  if (!Number.isFinite(margin) || !Number.isFinite(sales) || sales <= 0) {
    return null;
  }
  return roundMoney((margin / sales) * 100);
}

export function calculateOrderLineMargin(
  line: InventoryMarginLineInput,
): InventoryMarginLineResult | null {
  if (isCancelledLineStatus(line.status)) return null;

  const inventoryCost = parseFirestoreLineInventoryCost(line.inventoryCost);
  const { productId, productName } = resolveProductFields(line);
  const { categoryId, categoryName } = resolveCategoryFields(line);
  const { familyId, familyName } = resolveFamilyFields(line);
  const { operationStationId, operationStationName } =
    resolveOperationStationFields(line);
  const quantity = readLineQuantity(line);
  const sales = readLineSales(line);
  const lineId =
    readTrimmedString(line.id) || `${productId}:${productName}:${quantity}`;

  if (!inventoryCost) {
    return {
      lineId,
      productId,
      productName,
      categoryId,
      categoryName,
      familyId,
      familyName,
      operationStationId,
      operationStationName,
      quantity,
      sales,
      cost: null,
      margin: null,
      marginPercent: null,
      inventoryCost: null,
      costStatus: "excluded",
    };
  }

  if (inventoryCost.totalCost == null) {
    return {
      lineId,
      productId,
      productName,
      categoryId,
      categoryName,
      familyId,
      familyName,
      operationStationId,
      operationStationName,
      quantity,
      sales,
      cost: null,
      margin: null,
      marginPercent: null,
      inventoryCost,
      costStatus: "incomplete",
    };
  }

  const cost = roundMoney(inventoryCost.totalCost);
  const margin = roundMoney(sales - cost);
  return {
    lineId,
    productId,
    productName,
    categoryId,
    categoryName,
    familyId,
    familyName,
    operationStationId,
    operationStationName,
    quantity,
    sales,
    cost,
    margin,
    marginPercent: calculateGrossMarginPercent(margin, sales),
    inventoryCost,
    costStatus: "complete",
  };
}

type AggregateKeyFn = (line: InventoryMarginLineResult) => {
  key: string;
  label: string;
};

function upsertAggregateRow(
  map: Map<string, InventoryMarginAggregateRow>,
  key: string,
  label: string,
  line: InventoryMarginLineResult,
): void {
  const prev = map.get(key) ?? {
    key,
    label,
    sales: 0,
    cost: 0,
    margin: 0,
    marginPercent: null,
    units: 0,
    lineCount: 0,
    incompleteCostCount: 0,
  };
  prev.sales = roundMoney(prev.sales + line.sales);
  prev.cost = roundMoney(prev.cost + (line.cost ?? 0));
  prev.margin = roundMoney(prev.margin + (line.margin ?? 0));
  prev.units += line.quantity;
  prev.lineCount += 1;
  prev.marginPercent = calculateGrossMarginPercent(prev.margin, prev.sales);
  map.set(key, prev);
}

function aggregateMarginLines(
  lines: InventoryMarginLineResult[],
  keyFn: AggregateKeyFn,
): InventoryMarginAggregateRow[] {
  const completeMap = new Map<string, InventoryMarginAggregateRow>();
  const incompleteMap = new Map<string, number>();

  for (const line of lines) {
    const { key, label } = keyFn(line);
    if (line.costStatus === "complete") {
      upsertAggregateRow(completeMap, key, label, line);
      continue;
    }
    if (line.costStatus === "incomplete") {
      incompleteMap.set(key, (incompleteMap.get(key) ?? 0) + 1);
    }
  }

  return [...completeMap.values()]
    .map((row) => ({
      ...row,
      incompleteCostCount: incompleteMap.get(row.key) ?? 0,
    }))
    .sort((a, b) => b.margin - a.margin);
}

export function aggregateMarginsByProduct(
  lines: InventoryMarginLineResult[],
): InventoryMarginAggregateRow[] {
  return aggregateMarginLines(lines, (line) => ({
    key: line.productId,
    label: line.productName,
  }));
}

export function aggregateMarginsByCategory(
  lines: InventoryMarginLineResult[],
): InventoryMarginAggregateRow[] {
  return aggregateMarginLines(lines, (line) => ({
    key: line.categoryId || line.categoryName,
    label: line.categoryName,
  }));
}

export function aggregateMarginsByFamily(
  lines: InventoryMarginLineResult[],
): InventoryMarginAggregateRow[] {
  return aggregateMarginLines(lines, (line) => ({
    key: line.familyId || line.familyName,
    label: line.familyName,
  }));
}

export function aggregateMarginsByOperationStation(
  lines: InventoryMarginLineResult[],
): InventoryMarginAggregateRow[] {
  return aggregateMarginLines(lines, (line) => ({
    key: line.operationStationId || line.operationStationName,
    label: line.operationStationName,
  }));
}

function normalizeFilterValue(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function lineMatchesFilters(
  line: InventoryMarginLineResult,
  filters?: InventoryMarginAnalyticsFilters,
): boolean {
  const familyFilter = normalizeFilterValue(filters?.familyName);
  if (familyFilter && familyFilter !== "all") {
    if (normalizeFilterValue(line.familyName) !== familyFilter) return false;
  }
  const categoryFilter = normalizeFilterValue(filters?.categoryName);
  if (categoryFilter && categoryFilter !== "all") {
    if (normalizeFilterValue(line.categoryName) !== categoryFilter) return false;
  }
  return true;
}

function flattenOrderLines(
  orders: InventoryMarginOrderInput[],
): InventoryMarginLineInput[] {
  const out: InventoryMarginLineInput[] = [];
  for (const order of orders) {
    if (!Array.isArray(order.items)) continue;
    for (const item of order.items) {
      if (!item || typeof item !== "object") continue;
      out.push(item);
    }
  }
  return out;
}

function buildSummary(lines: InventoryMarginLineResult[]): InventoryMarginAnalyticsSummary {
  let salesTotal = 0;
  let costTotal = 0;
  let unitsTotal = 0;
  let completeLineCount = 0;
  let incompleteCostCount = 0;
  let excludedNoCostCount = 0;

  for (const line of lines) {
    if (line.costStatus === "complete") {
      salesTotal += line.sales;
      costTotal += line.cost ?? 0;
      unitsTotal += line.quantity;
      completeLineCount += 1;
      continue;
    }
    if (line.costStatus === "incomplete") {
      incompleteCostCount += 1;
      continue;
    }
    excludedNoCostCount += 1;
  }

  salesTotal = roundMoney(salesTotal);
  costTotal = roundMoney(costTotal);
  const grossMargin = roundMoney(salesTotal - costTotal);

  return {
    salesTotal,
    costTotal,
    grossMargin,
    grossMarginPercent: calculateGrossMarginPercent(grossMargin, salesTotal),
    unitsTotal,
    completeLineCount,
    incompleteCostCount,
    excludedNoCostCount,
  };
}

function collectFilterOptions(lines: InventoryMarginLineResult[]): {
  families: string[];
  categories: string[];
} {
  const families = new Set<string>();
  const categories = new Set<string>();
  for (const line of lines) {
    if (line.familyName.trim()) families.add(line.familyName);
    if (line.categoryName.trim()) categories.add(line.categoryName);
  }
  return {
    families: [...families].sort((a, b) => a.localeCompare(b, "es")),
    categories: [...categories].sort((a, b) => a.localeCompare(b, "es")),
  };
}

function pickTopProfitableProducts(
  rows: InventoryMarginAggregateRow[],
  limit = 5,
): InventoryMarginAggregateRow[] {
  return [...rows].sort((a, b) => b.margin - a.margin).slice(0, limit);
}

function pickHighVolumeLowMarginProducts(
  rows: InventoryMarginAggregateRow[],
  limit = 5,
): InventoryMarginAggregateRow[] {
  return [...rows]
    .filter((row) => row.marginPercent != null && row.units >= 2)
    .sort((a, b) => {
      const marginDiff = (a.marginPercent ?? 100) - (b.marginPercent ?? 100);
      if (marginDiff !== 0) return marginDiff;
      return b.units - a.units;
    })
    .slice(0, limit);
}

export function buildInventoryMarginAnalytics(
  orders: InventoryMarginOrderInput[],
  filters?: InventoryMarginAnalyticsFilters,
): InventoryMarginAnalyticsResult {
  const rawLines = flattenOrderLines(orders);
  const allLines = rawLines
    .map((line) => calculateOrderLineMargin(line))
    .filter((line): line is InventoryMarginLineResult => line != null);

  const filterOptions = collectFilterOptions(allLines);
  const lines = allLines.filter((line) => lineMatchesFilters(line, filters));
  const byProduct = aggregateMarginsByProduct(lines);
  const byCategory = aggregateMarginsByCategory(lines);
  const byFamily = aggregateMarginsByFamily(lines);
  const byOperationStation = aggregateMarginsByOperationStation(lines);

  return {
    lines,
    summary: buildSummary(lines),
    byProduct,
    byCategory,
    byFamily,
    byOperationStation,
    topProfitableProducts: pickTopProfitableProducts(byProduct),
    highVolumeLowMarginProducts: pickHighVolumeLowMarginProducts(byProduct),
    filterOptions,
  };
}

export function normalizeInventoryMarginOrders(
  source: Array<Record<string, unknown>> | null | undefined,
): InventoryMarginOrderInput[] {
  if (!Array.isArray(source)) return [];
  return source.map((doc) => ({
    id: typeof doc.id === "string" ? doc.id : undefined,
    createdAt: doc.createdAt,
    items: Array.isArray(doc.items)
      ? (doc.items as InventoryMarginLineInput[])
      : [],
  }));
}
