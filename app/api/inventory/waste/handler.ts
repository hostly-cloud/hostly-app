import { NextResponse } from "next/server";
import {
  isAuthErrorResponse,
  requireAuthenticatedRestaurant,
  type AuthenticatedRestaurantDependencies,
} from "@/lib/server/auth/require-authenticated-restaurant";
import { serverRoleHasCapability } from "@/lib/server/auth/profile-role";
import {
  createInventoryWaste,
  listInventoryWaste,
  normalizeWasteIdempotencyKey,
  WASTE_REASONS,
  type WasteReason,
} from "@/lib/server/inventory/waste";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isWasteReason(value: unknown): value is WasteReason {
  return typeof value === "string" && (WASTE_REASONS as readonly string[]).includes(value);
}

export async function handleInventoryWasteGet(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "inventory.view")) {
    return jsonError(403, "INVENTORY_VIEW_REQUIRED");
  }
  try {
    const items = await listInventoryWaste({ db: authCtx.db, restaurantId: authCtx.restaurantId });
    return NextResponse.json({ ok: true, items });
  } catch {
    return jsonError(500, "WASTE_LIST_FAILED");
  }
}

export async function handleInventoryWastePost(
  req: Request,
  dependencies?: AuthenticatedRestaurantDependencies,
) {
  const authCtx = await requireAuthenticatedRestaurant(req, dependencies);
  if (isAuthErrorResponse(authCtx)) return authCtx;
  if (!serverRoleHasCapability(authCtx.role, "inventory.edit")) {
    return jsonError(403, "INVENTORY_EDIT_REQUIRED");
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError(400, "INVALID_JSON");
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  const quantity = typeof body.quantity === "number" ? body.quantity : Number(body.quantity);
  const idempotencyKey = normalizeWasteIdempotencyKey(req.headers.get("Idempotency-Key"));
  if (!productId) return jsonError(400, "PRODUCT_REQUIRED");
  if (!Number.isFinite(quantity) || quantity <= 0) return jsonError(400, "INVALID_QUANTITY");
  if (!isWasteReason(body.reason)) return jsonError(400, "INVALID_REASON");
  if (!idempotencyKey) return jsonError(400, "INVALID_IDEMPOTENCY_KEY");

  try {
    const item = await createInventoryWaste({
      db: authCtx.db,
      restaurantId: authCtx.restaurantId,
      userId: authCtx.uid,
      productId,
      quantity,
      reason: body.reason,
      notes: typeof body.notes === "string" ? body.notes : null,
      occurredOn: typeof body.occurredOn === "string" ? body.occurredOn : null,
      idempotencyKey,
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WASTE_CREATE_FAILED";
    if (code === "PRODUCT_NOT_FOUND") return jsonError(404, code);
    if (code === "INSUFFICIENT_STOCK" || code === "IDEMPOTENCY_CONFLICT") {
      return jsonError(409, code);
    }
    if (code === "INVENTORY_DISABLED" || code === "INVALID_CURRENT_STOCK") return jsonError(409, code);
    if (
      code === "INVALID_QUANTITY" ||
      code === "INVALID_CONTEXT" ||
      code === "INVALID_IDEMPOTENCY_KEY"
    ) {
      return jsonError(400, code);
    }
    if (code === "PRODUCT_TENANT_MISMATCH") return jsonError(403, code);
    return jsonError(500, "WASTE_CREATE_FAILED");
  }
}

export async function GET(req: Request) {
  return handleInventoryWasteGet(req);
}

export async function POST(req: Request) {
  return handleInventoryWastePost(req);
}
