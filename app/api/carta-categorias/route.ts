import type { DocumentData } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";
import { readCategoryProductFamilyType } from "@/lib/carta/category-product-family";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import type { ProductFamilyType } from "@/lib/carta/product-family-types";
import { normalizeCategoryOperationalBehavior } from "@/lib/carta-categorias/category-operational-behavior";
import { slugifyCartaCategoria } from "@/lib/carta-categorias/slug";
import { normalizeModifierGroupIds } from "@/lib/modifiers/modifier-group-ids";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type FirestoreCatDoc = {
  name: string;
  slug: string;
  type: CartaCategoriaTipo;
  categoryOperationalBehavior?: string;
  cartaFamiliaId?: string;
  productFamilyId?: string;
  productFamilyName?: string;
  productFamilyType?: ProductFamilyType;
  modifierGroupIds?: string[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function readProductFamilyFields(d: DocumentData): Pick<
  CartaCategoria,
  "productFamilyId" | "productFamilyName" | "productFamilyType"
> {
  const pfId =
    typeof d.productFamilyId === "string" ? d.productFamilyId.trim() : "";
  const pfName =
    typeof d.productFamilyName === "string" ? d.productFamilyName.trim() : "";
  const pfType = readCategoryProductFamilyType(d.productFamilyType);
  return {
    ...(pfId ? { productFamilyId: pfId } : {}),
    ...(pfName ? { productFamilyName: pfName } : {}),
    ...(pfType ? { productFamilyType: pfType } : {}),
  };
}

function readModifierGroupIds(d: DocumentData): string[] | undefined {
  const ids = normalizeModifierGroupIds(d.modifierGroupIds);
  return ids.length > 0 ? ids : undefined;
}

function docToCategory(restauranteId: string, id: string, d: DocumentData): CartaCategoria {
  const type = isCartaCategoriaTipo(d.type) ? d.type : "general";
  const fid = typeof d.cartaFamiliaId === "string" ? d.cartaFamiliaId.trim() : "";
  const modifierGroupIds = readModifierGroupIds(d);
  const categoryOperationalBehavior = normalizeCategoryOperationalBehavior(
    d.categoryOperationalBehavior,
  );
  return {
    id,
    restauranteId,
    name: typeof d.name === "string" ? d.name : "",
    slug: typeof d.slug === "string" ? d.slug : "",
    type,
    categoryOperationalBehavior,
    ...(fid ? { cartaFamiliaId: fid } : {}),
    ...readProductFamilyFields(d),
    ...(modifierGroupIds ? { modifierGroupIds } : {}),
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
    .collection("cartaCategorias")
    .orderBy("sortOrder", "asc")
    .get();

  const items: CartaCategoria[] = snap.docs.map((doc) => docToCategory(restauranteId, doc.id, doc.data()));
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | {
        restauranteId?: string;
        name?: string;
        type?: string;
        cartaFamiliaId?: string | null;
        productFamilyId?: string | null;
        productFamilyName?: string | null;
        productFamilyType?: string | null;
        modifierGroupIds?: string[] | null;
        categoryOperationalBehavior?: string;
        isActive?: boolean;
        sortOrder?: number;
      }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = (body.restauranteId ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
  if (!name) return badRequest("MISSING_NAME");
  assertServerRestauranteAllowed(restauranteId);

  const db = getHostlyFirestore();
  if (!db) return NextResponse.json({ ok: false, error: "FIRESTORE_NOT_CONFIGURED" }, { status: 501 });

  const type: CartaCategoriaTipo = isCartaCategoriaTipo(body.type) ? body.type : "general";
  const famRaw = typeof body.cartaFamiliaId === "string" ? body.cartaFamiliaId.trim() : "";
  const pfId =
    typeof body.productFamilyId === "string" ? body.productFamilyId.trim() : "";
  const pfName =
    typeof body.productFamilyName === "string" ? body.productFamilyName.trim() : "";
  const pfType = readCategoryProductFamilyType(body.productFamilyType);
  const modifierGroupIds = normalizeModifierGroupIds(body.modifierGroupIds);
  const categoryOperationalBehavior = normalizeCategoryOperationalBehavior(
    body.categoryOperationalBehavior,
  );
  const now = new Date().toISOString();
  const coll = db.collection("restaurantes").doc(restauranteId).collection("cartaCategorias");

  let sortOrder = typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : -1;
  if (sortOrder < 0) {
    const agg = await coll.orderBy("sortOrder", "desc").limit(1).get();
    const top = agg.docs[0]?.data()?.sortOrder;
    sortOrder = (typeof top === "number" && Number.isFinite(top) ? top : -1) + 1;
  }

  const ref = coll.doc();
  const id = ref.id;
  const slug = `${slugifyCartaCategoria(name)}-${id.slice(0, 8)}`;
  const payload: FirestoreCatDoc = {
    name,
    slug,
    type,
    categoryOperationalBehavior,
    ...(famRaw ? { cartaFamiliaId: famRaw } : {}),
    ...(pfId ? { productFamilyId: pfId } : {}),
    ...(pfName ? { productFamilyName: pfName } : {}),
    ...(pfType ? { productFamilyType: pfType } : {}),
    ...(modifierGroupIds.length > 0 ? { modifierGroupIds } : {}),
    sortOrder,
    isActive: body.isActive !== false,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(payload);
  const item = docToCategory(restauranteId, id, payload);
  return NextResponse.json({ ok: true, item });
}
