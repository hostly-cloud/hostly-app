import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";

type GroupDoc = {
  restauranteId: string;
  nombre: string;
  activo: boolean;
  /** Una opción (radio) vs varias (checkboxes) en TPV. */
  selectionType: "single" | "multiple";
  /** Si el cliente debe elegir al menos una opción del grupo. */
  obligatorio: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

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

export async function GET(req: Request) {
  const url = new URL(req.url);
  const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return badRequest("FIRESTORE_NOT_CONFIGURED", 501);

  const groupsSnap = await db
    .collection("restaurantes")
    .doc(restauranteId)
    .collection("gruposModificadores")
    .orderBy("sortOrder", "asc")
    .get();

  const groups = await Promise.all(
    groupsSnap.docs.map(async (g) => {
      const raw = g.data() as Partial<GroupDoc>;
      const group: GroupDoc = {
        restauranteId: raw.restauranteId ?? restauranteId,
        nombre: raw.nombre ?? "",
        activo: raw.activo !== false,
        selectionType: raw.selectionType === "multiple" ? "multiple" : "single",
        obligatorio: raw.obligatorio === true,
        sortOrder: typeof raw.sortOrder === "number" && Number.isFinite(raw.sortOrder) ? raw.sortOrder : 999,
        createdAt: raw.createdAt ?? "",
        updatedAt: raw.updatedAt ?? "",
      };
      const optSnap = await g.ref.collection("opciones").orderBy("sortOrder", "asc").get();
      const options = optSnap.docs.map((d) => ({ id: d.id, ...(d.data() as OptionDoc) }));
      return { id: g.id, ...group, options };
    }),
  );

  return NextResponse.json({ ok: true, items: groups });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | (Partial<GroupDoc> & {
        restauranteId?: string;
        id?: string;
        nombre?: string;
        activo?: boolean;
        selectionType?: "single" | "multiple";
        obligatorio?: boolean;
      })
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = (body.restauranteId ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  assertServerRestauranteAllowed(restauranteId);
  const nombre = (body.nombre ?? "").trim();
  if (!nombre) return badRequest("MISSING_NOMBRE");

  const db = getHostlyFirestore();
  if (!db) return badRequest("FIRESTORE_NOT_CONFIGURED", 501);

  const now = new Date().toISOString();
  const coll = db.collection("restaurantes").doc(restauranteId).collection("gruposModificadores");
  const id = (body.id ?? "").trim() || coll.doc().id;
  const ref = coll.doc(id);
  const existing = await ref.get();
  const prev = existing.exists ? (existing.data() as Partial<GroupDoc>) : undefined;
  const createdAt = prev?.createdAt ?? now;

  const selectionType: "single" | "multiple" =
    body.selectionType === "multiple" || body.selectionType === "single"
      ? body.selectionType
      : prev?.selectionType === "multiple"
        ? "multiple"
        : "single";

  const obligatorio = typeof body.obligatorio === "boolean" ? body.obligatorio : prev?.obligatorio === true;

  const payload: GroupDoc = {
    restauranteId,
    nombre,
    activo: body.activo ?? prev?.activo ?? true,
    selectionType,
    obligatorio,
    sortOrder: typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : prev?.sortOrder ?? 999,
    createdAt,
    updatedAt: now,
  };

  await ref.set(payload, { merge: true });
  return NextResponse.json({ ok: true, item: { id, ...payload } });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  if (!id) return badRequest("MISSING_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return badRequest("FIRESTORE_NOT_CONFIGURED", 501);

  await db.collection("restaurantes").doc(restauranteId).collection("gruposModificadores").doc(id).delete();
  return NextResponse.json({ ok: true });
}

