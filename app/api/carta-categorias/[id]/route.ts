import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { slugifyCartaCategoria } from "@/lib/carta-categorias/slug";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function docToCategory(restauranteId: string, id: string, d: DocumentData): CartaCategoria {
  const type = isCartaCategoriaTipo(d.type) ? d.type : "general";
  const fid = typeof d.cartaFamiliaId === "string" ? d.cartaFamiliaId.trim() : "";
  return {
    id,
    restauranteId,
    name: typeof d.name === "string" ? d.name : "",
    slug: typeof d.slug === "string" ? d.slug : "",
    type,
    ...(fid ? { cartaFamiliaId: fid } : {}),
    sortOrder: typeof d.sortOrder === "number" && Number.isFinite(d.sortOrder) ? d.sortOrder : 0,
    isActive: d.isActive !== false,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : "",
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : "",
  };
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const catId = (id ?? "").trim();
  if (!catId) return badRequest("MISSING_ID");

  const body = (await req.json().catch(() => null)) as
    | {
        restauranteId?: string;
        patch?: Partial<{ name: string; type: string; cartaFamiliaId: string | null; sortOrder: number; isActive: boolean }>;
      }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = (body.restauranteId ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return NextResponse.json({ ok: false, error: "FIRESTORE_NOT_CONFIGURED" }, { status: 501 });

  const ref = db.collection("restaurantes").doc(restauranteId).collection("cartaCategorias").doc(catId);
  const snap = await ref.get();
  if (!snap.exists) return badRequest("NOT_FOUND", 404);

  const patch = body.patch ?? {};
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: now };

  if ("name" in patch && typeof patch.name === "string") {
    const n = patch.name.trim();
    if (n) {
      update.name = n;
      update.slug = `${slugifyCartaCategoria(n)}-${catId.slice(0, 8)}`;
    }
  }
  if ("type" in patch && isCartaCategoriaTipo(patch.type)) {
    update.type = patch.type;
  }
  if ("cartaFamiliaId" in patch) {
    if (patch.cartaFamiliaId == null || patch.cartaFamiliaId === "") {
      update.cartaFamiliaId = FieldValue.delete();
    } else if (typeof patch.cartaFamiliaId === "string") {
      const f = patch.cartaFamiliaId.trim();
      update.cartaFamiliaId = f ? f : FieldValue.delete();
    }
  }
  if ("sortOrder" in patch && typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)) {
    update.sortOrder = patch.sortOrder;
  }
  if ("isActive" in patch) {
    update.isActive = Boolean(patch.isActive);
  }

  await ref.update(update);
  const next = await ref.get();
  const item = docToCategory(restauranteId, catId, next.data()!);
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const catId = (id ?? "").trim();
  if (!catId) return badRequest("MISSING_ID");

  const url = new URL(req.url);
  const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return NextResponse.json({ ok: false, error: "FIRESTORE_NOT_CONFIGURED" }, { status: 501 });

  const ref = db.collection("restaurantes").doc(restauranteId).collection("cartaCategorias").doc(catId);
  const snap = await ref.get();
  if (!snap.exists) return badRequest("NOT_FOUND", 404);

  await ref.delete();
  return NextResponse.json({ ok: true });
}
