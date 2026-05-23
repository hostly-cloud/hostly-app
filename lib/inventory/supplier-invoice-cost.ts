import {
  calculateInventoryUnitCost,
  normalizePurchaseUnit,
  roundInventoryCost,
  type PurchaseUnit,
} from "@/lib/inventory/inventory-cost";
import {
  areInventoryUnitsCompatible,
  normalizeInventoryUnitAlias,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import type { SupplierInvoiceLine } from "@/lib/inventory/supplier-invoice-types";

export type ApplyInventoryCostFromSupplierInvoiceLineInput = {
  productId: string;
  quantity: number;
  unit: string;
  realUnitCost: number;
  realTotalCost: number;
};

export type ApplyInventoryCostFromSupplierInvoiceLineResult = {
  productId: string;
  status: "applied" | "error";
  previousUnitCost?: number | null;
  updatedInventoryUnitCost?: number;
  applyError?: string;
  inventoryPatch?: Record<string, unknown>;
};

function readProductInventory(data: Record<string, unknown> | undefined) {
  const inv =
    data?.inventory && typeof data.inventory === "object"
      ? (data.inventory as Record<string, unknown>)
      : {};
  const unitRaw =
    typeof inv.unit === "string" && inv.unit.trim() ? inv.unit.trim() : "ud";
  const unit = normalizeInventoryUnitAlias(unitRaw) || unitRaw;
  const unitCostRaw = Number(inv.unitCost);
  const previousUnitCost =
    Number.isFinite(unitCostRaw) && unitCostRaw > 0 ? roundInventoryCost(unitCostRaw) : null;
  return { unit, previousUnitCost, inv };
}

function resolvePurchaseUnitFromLineUnit(unit: string): PurchaseUnit | null {
  return normalizePurchaseUnit(unit);
}

export function buildInventoryCostPatchFromSupplierInvoiceLine(params: {
  line: ApplyInventoryCostFromSupplierInvoiceLineInput;
  productData: Record<string, unknown>;
}): ApplyInventoryCostFromSupplierInvoiceLineResult {
  const productId = params.line.productId.trim();
  const { unit: productUnit, previousUnitCost } = readProductInventory(params.productData);

  const purchaseUnit = resolvePurchaseUnitFromLineUnit(params.line.unit);
  if (!purchaseUnit) {
    return {
      productId,
      status: "error",
      previousUnitCost,
      applyError: "invalid_purchase_unit",
    };
  }

  if (!areInventoryUnitsCompatible(params.line.unit, productUnit)) {
    return {
      productId,
      status: "error",
      previousUnitCost,
      applyError: `incompatible_unit:line=${params.line.unit},product=${productUnit}`,
    };
  }

  const purchaseCost = roundInventoryCost(params.line.realTotalCost);
  const purchaseQuantity = roundInventoryQuantity(params.line.quantity);
  if (purchaseCost <= 0 || purchaseQuantity <= 0) {
    return {
      productId,
      status: "error",
      previousUnitCost,
      applyError: "invalid_cost_or_quantity",
    };
  }

  const calculated = calculateInventoryUnitCost({
    purchaseCost,
    purchaseQuantity,
    purchaseUnit,
  });

  if (!calculated) {
    return {
      productId,
      status: "error",
      previousUnitCost,
      applyError: "unit_cost_calculation_failed",
    };
  }

  return {
    productId,
    status: "applied",
    previousUnitCost,
    updatedInventoryUnitCost: calculated.unitCost,
    inventoryPatch: {
      "inventory.purchaseCost": purchaseCost,
      "inventory.purchaseQuantity": purchaseQuantity,
      "inventory.purchaseUnit": purchaseUnit,
      "inventory.unitCost": calculated.unitCost,
      "inventory.unitCostUnit": calculated.unitCostUnit,
    },
  };
}

export function mergeRecordedSupplierInvoiceLines(
  invoiceLines: SupplierInvoiceLine[],
  applyResults: ApplyInventoryCostFromSupplierInvoiceLineResult[],
): SupplierInvoiceLine[] {
  const byProductId = new Map(applyResults.map((item) => [item.productId, item]));
  return invoiceLines.map((line) => {
    const applied = byProductId.get(line.productId);
    if (!applied) return line;
    return {
      ...line,
      previousUnitCost: applied.previousUnitCost ?? null,
      updatedInventoryUnitCost: applied.updatedInventoryUnitCost ?? null,
    };
  });
}
