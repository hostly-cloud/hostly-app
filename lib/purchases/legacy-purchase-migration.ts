import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { isAuthReady } from "@/lib/firebase/is-auth-ready";
import { purchaseOrdersCollectionRef } from "@/lib/firestore/purchase-orders";
import {
  COMPRAS_LOCAL_STORAGE_KEY,
  loadCompras,
  parseCantidadRecibida,
  type CompraLineItemLocal,
  type CompraLocal,
} from "@/lib/compras-local";
import {
  computePurchaseOrderTotalEstimatedCost,
  sanitizePurchaseOrderLines,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
} from "@/lib/purchases/purchase-order-types";

const LEGACY_SEED_IDS = new Set(["seed-c1", "seed-c2", "seed-c3"]);
const ARCHIVE_PREFIX = "hostly.compras.pedidos.v1.archived";

export type LegacyPurchaseMigrationResult = {
  found: number;
  imported: number;
  alreadyImported: number;
  archivedOnly: number;
};

function lineFromLegacy(
  item: CompraLineItemLocal,
  fallbackSupplier: string,
): PurchaseOrderLine | null {
  const productId = item.producto_stock_id?.trim() ?? "";
  const quantity = parseCantidadRecibida(item.cantidad ?? item.cantidad_pedida);
  const productName =
    item.producto_stock_nombre?.trim() || item.nombre?.trim() || item.producto?.trim() || "";
  if (!productId || !productName || quantity == null || quantity <= 0) return null;
  const unitCost =
    typeof item.precio_unitario === "number" && Number.isFinite(item.precio_unitario)
      ? Math.max(0, item.precio_unitario)
      : null;
  return {
    productId,
    productName,
    quantity,
    unit: item.unidad ?? "ud",
    receivedQuantity: 0,
    estimatedUnitCost: unitCost,
    estimatedTotalCost: unitCost == null ? null : unitCost * quantity,
    supplierName: fallbackSupplier || null,
  };
}

function linesFromLegacy(compra: CompraLocal): PurchaseOrderLine[] {
  const supplier = compra.supplierDisplayName?.trim() || compra.proveedor.trim();
  const multi = (compra.items ?? [])
    .map((item) => lineFromLegacy(item, supplier))
    .filter((line): line is PurchaseOrderLine => line != null);
  if (multi.length > 0) return sanitizePurchaseOrderLines(multi);

  const productId = compra.producto_stock_id?.trim() ?? "";
  const productName = compra.producto_stock_nombre?.trim() ?? "";
  const quantity = parseCantidadRecibida(compra.cantidad_recibida);
  if (!productId || !productName || quantity == null || quantity <= 0) return [];
  const unitCost =
    typeof compra.precio_unitario === "number" && Number.isFinite(compra.precio_unitario)
      ? Math.max(0, compra.precio_unitario)
      : compra.total > 0
        ? compra.total / quantity
        : null;
  return sanitizePurchaseOrderLines([
    {
      productId,
      productName,
      quantity,
      unit: compra.unidad ?? "ud",
      receivedQuantity: 0,
      estimatedUnitCost: unitCost,
      estimatedTotalCost: compra.total > 0 ? compra.total : unitCost == null ? null : unitCost * quantity,
      supplierName: supplier || null,
    },
  ]);
}

function statusFromLegacy(compra: CompraLocal): PurchaseOrderStatus {
  if (compra.estado === "cancelado") return "cancelled";
  if (compra.estado === "recibido") return "received";
  return "draft";
}

function legacyDocId(legacyId: string): string {
  return `legacy-${encodeURIComponent(legacyId).slice(0, 900)}`;
}

function archiveKey(restaurantId: string): string {
  return `${ARCHIVE_PREFIX}.${restaurantId}`;
}

export async function migrateLegacyPurchasesFromBrowser(
  restaurantId: string,
): Promise<LegacyPurchaseMigrationResult> {
  const rid = restaurantId.trim();
  if (!rid || !isAuthReady() || !auth.currentUser) {
    throw new Error("legacy_purchase_migration: auth_or_restaurant_unavailable");
  }
  if (typeof window === "undefined") {
    throw new Error("legacy_purchase_migration: browser_required");
  }

  const raw = window.localStorage.getItem(COMPRAS_LOCAL_STORAGE_KEY);
  if (!raw) return { found: 0, imported: 0, alreadyImported: 0, archivedOnly: 0 };

  // Preserve the exact original payload before any write or cleanup.
  window.localStorage.setItem(archiveKey(rid), raw);

  const legacy = loadCompras().filter((compra) => !LEGACY_SEED_IDS.has(compra.id));
  let imported = 0;
  let alreadyImported = 0;
  let archivedOnly = 0;
  const uid = auth.currentUser.uid;

  for (const compra of legacy) {
    const lines = linesFromLegacy(compra);
    if (lines.length === 0) {
      archivedOnly += 1;
      continue;
    }

    const ref = doc(purchaseOrdersCollectionRef(rid), legacyDocId(compra.id));
    const existing = await getDoc(ref);
    if (existing.exists()) {
      alreadyImported += 1;
      continue;
    }

    const status = statusFromLegacy(compra);
    const migratedLines = lines.map((line) => ({
      ...line,
      receivedQuantity: status === "received" ? line.quantity : 0,
    }));
    const supplierName = compra.supplierDisplayName?.trim() || compra.proveedor.trim();
    const notes = [
      compra.notas?.trim(),
      `Migrado desde Compras legacy · fecha ${compra.fecha}`,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 500);

    await setDoc(ref, {
      restaurantId: rid,
      status,
      source: "manual",
      ...(supplierName ? { supplierName: supplierName.slice(0, 160) } : {}),
      lines: migratedLines,
      totalEstimatedCost:
        compra.total > 0 ? compra.total : computePurchaseOrderTotalEstimatedCost(migratedLines),
      ...(notes ? { notes } : {}),
      legacyImport: {
        source: "compras-local-v1",
        legacyId: compra.id,
        originalStatus: compra.estado,
        stockWasApplied: compra.stock_aplicado === true,
        inventoryReceiptId: compra.inventory_receipt_id ?? null,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    });
    imported += 1;
  }

  // The exact source remains in the restaurant-scoped archive key. Removing the active
  // key prevents the retired module from becoming a second source of truth.
  window.localStorage.removeItem(COMPRAS_LOCAL_STORAGE_KEY);

  return {
    found: legacy.length,
    imported,
    alreadyImported,
    archivedOnly,
  };
}
