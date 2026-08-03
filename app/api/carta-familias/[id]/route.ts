import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  applyCartaFamiliaProductionStationPatchToUpdate,
  cartaFamiliaFromFirestoreDoc,
  cartaFamiliaOperationalPatchFromBody,
} from "@/lib/carta-categorias/familia-operational-config";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import { requireLegacyRestaurantApi } from "@/lib/server/auth/require-legacy-restaurant-api";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authContext = await requireLegacyRestaurantApi(
    req,
    "settings.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const { id } = await ctx.params;
  const famId = (id ?? "").trim();
  if (!famId) return badRequest("MISSING_ID");

  const body = (await req.json().catch(() => null)) as
    | {
        restauranteId?: string;
        patch?: Record<string, unknown>;
      }
    | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = authContext.restaurantId;

  const db = authContext.db;

  const ref = db.collection("restaurantes").doc(restauranteId).collection("cartaFamilias").doc(famId);
  const snap = await ref.get();
  if (!snap.exists) return badRequest("NOT_FOUND", 404);

  const patch = body.patch ?? {};
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updatedAt: now };

  if ("name" in patch && typeof patch.name === "string") {
    const n = patch.name.trim();
    if (n) update.name = n;
  }
  if ("sortOrder" in patch && typeof patch.sortOrder === "number" && Number.isFinite(patch.sortOrder)) {
    update.sortOrder = patch.sortOrder;
  }
  if ("isActive" in patch) {
    update.isActive = Boolean(patch.isActive);
  }

  const operationalPatch = cartaFamiliaOperationalPatchFromBody(patch);
  if ("familyType" in operationalPatch) update.familyType = operationalPatch.familyType;
  if ("suggestedDestination" in operationalPatch) {
    update.suggestedDestination = operationalPatch.suggestedDestination;
  }
  if ("defaultPass" in operationalPatch) update.defaultPass = operationalPatch.defaultPass;
  if ("trabajaPorPases" in operationalPatch) {
    update.trabajaPorPases = operationalPatch.trabajaPorPases;
  }
  if ("description" in operationalPatch) {
    const desc =
      typeof operationalPatch.description === "string"
        ? operationalPatch.description.trim()
        : "";
    if (desc) update.description = desc;
    else update.description = "";
  }
  if ("requierePreparacion" in operationalPatch) {
    update.requierePreparacion = operationalPatch.requierePreparacion;
  }
  if ("marchable" in operationalPatch) update.marchable = operationalPatch.marchable;
  if ("agruparLineas" in operationalPatch) update.agruparLineas = operationalPatch.agruparLineas;
  applyCartaFamiliaProductionStationPatchToUpdate(operationalPatch, update, FieldValue.delete());

  await ref.update(update);
  const next = await ref.get();
  const item = cartaFamiliaFromFirestoreDoc(
    restauranteId,
    famId,
    (next.data() ?? {}) as Record<string, unknown>,
  );
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authContext = await requireLegacyRestaurantApi(
    req,
    "settings.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const { id } = await ctx.params;
  const famId = (id ?? "").trim();
  if (!famId) return badRequest("MISSING_ID");

  const restauranteId = authContext.restaurantId;

  const db = authContext.db;

  const catsSnap = await db
    .collection("restaurantes")
    .doc(restauranteId)
    .collection("cartaCategorias")
    .where("cartaFamiliaId", "==", famId)
    .limit(1)
    .get();
  if (!catsSnap.empty) {
    return badRequest("FAMILY_IN_USE", 409);
  }

  const ref = db.collection("restaurantes").doc(restauranteId).collection("cartaFamilias").doc(famId);
  const snap = await ref.get();
  if (!snap.exists) return badRequest("NOT_FOUND", 404);
  await ref.delete();
  return NextResponse.json({ ok: true });
}
