import { FieldValue, type Firestore } from "firebase-admin/firestore";

export const WASTE_REASONS = [
  "caducado",
  "roto",
  "error cocina",
  "invitación",
  "otro",
] as const;

export type WasteReason = (typeof WASTE_REASONS)[number];

export type InventoryWasteRecord = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  reason: WasteReason;
  notes: string | null;
  occurredOn: string;
  stockBefore: number;
  stockAfter: number;
  createdAt: number | null;
  createdBy: string | null;
};

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeReason(value: unknown): WasteReason {
  const candidate = typeof value === "string" ? value.trim() : "";
  return (WASTE_REASONS as readonly string[]).includes(candidate)
    ? (candidate as WasteReason)
    : "otro";
}

function normalizeIsoDate(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
  return new Date().toISOString().slice(0, 10);
}

function readProductName(data: Record<string, unknown>): string {
  const name =
    typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : typeof data.nombre === "string" && data.nombre.trim()
        ? data.nombre.trim()
        : "";
  return name || "Sin nombre";
}

function readInventory(data: Record<string, unknown>): Record<string, unknown> {
  return data.inventory && typeof data.inventory === "object"
    ? (data.inventory as Record<string, unknown>)
    : {};
}

export async function createInventoryWaste(args: {
  db: Firestore;
  restaurantId: string;
  userId: string;
  productId: string;
  quantity: number;
  reason: WasteReason;
  notes?: string | null;
  occurredOn?: string | null;
}): Promise<InventoryWasteRecord> {
  const restaurantId = args.restaurantId.trim();
  const userId = args.userId.trim();
  const productId = args.productId.trim();
  const quantity = Number(args.quantity);
  if (!restaurantId || !userId || !productId) throw new Error("INVALID_CONTEXT");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("INVALID_QUANTITY");

  const restaurantRef = args.db.collection("restaurants").doc(restaurantId);
  const productRef = restaurantRef.collection("products").doc(productId);
  const wasteRef = restaurantRef.collection("inventoryWaste").doc();
  const movementRef = productRef.collection("stockMovements").doc(wasteRef.id);
  const occurredOn = normalizeIsoDate(args.occurredOn);
  const reason = normalizeReason(args.reason);
  const notes = args.notes?.trim().slice(0, 500) || null;

  let result: InventoryWasteRecord | null = null;
  await args.db.runTransaction(async (transaction) => {
    const productSnap = await transaction.get(productRef);
    if (!productSnap.exists) throw new Error("PRODUCT_NOT_FOUND");
    const product = productSnap.data() as Record<string, unknown>;
    const documentRestaurantId =
      typeof product.restaurantId === "string" ? product.restaurantId.trim() : "";
    if (documentRestaurantId && documentRestaurantId !== restaurantId) {
      throw new Error("PRODUCT_TENANT_MISMATCH");
    }

    const inventory = readInventory(product);
    if (inventory.enabled !== true) throw new Error("INVENTORY_DISABLED");
    const stockBefore = readFiniteNumber(inventory.currentStock);
    if (stockBefore == null || stockBefore < 0) throw new Error("INVALID_CURRENT_STOCK");
    if (quantity > stockBefore) throw new Error("INSUFFICIENT_STOCK");
    const stockAfter = Math.max(0, stockBefore - quantity);
    const unit = typeof inventory.unit === "string" && inventory.unit.trim() ? inventory.unit.trim() : "ud";
    const productName = readProductName(product);

    transaction.update(productRef, {
      "inventory.currentStock": stockAfter,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(wasteRef, {
      restaurantId,
      productId,
      productName,
      quantity,
      unit,
      reason,
      notes,
      occurredOn,
      stockBefore,
      stockAfter,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userId,
      source: "inventory_waste",
    });
    transaction.create(movementRef, {
      type: "waste",
      previousStock: stockBefore,
      newStock: stockAfter,
      delta: -quantity,
      unit,
      reason,
      source: "inventory_waste",
      wasteId: wasteRef.id,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userId,
    });

    result = {
      id: wasteRef.id,
      productId,
      productName,
      quantity,
      unit,
      reason,
      notes,
      occurredOn,
      stockBefore,
      stockAfter,
      createdAt: Date.now(),
      createdBy: userId,
    };
  });

  if (!result) throw new Error("WASTE_TRANSACTION_FAILED");
  return result;
}

export async function listInventoryWaste(args: {
  db: Firestore;
  restaurantId: string;
  limit?: number;
}): Promise<InventoryWasteRecord[]> {
  const restaurantId = args.restaurantId.trim();
  if (!restaurantId) throw new Error("INVALID_CONTEXT");
  const max = Math.max(1, Math.min(250, Math.floor(args.limit ?? 100)));
  const snap = await args.db
    .collection("restaurants")
    .doc(restaurantId)
    .collection("inventoryWaste")
    .orderBy("createdAt", "desc")
    .limit(max)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const createdAtRaw = data.createdAt as { toMillis?: () => number } | null | undefined;
    return {
      id: doc.id,
      productId: typeof data.productId === "string" ? data.productId : "",
      productName: typeof data.productName === "string" ? data.productName : "Sin nombre",
      quantity: readFiniteNumber(data.quantity) ?? 0,
      unit: typeof data.unit === "string" ? data.unit : "ud",
      reason: normalizeReason(data.reason),
      notes: typeof data.notes === "string" && data.notes.trim() ? data.notes.trim() : null,
      occurredOn: normalizeIsoDate(data.occurredOn),
      stockBefore: readFiniteNumber(data.stockBefore) ?? 0,
      stockAfter: readFiniteNumber(data.stockAfter) ?? 0,
      createdAt: typeof createdAtRaw?.toMillis === "function" ? createdAtRaw.toMillis() : null,
      createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    };
  });
}
