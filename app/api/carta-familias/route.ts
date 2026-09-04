import { NextResponse } from "next/server";
import {
  applyCartaFamiliaProductionStationPatchToUpdate,
  cartaFamiliaFromFirestoreDoc,
  cartaFamiliaOperationalPatchFromBody,
  DEFAULT_CARTA_FAMILIA_OPERATIVA,
  normalizeCartaFamiliaOperativa,
} from "@/lib/carta-categorias/familia-operational-config";
import type { ProductionStationType } from "@/lib/produccion/production-station-types";
import type { CartaFamilia } from "@/lib/carta-categorias/types";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import { requireLegacyRestaurantApi } from "@/lib/server/auth/require-legacy-restaurant-api";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type FirestoreFamDoc = {
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  familyType: CartaFamilia["familyType"];
  suggestedDestination: CartaFamilia["suggestedDestination"];
  defaultPass: CartaFamilia["defaultPass"];
  trabajaPorPases: boolean;
  description?: string;
  requierePreparacion: boolean;
  marchable: boolean;
  agruparLineas: boolean;
  productionStationId?: string;
  productionStationName?: string;
  productionStationType?: ProductionStationType;
};

export async function GET(req: Request) {
  const authContext = await requireLegacyRestaurantApi(req, "tpv.sell");
  if (isAuthErrorResponse(authContext)) return authContext;

  const restauranteId = authContext.restaurantId;
  const db = authContext.db;

  const snap = await db
    .collection("restaurantes")
    .doc(restauranteId)
    .collection("cartaFamilias")
    .orderBy("sortOrder", "asc")
    .get();

  const items: CartaFamilia[] = snap.docs.map((doc) =>
    cartaFamiliaFromFirestoreDoc(restauranteId, doc.id, doc.data() as Record<string, unknown>),
  );
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const authContext = await requireLegacyRestaurantApi(
    req,
    "catalog.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return badRequest("INVALID_JSON");
  const restauranteId = authContext.restaurantId;
  const name = (typeof body.name === "string" ? body.name : "").trim();
  if (!name) return badRequest("MISSING_NAME");

  const db = authContext.db;

  const coll = db.collection("restaurantes").doc(restauranteId).collection("cartaFamilias");
  let sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder) ? body.sortOrder : -1;
  if (sortOrder < 0) {
    const agg = await coll.orderBy("sortOrder", "desc").limit(1).get();
    const top = agg.docs[0]?.data()?.sortOrder;
    sortOrder = (typeof top === "number" && Number.isFinite(top) ? top : -1) + 1;
  }

  const operationalPatch = cartaFamiliaOperationalPatchFromBody(body);
  const operativa = normalizeCartaFamiliaOperativa({
    ...DEFAULT_CARTA_FAMILIA_OPERATIVA,
    ...operationalPatch,
  });

  const now = new Date().toISOString();
  const ref = coll.doc();
  const id = ref.id;
  const payload: FirestoreFamDoc = {
    name,
    sortOrder,
    isActive: body.isActive !== false,
    createdAt: now,
    updatedAt: now,
    familyType: operativa.familyType,
    suggestedDestination: operativa.suggestedDestination,
    defaultPass: operativa.defaultPass,
    trabajaPorPases: operativa.trabajaPorPases,
    ...(operativa.description ? { description: operativa.description } : {}),
    requierePreparacion: operativa.requierePreparacion,
    marchable: operativa.marchable,
    agruparLineas: operativa.agruparLineas,
  };
  const productionUpdate: Record<string, unknown> = {};
  applyCartaFamiliaProductionStationPatchToUpdate(operationalPatch, productionUpdate, null);
  if (typeof productionUpdate.productionStationId === "string") {
    payload.productionStationId = productionUpdate.productionStationId;
    if (typeof productionUpdate.productionStationName === "string") {
      payload.productionStationName = productionUpdate.productionStationName;
    }
    if (typeof productionUpdate.productionStationType === "string") {
      payload.productionStationType = productionUpdate.productionStationType as ProductionStationType;
    }
  }
  await ref.set(payload);
  const item = cartaFamiliaFromFirestoreDoc(restauranteId, id, payload);
  return NextResponse.json({ ok: true, item });
}
