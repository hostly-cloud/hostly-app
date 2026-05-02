import { NextResponse } from "next/server";
import { getFirestoreAdminStatus, getHostlyFirestore } from "@/lib/firebase/admin";

export async function GET() {
  const status = getFirestoreAdminStatus();
  try {
    const db = getHostlyFirestore();
    if (!db) {
      return NextResponse.json(
        {
          ok: false,
          error: "FIRESTORE_NOT_CONFIGURED",
          status,
        },
        { status: 501 },
      );
    }

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

