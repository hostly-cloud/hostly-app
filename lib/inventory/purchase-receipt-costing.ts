import {
  deleteField,
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import {
  convertInventoryQuantity,
  roundInventoryQuantity,
} from "@/lib/inventory/unit-conversions";
import type { PurchaseReceiptLine } from "@/lib/purchases/purchase-receipt-types";

export type PurchaseReceiptCostApplySummary = {
  applied: number;
  skipped: number;
  failed: number;
};

type CostableReceiptLine = PurchaseReceiptLine & {
  movementId: string;
};

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInventoryRecord(data: Record<string, unknown>): Record<string, unknown> {
  return data.inventory && typeof data.inventory === "object"
    ? (data.inventory as Record<string, unknown>)
    : {};
}

function readInventoryUnit(data: Record<string, unknown>): string {
  const inventory = readInventoryRecord(data);
  return typeof inventory.unit === "string" && inventory.unit.trim()
    ? inventory.unit.trim()
    : "ud";
}

function assertTenant(data: Record<string, unknown>, restaurantId: string): void {
  const docRestaurantId =
    typeof data.restaurantId === "string" ? data.restaurantId.trim() : "";
  if (docRestaurantId && docRestaurantId !== restaurantId) {
    throw new Error("UNAUTHORIZED_PURCHASE_COST_ACCESS");
  }
}

/**
 * Aplica coste medio acumulado de compra y proveedor al inventario central.
 *
 * La operación es idempotente por movimiento: cada stockMovement queda marcado con
 * `procurementApplied === true`. De esta forma, reintentos de recepción o de red no
 * vuelven a sumar el coste. El promedio se calcula con una base acumulada de compras,
 * independiente del stock actual, para que ventas y mermas no distorsionen el coste medio.
 */
export async function applyPurchaseReceiptCosting(params: {
  restaurantId: string;
  purchaseReceiptId: string;
  lines: readonly CostableReceiptLine[];
}): Promise<PurchaseReceiptCostApplySummary> {
  const rid = params.restaurantId.trim();
  const receiptId = params.purchaseReceiptId.trim();
  const summary: PurchaseReceiptCostApplySummary = {
    applied: 0,
    skipped: 0,
    failed: 0,
  };

  if (!rid || !receiptId || !isAuthReady() || !auth.currentUser) {
    return { applied: 0, skipped: 0, failed: params.lines.length };
  }

  for (const rawLine of params.lines) {
    const productId = rawLine.productId.trim();
    const movementId = rawLine.movementId.trim();
    if (!productId || !movementId) {
      summary.failed += 1;
      continue;
    }

    try {
      const outcome = await runTransaction(db, async (transaction) => {
        const movementRef = doc(
          db,
          "restaurants",
          rid,
          "stockMovements",
          movementId,
        );
        const productRef = doc(db, "restaurants", rid, "products", productId);

        const movementSnap = await transaction.get(movementRef);
        if (!movementSnap.exists()) return "failed" as const;
        const movement = movementSnap.data() as Record<string, unknown>;
        assertTenant(movement, rid);

        if (movement.purchaseReceiptId !== receiptId) return "failed" as const;
        if (movement.productId !== productId) return "failed" as const;
        if (movement.applied !== true) return "failed" as const;
        if (movement.procurementApplied === true) return "skipped" as const;

        const productSnap = await transaction.get(productRef);
        if (!productSnap.exists()) {
          transaction.update(movementRef, {
            procurementApplyError: `product_not_found:${productId}`,
          });
          return "failed" as const;
        }

        const product = productSnap.data() as Record<string, unknown>;
        assertTenant(product, rid);
        const inventory = readInventoryRecord(product);
        const inventoryUnit = readInventoryUnit(product);
        const receivedQuantity = readFiniteNumber(rawLine.quantity);

        if (receivedQuantity == null || receivedQuantity <= 0) {
          transaction.update(movementRef, {
            procurementApplyError: "invalid_received_quantity",
          });
          return "failed" as const;
        }

        const convertedQuantity = convertInventoryQuantity({
          quantity: receivedQuantity,
          fromUnit: rawLine.unit,
          toUnit: inventoryUnit,
        });
        if (convertedQuantity == null || convertedQuantity <= 0) {
          transaction.update(movementRef, {
            procurementApplyError: `incompatible_cost_unit:${rawLine.unit}->${inventoryUnit}`,
          });
          return "failed" as const;
        }

        const supplierName = rawLine.supplierName?.trim().slice(0, 160) || null;
        const estimatedUnitCost =
          readFiniteNumber(rawLine.estimatedUnitCost) != null &&
          (rawLine.estimatedUnitCost as number) >= 0
            ? (rawLine.estimatedUnitCost as number)
            : null;

        const productPatch: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };

        let normalizedAverageCost: number | null = null;
        let purchaseValue: number | null = null;

        if (estimatedUnitCost != null) {
          purchaseValue = roundInventoryQuantity(receivedQuantity * estimatedUnitCost);
          const basisQuantity = Math.max(
            0,
            readFiniteNumber(inventory.purchaseCostBasisQuantity) ?? 0,
          );
          const basisValue = Math.max(
            0,
            readFiniteNumber(inventory.purchaseCostBasisValue) ?? 0,
          );
          const nextBasisQuantity = roundInventoryQuantity(
            basisQuantity + convertedQuantity,
          );
          const nextBasisValue = roundInventoryQuantity(basisValue + purchaseValue);
          normalizedAverageCost =
            nextBasisQuantity > 0
              ? roundInventoryQuantity(nextBasisValue / nextBasisQuantity)
              : 0;

          productPatch["inventory.purchaseCostBasisQuantity"] = nextBasisQuantity;
          productPatch["inventory.purchaseCostBasisValue"] = nextBasisValue;
          productPatch["inventory.costPerUnit"] = normalizedAverageCost;
        }

        if (supplierName) {
          productPatch["inventory.supplierName"] = supplierName;
        }

        transaction.update(productRef, productPatch);
        transaction.update(movementRef, {
          procurementApplied: true,
          procurementAppliedAt: serverTimestamp(),
          ...(estimatedUnitCost != null
            ? {
                purchaseUnitCost: estimatedUnitCost,
                purchaseValue,
                normalizedCostPerInventoryUnit: normalizedAverageCost,
              }
            : {}),
          ...(supplierName ? { supplierName } : {}),
          procurementApplyError: deleteField(),
        });

        return "applied" as const;
      });

      if (outcome === "applied") summary.applied += 1;
      else if (outcome === "skipped") summary.skipped += 1;
      else summary.failed += 1;
    } catch (error) {
      summary.failed += 1;
      console.warn("[Hostly Inventory] purchase receipt costing failed", {
        purchaseReceiptId: receiptId,
        productId,
        movementId,
        error,
      });
    }
  }

  return summary;
}
