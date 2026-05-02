import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";
import { supabase } from "@/lib/supabase";

type CatalogoVentaDoc = {
  restauranteId: string;
  nombre: string;
  tipoVenta: string;
  categoria: string;
  precioVenta: number;
  activo: boolean;
  escandalloSupabaseId: number | null;
  createdAt: string;
  updatedAt: string;
  familyId?: string;
  admiteModificadores?: boolean;
  gruposModificadoresIds?: string[];
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function bootstrapFromEscandallosIfEmpty(restauranteId: string, db: FirebaseFirestore.Firestore) {
  const coll = db.collection("restaurantes").doc(restauranteId).collection("catalogoVenta");
  const existing = await coll.limit(1).get();
  if (!existing.empty) return;

  const { data, error } = await supabase
    .from("escandallos")
    .select("id, nombre_plato, precio_venta")
    .order("nombre_plato", { ascending: true, nullsFirst: false });

  if (error || !data?.length) return;

  const now = new Date().toISOString();
  const batch = db.batch();
  let wrote = 0;
  for (const row of data) {
    const escId = typeof row.id === "number" ? row.id : Number(row.id);
    if (!Number.isFinite(escId)) continue;
    const nombre =
      typeof row.nombre_plato === "string" && row.nombre_plato.trim() ? row.nombre_plato.trim() : null;
    if (!nombre) continue;
    const pv =
      row.precio_venta != null && Number.isFinite(Number(row.precio_venta)) ? Number(row.precio_venta) : 0;

    const docId = `esc-${escId}`;
    const ref = coll.doc(docId);
    const payload: CatalogoVentaDoc = {
      restauranteId,
      nombre,
      tipoVenta: "plato",
      categoria: "General",
      precioVenta: Math.max(0, pv),
      activo: true,
      escandalloSupabaseId: escId,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, payload, { merge: true });
    wrote++;
    if (wrote >= 500) break;
  }
  if (wrote > 0) await batch.commit();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return badRequest("FIRESTORE_NOT_CONFIGURED", 501);

  await bootstrapFromEscandallosIfEmpty(restauranteId, db as any);

  const snap = await db
    .collection("restaurantes")
    .doc(restauranteId)
    .collection("catalogoVenta")
    .orderBy("nombre", "asc")
    .get();

  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as CatalogoVentaDoc) }));
  return NextResponse.json({ ok: true, items });
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        restauranteId?: string;
        id?: string;
        patch?: Partial<Pick<CatalogoVentaDoc, "familyId" | "admiteModificadores" | "gruposModificadoresIds" | "nombre" | "activo" | "categoria" | "precioVenta">>;
      }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = (body.restauranteId ?? "").trim();
  const id = (body.id ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  if (!id) return badRequest("MISSING_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return badRequest("FIRESTORE_NOT_CONFIGURED", 501);

  const ref = db.collection("restaurantes").doc(restauranteId).collection("catalogoVenta").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return badRequest("PRODUCT_NOT_FOUND", 404);

  const patch = (body.patch ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  const safe: Partial<CatalogoVentaDoc> = {
    updatedAt: now,
  };

  if ("familyId" in patch) {
    const v = typeof patch.familyId === "string" ? patch.familyId.trim() : "";
    safe.familyId = v || undefined;
  }
  if ("admiteModificadores" in patch) {
    safe.admiteModificadores = Boolean(patch.admiteModificadores);
  }
  if ("gruposModificadoresIds" in patch) {
    safe.gruposModificadoresIds = Array.isArray(patch.gruposModificadoresIds)
      ? (patch.gruposModificadoresIds as unknown[]).filter((x) => typeof x === "string" && x.trim()).map((x) => String(x))
      : [];
  }

  // (Opcional) soporta cambios básicos si en el futuro quieres reutilizar este endpoint.
  if ("nombre" in patch && typeof patch.nombre === "string") {
    const nombre = patch.nombre.trim();
    if (nombre) safe.nombre = nombre;
  }
  if ("activo" in patch) {
    safe.activo = Boolean(patch.activo);
  }
  if ("categoria" in patch && typeof patch.categoria === "string") {
    const c = patch.categoria.trim();
    if (c) safe.categoria = c;
  }
  if ("precioVenta" in patch && typeof patch.precioVenta === "number" && Number.isFinite(patch.precioVenta)) {
    safe.precioVenta = Math.max(0, patch.precioVenta);
  }

  await ref.set(safe, { merge: true });
  const next = await ref.get();
  return NextResponse.json({ ok: true, item: { id: next.id, ...(next.data() as CatalogoVentaDoc) } });
}

