import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";
import { readCategoryProductFamilyType } from "@/lib/carta/category-product-family";
import type { CartaCategoria, CartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { isCartaCategoriaTipo } from "@/lib/carta-categorias/types";
import { isProductFamilyType } from "@/lib/carta/product-family-types";
import { normalizeCategoryOperationalBehavior } from "@/lib/carta-categorias/category-operational-behavior";
import { slugifyCartaCategoria } from "@/lib/carta-categorias/slug";
import { normalizeModifierGroupIds } from "@/lib/modifiers/modifier-group-ids";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function readModifierGroupIds(d: DocumentData): string[] | undefined {
  const ids = normalizeModifierGroupIds(d.modifierGroupIds);
  return ids.length > 0 ? ids : undefined;
}

function docToCategory(restauranteId: string, id: string, d: DocumentData): CartaCategoria {
  const type = isCartaCategoriaTipo(d.type) ? d.type : "general";
  const fid = typeof d.cartaFamiliaId === "string" ? d.cartaFamiliaId.trim() : "";
  const pfId =
    typeof d.productFamilyId === "string" ? d.productFamilyId.trim() : "";
  const pfName =
    typeof d.productFamilyName === "string" ? d.productFamilyName.trim() : "";
  const pfType = readCategoryProductFamilyType(d.productFamilyType);
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
    ...(pfId ? { productFamilyId: pfId } : {}),
    ...(pfName ? { productFamilyName: pfName } : {}),
    ...(pfType ? { productFamilyType: pfType } : {}),
    ...(modifierGroupIds ? { modifierGroupIds } : {}),
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

  const patch: Partial<{
    name: string;
    type: string;
    cartaFamiliaId: string | null;
    productFamilyId: string | null;
    productFamilyName: string | null;
    productFamilyType: string | null;
    modifierGroupIds: string[] | null;
    categoryOperationalBehavior: string;
    sortOrder: number;
    isActive: boolean;
  }> = body.patch ?? {};
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
  if ("productFamilyId" in patch) {
    if (patch.productFamilyId == null || patch.productFamilyId === "") {
      update.productFamilyId = FieldValue.delete();
      update.productFamilyName = FieldValue.delete();
      update.productFamilyType = FieldValue.delete();
    } else if (typeof patch.productFamilyId === "string") {
      const id = patch.productFamilyId.trim();
      if (id) {
        update.productFamilyId = id;
        if (typeof patch.productFamilyName === "string" && patch.productFamilyName.trim()) {
          update.productFamilyName = patch.productFamilyName.trim();
        }
        if (
          typeof patch.productFamilyType === "string" &&
          isProductFamilyType(patch.productFamilyType)
        ) {
          update.productFamilyType = patch.productFamilyType;
        }
      } else {
        update.productFamilyId = FieldValue.delete();
        update.productFamilyName = FieldValue.delete();
        update.productFamilyType = FieldValue.delete();
      }
    }
  } else if (
    "productFamilyName" in patch ||
    "productFamilyType" in patch
  ) {
    if (typeof patch.productFamilyName === "string" && patch.productFamilyName.trim()) {
      update.productFamilyName = patch.productFamilyName.trim();
    }
    if (
      typeof patch.productFamilyType === "string" &&
      isProductFamilyType(patch.productFamilyType)
    ) {
      update.productFamilyType = patch.productFamilyType;
    }
  }
  if ("sortOrder" in patch && typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)) {
    update.sortOrder = patch.sortOrder;
  }
  if ("isActive" in patch) {
    update.isActive = Boolean(patch.isActive);
  }
  if ("modifierGroupIds" in patch) {
    if (!Array.isArray(patch.modifierGroupIds) || patch.modifierGroupIds.length === 0) {
      update.modifierGroupIds = FieldValue.delete();
    } else {
      const ids = normalizeModifierGroupIds(patch.modifierGroupIds);
      update.modifierGroupIds = ids.length > 0 ? ids : FieldValue.delete();
    }
  }
  if ("categoryOperationalBehavior" in patch) {
    update.categoryOperationalBehavior = normalizeCategoryOperationalBehavior(
      patch.categoryOperationalBehavior,
    );
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

  const productsColl = db.collection("restaurants").doc(restauranteId).collection("products");
  const linkedProducts = await productsColl.where("categoryId", "==", catId).get();
  const now = Date.now();
  const batch = db.batch();

  for (const productDoc of linkedProducts.docs) {
    batch.update(productDoc.ref, {
      categoryId: FieldValue.delete(),
      categoryName: FieldValue.delete(),
      updatedAt: now,
    });
  }
  batch.delete(ref);
  await batch.commit();

  return NextResponse.json({ ok: true });
}
