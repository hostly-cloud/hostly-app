import {
  doc,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { buildProductStationPatchFromOperationStation } from "@/lib/operacion/product-operation-station";
import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import type { ProductOperationStationMigrationPlanItem } from "@/lib/productos/product-operation-station-migration";

export type ApplyProductOperationStationMigrationResult = {
  updated: number;
  skipped: number;
};

function requireAuthUid(): string {
  const uid = auth.currentUser?.uid?.trim();
  if (!uid) throw new Error("UNAUTHORIZED: inicia sesión para corregir routing");
  return uid;
}

/**
 * Aplica únicamente filas `suggested` de un plan ya revisado.
 * Revalida que la estación objetivo exista y siga activa en el momento de escritura.
 */
export async function applyProductOperationStationMigration(
  restaurantId: string,
  plan: readonly ProductOperationStationMigrationPlanItem[],
  operationStations: readonly OperationStationDocument[],
): Promise<ApplyProductOperationStationMigrationResult> {
  const rid = restaurantId.trim();
  if (!rid) throw new Error("MISSING_RESTAURANT_ID");
  const userId = requireAuthUid();
  const stationById = new Map(
    operationStations.filter((station) => station.active).map((station) => [station.id, station]),
  );

  const rows = plan.filter((item) => item.status === "suggested");
  if (rows.length === 0) return { updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;
  const now = Date.now();
  const BATCH_SIZE = 350;

  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const chunk = rows.slice(offset, offset + BATCH_SIZE);
    const batch = writeBatch(db);
    let chunkUpdates = 0;

    for (const item of chunk) {
      const productId = item.productId.trim();
      const targetId = item.suggestedOperationStationId?.trim() ?? "";
      if (!productId || !targetId) {
        skipped += 1;
        continue;
      }

      const station = stationById.get(targetId);
      if (!station) {
        skipped += 1;
        continue;
      }

      const patch = buildProductStationPatchFromOperationStation(station);
      if (!patch.operationStationId || patch.clearOperationStation) {
        skipped += 1;
        continue;
      }

      batch.update(
        doc(db, "restaurants", rid, "products", productId),
        {
          operationStationId: patch.operationStationId,
          operationStationName: patch.operationStationName ?? station.name,
          station: patch.station,
          preparationArea: patch.preparationArea,
          updatedAt: now,
          updatedBy: userId,
        } as DocumentData,
      );
      chunkUpdates += 1;
    }

    if (chunkUpdates > 0) {
      await batch.commit();
      updated += chunkUpdates;
    }
  }

  return { updated, skipped };
}
