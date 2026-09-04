import { NextResponse } from "next/server";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import { requireLegacyRestaurantApi } from "@/lib/server/auth/require-legacy-restaurant-api";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const authContext = await requireLegacyRestaurantApi(
    req,
    "catalog.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const body = (await req.json().catch(() => null)) as
    | { restauranteId?: string; orderedIds?: string[] }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = authContext.restaurantId;
  const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.filter((x) => typeof x === "string" && x.trim()) : [];
  if (orderedIds.length === 0) return badRequest("MISSING_ORDERED_IDS");

  const db = authContext.db;

  const batch = db.batch();
  const now = new Date().toISOString();
  const coll = db.collection("restaurantes").doc(restauranteId).collection("cartaCategorias");
  orderedIds.forEach((id, idx) => {
    batch.update(coll.doc(id), { sortOrder: idx, updatedAt: now });
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
