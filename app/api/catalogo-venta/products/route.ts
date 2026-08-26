import { NextResponse } from "next/server";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import { requireLegacyRestaurantApi } from "@/lib/server/auth/require-legacy-restaurant-api";

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

export async function GET(req: Request) {
  const authContext = await requireLegacyRestaurantApi(
    req,
    "settings.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const restauranteId = authContext.restaurantId;
  const db = authContext.db;

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
  const authContext = await requireLegacyRestaurantApi(
    req,
    "settings.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const body = (await req.json().catch(() => null)) as
    | {
        restauranteId?: string;
        id?: string;
        patch?: Partial<Pick<CatalogoVentaDoc, "familyId" | "admiteModificadores" | "gruposModificadoresIds" | "nombre" | "activo" | "categoria" | "precioVenta">>;
      }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  if ("restauranteId" in body && body.restauranteId != null) {
    return badRequest("RESTAURANT_ID_NOT_ALLOWED");
  }

  const restauranteId = authContext.restaurantId;
  const id = (body.id ?? "").trim();
  if (!id) return badRequest("MISSING_ID");

  const db = authContext.db;

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
      ? (patch.gruposModificadoresIds as unknown[])
          .filter((x) => typeof x === "string" && x.trim())
          .map((x) => String(x))
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
  if (
    "precioVenta" in patch &&
    typeof patch.precioVenta === "number" &&
    Number.isFinite(patch.precioVenta)
  ) {
    safe.precioVenta = Math.max(0, patch.precioVenta);
  }

  await ref.set(safe, { merge: true });
  const next = await ref.get();
  return NextResponse.json({ ok: true, item: { id: next.id, ...(next.data() as CatalogoVentaDoc) } });
}
