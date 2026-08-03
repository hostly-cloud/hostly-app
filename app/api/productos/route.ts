import { NextResponse } from "next/server";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import { requireLegacyRestaurantApi } from "@/lib/server/auth/require-legacy-restaurant-api";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false as const, error: message }, { status });
}

type ProductoApiRow = {
  id: string;
  nombre: string;
  categoria?: string;
  precioVenta?: number;
  activo: boolean;
  fotoUrl?: string;
  imagen?: string;
  imageUrl?: string;
};

function numOrUndef(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export async function GET(req: Request) {
  const authContext = await requireLegacyRestaurantApi(
    req,
    "settings.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const restauranteId = authContext.restaurantId;
  const db = authContext.db;

  const coll = db.collection("restaurantes").doc(restauranteId).collection("productos");

  try {
    let snap;
    try {
      snap = await coll.orderBy("nombre", "asc").get();
    } catch {
      snap = await coll.get();
    }
    const items: ProductoApiRow[] = snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const nombre =
        typeof data.nombre === "string" && data.nombre.trim() ? data.nombre.trim() : d.id;
      const categoria = typeof data.categoria === "string" && data.categoria.trim() ? data.categoria.trim() : undefined;
      const precioVenta =
        numOrUndef(data.precioVenta) ??
        numOrUndef(data.precio) ??
        numOrUndef(data.precioMedioCoste) ??
        numOrUndef(data.precio_venta);
      const fotoUrl =
        typeof data.fotoUrl === "string" && data.fotoUrl.trim()
          ? data.fotoUrl.trim()
          : typeof data.imagen === "string" && data.imagen.trim()
            ? data.imagen.trim()
            : typeof data.imageUrl === "string" && data.imageUrl.trim()
              ? data.imageUrl.trim()
              : undefined;
      const activo = data.activo !== false;
      return {
        id: d.id,
        nombre,
        categoria,
        precioVenta,
        activo,
        fotoUrl,
        imagen: typeof data.imagen === "string" ? data.imagen : undefined,
        imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : undefined,
      };
    });

    items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    return NextResponse.json({ ok: true as const, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "READ_FAILED";
    return NextResponse.json({ ok: false as const, error: msg }, { status: 500 });
  }
}
