import { NextResponse } from "next/server";
import { getHostlyFirestore } from "@/lib/firebase/admin";
import { assertServerRestauranteAllowed } from "@/lib/hostly/restaurant-scope";

type FamilyDoc = {
  restauranteId: string;
  nombre: string;
  activo: boolean;
  modifiersEnabledByDefault: boolean;
  defaultModifierGroupIds: string[];
  createdAt: string;
  updatedAt: string;
};

function badRequest(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function serverError(code: string, details: string | null, status = 500) {
  return NextResponse.json({ ok: false, error: code, details }, { status });
}

function safeErrMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message || err.name;
  try {
    return String(err);
  } catch {
    return "Unknown error";
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
    if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
    try {
      assertServerRestauranteAllowed(restauranteId);
    } catch (e) {
      console.error("[api/modifiers/families][GET] RESTAURANTE_NOT_ALLOWED", { restauranteId, message: safeErrMessage(e) });
      return serverError("RESTAURANTE_NOT_ALLOWED", `restauranteId=${restauranteId}`, 403);
    }

    const db = getHostlyFirestore();
    if (!db) {
      return serverError(
        "FIRESTORE_NOT_CONFIGURED",
        "Missing Firebase Admin credentials or projectId. Set FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS (+ project_id).",
        501,
      );
    }

    const snap = await db.collection("restaurantes").doc(restauranteId).collection("familiasProducto").get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as FamilyDoc) }));
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("[api/modifiers/families][GET] error", {
      message: safeErrMessage(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return serverError("FIRESTORE_READ_FAILED", safeErrMessage(err), 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | (Partial<FamilyDoc> & { restauranteId?: string; id?: string; nombre?: string; activo?: boolean })
      | null;
    if (!body) return badRequest("INVALID_JSON");
    const restauranteId = (body.restauranteId ?? "").trim();
    if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
    console.info("[api/modifiers/families][POST] body", {
      restauranteId,
      nombre: typeof body.nombre === "string" ? body.nombre : null,
      id: typeof body.id === "string" ? body.id : null,
      activo: body.activo,
    });
    try {
      assertServerRestauranteAllowed(restauranteId);
    } catch (e) {
      console.error("[api/modifiers/families][POST] RESTAURANTE_NOT_ALLOWED", { restauranteId, message: safeErrMessage(e) });
      return serverError("RESTAURANTE_NOT_ALLOWED", `restauranteId=${restauranteId}`, 403);
    }

    const nombre = (body.nombre ?? "").trim();
    if (!nombre) return badRequest("MISSING_NOMBRE");

    const db = getHostlyFirestore();
    if (!db) {
      return serverError(
        "FIRESTORE_NOT_CONFIGURED",
        "Missing Firebase Admin credentials or projectId. Set FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS (+ project_id).",
        501,
      );
    }

    const col = db.collection("restaurantes").doc(restauranteId).collection("familiasProducto");
    console.info("[api/modifiers/families][POST] path", `restaurantes/${restauranteId}/familiasProducto`);

    // No permitir duplicado exacto (mismo nombre).
    const dupSnap = await col.where("nombre", "==", nombre).limit(1).get();
    if (!dupSnap.empty) {
      return badRequest("DUPLICATE_NOMBRE", 409);
    }

    const now = new Date().toISOString();
    const id = (body.id ?? "").trim() || db.collection("_").doc().id;
    const ref = col.doc(id);

    const payload: Pick<FamilyDoc, "restauranteId" | "nombre" | "activo" | "createdAt" | "updatedAt"> &
      Partial<Omit<FamilyDoc, "restauranteId" | "nombre" | "activo" | "createdAt" | "updatedAt">> = {
      restauranteId,
      nombre,
      activo: body.activo ?? true,
      createdAt: now,
      updatedAt: now,
      // Se mantienen estos campos por compatibilidad con el MVP previo.
      modifiersEnabledByDefault: body.modifiersEnabledByDefault ?? true,
      defaultModifierGroupIds: Array.isArray(body.defaultModifierGroupIds) ? body.defaultModifierGroupIds.filter(Boolean) : [],
    };

    await ref.set(payload as FamilyDoc, { merge: true });
    return NextResponse.json({ ok: true, item: { id, ...(payload as FamilyDoc) } });
  } catch (err) {
    console.error("[api/modifiers/families][POST] error", {
      message: safeErrMessage(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return serverError("FIRESTORE_WRITE_FAILED", safeErrMessage(err), 500);
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const restauranteId = (url.searchParams.get("restauranteId") ?? "").trim();
    const id = (url.searchParams.get("id") ?? "").trim();
    if (!restauranteId) return badRequest("MISSING_RESTAURANTE_ID");
    if (!id) return badRequest("MISSING_ID");
    try {
      assertServerRestauranteAllowed(restauranteId);
    } catch (e) {
      console.error("[api/modifiers/families][DELETE] RESTAURANTE_NOT_ALLOWED", { restauranteId, message: safeErrMessage(e) });
      return serverError("RESTAURANTE_NOT_ALLOWED", `restauranteId=${restauranteId}`, 403);
    }

    const db = getHostlyFirestore();
    if (!db) {
      return serverError(
        "FIRESTORE_NOT_CONFIGURED",
        "Missing Firebase Admin credentials or projectId. Set FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY or GOOGLE_APPLICATION_CREDENTIALS (+ project_id).",
        501,
      );
    }

    await db.collection("restaurantes").doc(restauranteId).collection("familiasProducto").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/modifiers/families][DELETE] error", {
      message: safeErrMessage(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return serverError("FIRESTORE_DELETE_FAILED", safeErrMessage(err), 500);
  }
}

