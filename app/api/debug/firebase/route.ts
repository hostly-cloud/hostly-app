import { NextResponse } from "next/server";
import { getFirestoreAdminStatus } from "@/lib/firebase/admin";
import { isAuthErrorResponse } from "@/lib/server/auth/require-authenticated-restaurant";
import { requireLegacyRestaurantApi } from "@/lib/server/auth/require-legacy-restaurant-api";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const authContext = await requireLegacyRestaurantApi(
    req,
    "settings.manage",
  );
  if (isAuthErrorResponse(authContext)) return authContext;

  const status = getFirestoreAdminStatus();
  try {
    const db = authContext.db;

    // Ping real: lectura de un doc que no existe (no requiere que existan colecciones).
    const snap = await db.collection("_debug").doc("ping").get();
    return NextResponse.json({
      ok: true,
      status,
      ping: { exists: snap.exists },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: "FIRESTORE_CONNECTION_FAILED",
        details: message,
        status,
      },
      { status: 500 },
    );
  }
}
