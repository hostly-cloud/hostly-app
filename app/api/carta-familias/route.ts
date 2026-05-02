import type { DocumentData } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";
import type { CartaFamilia } from "@/lib/carta-categorias/types";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type FirestoreFamDoc = {
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function docToFamilia(restauranteId: string, id: string, d: DocumentData): CartaFamilia {
  return {
    id,
    restauranteId,
    name: typeof d.name === "string" ? d.name : "",
    sortOrder: typeof d.sortOrder === "number" && Number.isFinite(d.sortOrder) ? d.sortOrder : 0,
    isActive: d.isActive !== false,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return NextResponse.json({ ok: false, error: "FIRESTORE_NOT_CONFIGURED" }, { status: 501 });

  const snap = await db
    .collection("restaurantes")
    .doc(restauranteId)
    .collection("cartaFamilias")
    .orderBy("sortOrder", "asc")
    .get();

  const items: CartaFamilia[] = snap.docs.map((doc) => docToFamilia(restauranteId, doc.id, doc.data()));
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { restauranteId?: string; name?: string; isActive?: boolean; sortOrder?: number }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = (body.restauranteId ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  if (!name) return badRequest("MISSING_NAME");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return NextResponse.json({ ok: false, error: "FIRESTORE_NOT_CONFIGURED" }, { status: 501 });

  const coll = db.collection("restaurantes").doc(restauranteId).collection("cartaFamilias");
  let sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : -1;
  if (sortOrder < 0) {
    const agg = await coll.orderBy("sortOrder", "desc").limit(1).get();
    const top = agg.docs[0]?.data()?.sortOrder;
    sortOrder = (typeof top === "number" && Number.isFinite(top) ? top : -1) + 1;
  }

  const now = new Date().toISOString();
  const ref = coll.doc();
  const id = ref.id;
  const payload: FirestoreFamDoc = {
    name,
    sortOrder,
    isActive: body.isActive !== false,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(payload);
  const item = docToFamilia(restauranteId, id, payload);
  return NextResponse.json({ ok: true, item });
}
