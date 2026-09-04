import type { ModifierInventoryUnit } from "@/lib/modifiers/modifier-types";

/** Origen del movimiento en el ledger central del restaurante. */
export const STOCK_MOVEMENT_SOURCES = [
  "inventory_receipt",
  "inventory_waste",
  "modifier_sale",
  "modifier_sale_reversal",
  "recipe_sale",
  "recipe_sale_reversal",
  "manual_adjustment",
  "purchase_receipt",
] as const;

export type StockMovementSource = (typeof STOCK_MOVEMENT_SOURCES)[number];

export type StockMovementApplyFields = {
  applied?: boolean;
  appliedAt?: number | null;
  applyError?: string | null;
  stockBefore?: number | null;
  stockAfter?: number | null;
};

export type ModifierSaleStockMovementDocument = StockMovementApplyFields & {
  restaurantId: string;
  /** Producto de inventario consumido (catálogo central). */
  productId: string;
  productName: string;
  source: "modifier_sale";
  type: "modifier_sale";
  orderId: string;
  lineId: string;
  saleProductId: string;
  saleProductName: string;
  modifierGroupId: string;
  modifierOptionId: string;
  modifierOptionName: string;
  /** Negativo: consumo (p. ej. -2 unit). */
  quantityDelta: number;
  unit: ModifierInventoryUnit | string;
  idempotencyKey: string;
  createdAt: number;
  createdBy?: string;
  sentSegmentLineId?: string;
  selectionOccurrence?: number;
  movementFingerprint?: string;
  sentQuantity?: number;
  inventoryQuantityPerUnit?: number;
};

export type ModifierStockConsumptionWarningReason =
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "INVENTORY_DISABLED"
  | "INVALID_CURRENT_STOCK"
  | "UNKNOWN_PRODUCT_UNIT"
  | "INCOMPATIBLE_UNIT"
  | "INVALID_CONSUMPTION_QUANTITY";

export type ModifierStockConsumptionWarning = {
  inventoryProductId?: string;
  orderId: string;
  lineId: string;
  groupId: string;
  optionId: string;
  reason: ModifierStockConsumptionWarningReason;
  requestedQuantity?: number;
  unit?: string;
};

export type ModifierSaleReversalStockMovementDocument = StockMovementApplyFields & {
  restaurantId: string;
  productId: string;
  productName: string;
  source: "modifier_sale_reversal";
  type: "modifier_sale_reversal";
  orderId: string;
  lineId: string;
  saleProductId: string;
  saleProductName: string;
  modifierGroupId: string;
  modifierOptionId: string;
  modifierOptionName: string;
  /** Positivo: devolución de stock (p. ej. +2 unit). */
  quantityDelta: number;
  unit: ModifierInventoryUnit | string;
  idempotencyKey: string;
  reversalOfMovementId: string;
  createdAt: number;
  createdBy?: string;
  sentSegmentLineId?: string;
  selectionOccurrence?: number;
  /** Aggregated reversal schema version (3 = per-operation). */
  movementSchemaVersion?: number;
  /** Stable idempotency key for the logical mutation (API key or derived). */
  operationIdempotencyKey?: string;
  movementFingerprint?: string;
  inventoryQuantityPerUnit?: number;
  /** Sale units reversed by this aggregated operation document. */
  reversedSaleUnits?: number;
};

export type CreateModifierStockMovementsResult = {
  created: number;
  skipped: number;
  failed: number;
  /** IDs deterministas tocados (creados o ya existentes) para aplicar stock. */
  movementIds: string[];
};

export type ApplyStockMovementStatus = "applied" | "skipped" | "error";

export type ApplyStockMovementResult = {
  movementId: string;
  status: ApplyStockMovementStatus;
  applyError?: string;
  stockBefore?: number;
  stockAfter?: number;
};

export type ApplyCreatedStockMovementsResult = {
  applied: number;
  skipped: number;
  failed: number;
  results: ApplyStockMovementResult[];
};

export type CreateModifierStockReversalMovementsResult =
  CreateModifierStockMovementsResult & {
    eligible: boolean;
    skippedNoOriginal: number;
    applyResult?: ApplyCreatedStockMovementsResult;
  };

export type RecipeSaleStockMovementDocument = StockMovementApplyFields & {
  restaurantId: string;
  productId: string;
  productName: string;
  source: "recipe_sale";
  type: "recipe_sale";
  orderId: string;
  lineId: string;
  saleProductId: string;
  saleProductName: string;
  quantityDelta: number;
  unit: string;
  idempotencyKey: string;
  createdAt: number;
  createdBy?: string;
  sentSegmentLineId?: string;
  ingredientOccurrence?: number;
  movementFingerprint?: string;
  sentQuantity?: number;
  recipeQuantityPerUnit?: number;
  /** Unidad canónica del producto de inventario al aplicar (destino de conversión). */
  productInventoryUnit?: string;
};

export type RecipeStockConsumptionWarningReason =
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "INVENTORY_DISABLED"
  | "INVALID_CURRENT_STOCK"
  | "UNKNOWN_PRODUCT_UNIT"
  | "INCOMPATIBLE_UNIT"
  | "INVALID_CONSUMPTION_QUANTITY";

export type RecipeStockConsumptionWarning = {
  inventoryProductId?: string;
  orderId: string;
  lineId: string;
  saleProductId: string;
  reason: RecipeStockConsumptionWarningReason;
  requestedQuantity?: number;
  unit?: string;
};

export type RecipeSaleReversalStockMovementDocument = StockMovementApplyFields & {
  restaurantId: string;
  productId: string;
  productName: string;
  source: "recipe_sale_reversal";
  type: "recipe_sale_reversal";
  orderId: string;
  lineId: string;
  saleProductId: string;
  saleProductName: string;
  quantityDelta: number;
  unit: string;
  idempotencyKey: string;
  reversalOfMovementId: string;
  createdAt: number;
  createdBy?: string;
};

export type CreateRecipeStockMovementsResult = CreateModifierStockMovementsResult;

export type CreateRecipeStockReversalMovementsResult =
  CreateModifierStockReversalMovementsResult;

export type PurchaseReceiptStockMovementDocument = StockMovementApplyFields & {
  restaurantId: string;
  productId: string;
  productName: string;
  source: "purchase_receipt";
  type: "purchase_receipt";
  purchaseOrderId: string;
  purchaseReceiptId: string;
  quantityDelta: number;
  unit: string;
  idempotencyKey: string;
  createdAt: number;
  createdBy?: string;
};

export type CreatePurchaseReceiptStockMovementsResult = CreateModifierStockMovementsResult;
