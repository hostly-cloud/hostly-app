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

const WASTE_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{15,119}$/;

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

function normalizeNotes(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 500)
    : null;
}

export function normalizeWasteIdempotencyKey(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return WASTE_IDEMPOTENCY_KEY_PATTERN.test(candidate) ? candidate : null;
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

function readWasteRecord(id: string, data: Record<string, unknown>): InventoryWasteRecord {
  const createdAtRaw = data.createdAt as { toMillis?: () => number } | null | undefined;
  return {
    id,
    productId: typeof data.productId === "string" ? data.productId : "",
    productName: typeof data.productName === "string" ? data.productName : "Sin nombre",
    quantity: readFiniteNumber(data.quantity) ?? 0,
    unit: typeof data.unit === "string" ? data.unit : "ud",
    reason: normalizeReason(data.reason),
    notes: normalizeNotes(data.notes),
    occurredOn: normalizeIsoDate(data.occurredOn),
    stockBefore: readFiniteNumber(data.stockBefore) ?? 0,
    stockAfter: readFiniteNumber(data.stockAfter) ?? 0,
    createdAt: typeof createdAtRaw?.toMillis === "function" ? createdAtRaw.toMillis() : null,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
  };
}

function assertWasteReplayMatches(
  data: Record<string, unknown>,
  expected: {
    userId: string;
    productId: string;
    quantity: number;
    reason: WasteReason;
    notes: string | null;
    occurredOn: string;
  },
): void {
  const same =
    data.createdBy === expected.userId &&
    data.productId === expected.productId &&
    readFiniteNumber(data.quantity) === expected.quantity &&
    normalizeReason(data.reason) === expected.reason &&
    normalizeNotes(data.notes) === expected.notes &&
    normalizeIsoDate(data.occurredOn) === expected.occurredOn;
  if (!same) throw new Error("IDEMPOTENCY_CONFLICT");
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
  idempotencyKey: string;
}): Promise<InventoryWasteRecord> {
  const restaurantId = args.restaurantId.trim();
  const userId = args.userId.trim();
  const productId = args.productId.trim();
  const quantity = Number(args.quantity);
  const idempotencyKey = normalizeWasteIdempotencyKey(args.idempotencyKey);
  if (!restaurantId || !userId || !productId) throw new Error("INVALID_CONTEXT");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("INVALID_QUANTITY");
  if (!idempotencyKey) throw new Error("INVALID_IDEMPOTENCY_KEY");

  const restaurantRef = args.db.collection("restaurants").doc(restaurantId);
  const productRef = restaurantRef.collection("products").doc(productId);
  const wasteRef = restaurantRef.collection("inventoryWaste").doc(idempotencyKey);
  const movementRef = productRef.collection("stockMovements").doc(idempotencyKey);
  const centralMovementRef = restaurantRef
    .collection("stockMovements")
    .doc(`waste_${idempotencyKey}`);
  const occurredOn = normalizeIsoDate(args.occurredOn);
  const reason = normalizeReason(args.reason);
  const notes = normalizeNotes(args.notes);

  let result: InventoryWasteRecord | null = null;
  await args.db.runTransaction(async (transaction) => {
    const productSnap = await transaction.get(productRef);
    const existingWasteSnap = await transaction.get(wasteRef);

    if (existingWasteSnap.exists) {
      const existing = existingWasteSnap.data() as Record<string, unknown>;
      assertWasteReplayMatches(existing, {
        userId,
        productId,
        quantity,
        reason,
        notes,
        occurredOn,
      });
      result = readWasteRecord(existingWasteSnap.id, existing);
      return;
    }

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
    const unit =
      typeof inventory.unit === "string" && inventory.unit.trim()
        ? inventory.unit.trim()
        : "ud";
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
      idempotencyKey,
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
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: userId,
    });
    transaction.create(centralMovementRef, {
      restaurantId,
      productId,
      productName,
      source: "inventory_waste",
      type: "inventory_waste",
      quantityDelta: -quantity,
      unit,
      reason,
      wasteId: wasteRef.id,
      idempotencyKey,
      applied: true,
      appliedAt: FieldValue.serverTimestamp(),
      stockBefore,
      stockAfter,
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

  return snap.docs.map((doc) => readWasteRecord(doc.id, doc.data() as Record<string, unknown>));
}
