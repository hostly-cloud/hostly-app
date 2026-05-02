import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";

type OptionDoc = {
  restauranteId: string;
  groupId: string;
  nombre: string;
  priceExtra: number;
  activo: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | (Partial<OptionDoc> & { restauranteId?: string; id?: string; groupId?: string; nombre?: string })
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = (body.restauranteId ?? "").trim();
  const groupId = (body.groupId ?? "").trim();
  const nombre = (body.nombre ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  if (!groupId) return badRequest("MISSING_GROUP_ID");
  if (!nombre) return badRequest("MISSING_NOMBRE");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return badRequest("FIRESTORE_NOT_CONFIGURED", 501);

  const now = new Date().toISOString();
  const groupRef = db.collection("restaurantes").doc(restauranteId).collection("gruposModificadores").doc(groupId);
  const optColl = groupRef.collection("opciones");
  const id = (body.id ?? "").trim() || optColl.doc().id;
  const ref = optColl.doc(id);
  const existing = await ref.get();
  const createdAt = existing.exists ? ((existing.data() as OptionDoc | undefined)?.createdAt ?? now) : now;

  const priceExtra =
    typeof body.priceExtra === "number" && Number.isFinite(body.priceExtra) ? body.priceExtra : (existing.data() as OptionDoc | undefined)?.priceExtra ?? 0;

  const payload: OptionDoc = {
    restauranteId,
    groupId,
    nombre,
    priceExtra,
    activo: body.activo ?? true,
    sortOrder: typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : (existing.data() as OptionDoc | undefined)?.sortOrder ?? 999,
    createdAt,
    updatedAt: now,
  };

  await ref.set(payload, { merge: true });
  return NextResponse.json({ ok: true, item: { id, ...payload } });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
  const groupId = (url.searchParams.get("groupId") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  if (!groupId) return badRequest("MISSING_GROUP_ID");
  if (!id) return badRequest("MISSING_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return badRequest("FIRESTORE_NOT_CONFIGURED", 501);

  await db
    .collection("restaurantes")
    .doc(restauranteId)
    .collection("gruposModificadores")
    .doc(groupId)
    .collection("opciones")
    .doc(id)
    .delete();
  return NextResponse.json({ ok: true });
}

