import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export const FLOOR_PLAN_LAYOUTS_CONFIG_DOC_ID = "floorPlanLayouts" as const;

export type ActiveFloorPlanLayoutEntry = {
  snapshotId: string | null;
  snapshotName: string;
  activatedAt: number;
  activatedBy?: string;
};

export type FloorPlanLayoutsConfig = {
  activeByFloorPlan: Record<string, ActiveFloorPlanLayoutEntry>;
  updatedAt: number;
};

function parseActiveFloorPlanLayoutEntry(
  raw: unknown,
): ActiveFloorPlanLayoutEntry | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;

  const data = raw as Record<string, unknown>;
  const snapshotIdRaw = data.snapshotId;
  const snapshotId =
    snapshotIdRaw === null
      ? null
      : typeof snapshotIdRaw === "string" && snapshotIdRaw.trim() !== ""
        ? snapshotIdRaw.trim()
        : null;
  const snapshotName =
    typeof data.snapshotName === "string" ? data.snapshotName.trim() : "";
  const activatedAt =
    typeof data.activatedAt === "number" && Number.isFinite(data.activatedAt)
      ? data.activatedAt
      : 0;
  const activatedBy =
    typeof data.activatedBy === "string" && data.activatedBy.trim() !== ""
      ? data.activatedBy.trim()
      : undefined;

  if (!snapshotName && snapshotId === null) return null;

  return {
    snapshotId,
    snapshotName: snapshotName || "Sin preset",
    activatedAt,
    ...(activatedBy !== undefined ? { activatedBy } : {}),
  };
}

function parseFloorPlanLayoutsConfig(
  data: Record<string, unknown> | undefined,
): FloorPlanLayoutsConfig {
  const activeByFloorPlan: Record<string, ActiveFloorPlanLayoutEntry> = {};
  const rawMap = data?.activeByFloorPlan;

  if (rawMap != null && typeof rawMap === "object" && !Array.isArray(rawMap)) {
    for (const [key, value] of Object.entries(rawMap as Record<string, unknown>)) {
      const floorPlanId = key.trim();
      if (!floorPlanId) continue;
      const entry = parseActiveFloorPlanLayoutEntry(value);
      if (entry) activeByFloorPlan[floorPlanId] = entry;
    }
  }

  const updatedAt =
    typeof data?.updatedAt === "number" && Number.isFinite(data.updatedAt)
      ? data.updatedAt
      : 0;

  return { activeByFloorPlan, updatedAt };
}

/**
 * Adaptador temporal de solo lectura para el badge histórico de layout del TPV.
 *
 * Editor V2 es la fuente de verdad del plano. Este módulo ya no guarda, duplica,
 * archiva, activa ni restaura layouts sobre floorPlans/tables/zones.
 */
export function listenFloorPlanLayoutsConfig(
  restaurantId: string,
  callback: (config: FloorPlanLayoutsConfig) => void,
  onError?: (error: Error) => void,
): () => void {
  const rid = restaurantId.trim();
  if (!rid) return () => {};

  return onSnapshot(
    doc(db, "restaurants", rid, "config", FLOOR_PLAN_LAYOUTS_CONFIG_DOC_ID),
    (snap) => {
      if (!snap.exists()) {
        callback({ activeByFloorPlan: {}, updatedAt: 0 });
        return;
      }
      callback(parseFloorPlanLayoutsConfig(snap.data() as Record<string, unknown>));
    },
    (error) => {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    },
  );
}
