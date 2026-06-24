import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { restauranteId?: string; orderedIds?: string[] }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = (body.restauranteId ?? "").trim();
  const orderedIds = Array.isArray(body.orderedIds) ? body.orderedIds.filter((x) => typeof x === "string" && x.trim()) : [];
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  if (orderedIds.length === 0) return badRequest("MISSING_ORDERED_IDS");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return NextResponse.json({ ok: false, error: "FIRESTORE_NOT_CONFIGURED" }, { status: 501 });

  const batch = db.batch();
  const now = new Date().toISOString();
  const coll = db.collection("restaurantes").doc(restauranteId).collection("cartaFamilias");
  orderedIds.forEach((id, idx) => {
    batch.update(coll.doc(id), { sortOrder: idx, updatedAt: now });
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
