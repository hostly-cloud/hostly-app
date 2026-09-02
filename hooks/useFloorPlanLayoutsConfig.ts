"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listenFloorPlanLayoutsConfig,
  type ActiveFloorPlanLayoutEntry,
  type FloorPlanLayoutsConfig,
} from "@/lib/firestore/floor-plan-layouts";

const EMPTY_CONFIG: FloorPlanLayoutsConfig = {
  activeByFloorPlan: {},
  updatedAt: 0,
};

/**
 * Un listener por restaurante sobre `config/floorPlanLayouts`.
 * Deriva el layout activo por plano en cliente (sin listener por plano).
 */
export function useFloorPlanLayoutsConfig(restaurantId: string | null) {
  const [snapshot, setSnapshot] = useState<{
    restaurantId: string;
    config: FloorPlanLayoutsConfig;
    error: string | null;
  } | null>(null);
  const rid = restaurantId?.trim() ?? "";
  const currentSnapshot = snapshot?.restaurantId === rid ? snapshot : null;
  const config = rid ? (currentSnapshot?.config ?? EMPTY_CONFIG) : EMPTY_CONFIG;
  const loading = Boolean(rid && !currentSnapshot);
  const error = rid ? (currentSnapshot?.error ?? null) : null;

  useEffect(() => {
    if (!rid) return;

    const unsub = listenFloorPlanLayoutsConfig(
      rid,
      (next) => {
        setSnapshot({ restaurantId: rid, config: next, error: null });
      },
      (err) => {
        setSnapshot({ restaurantId: rid, config: EMPTY_CONFIG, error: err.message });
      },
    );

    return () => {
      unsub();
    };
  }, [rid]);

  const getActiveLayoutForPlan = useMemo(() => {
    return (floorPlanId: string | null | undefined): ActiveFloorPlanLayoutEntry | null => {
      const pid = floorPlanId?.trim() ?? "";
      if (!pid) return null;
      return config.activeByFloorPlan[pid] ?? null;
    };
  }, [config.activeByFloorPlan]);

  return {
    activeByFloorPlan: config.activeByFloorPlan,
    loading,
    error,
    getActiveLayoutForPlan,
  };
}

/** Etiqueta TPV: «Layout: …» o «Sin layout activo». */
export function formatTpvActiveLayoutLabel(
  entry: ActiveFloorPlanLayoutEntry | null | undefined,
): string {
  const snapshotId =
    typeof entry?.snapshotId === "string" ? entry.snapshotId.trim() : "";
  const snapshotName =
    typeof entry?.snapshotName === "string" ? entry.snapshotName.trim() : "";
  if (!snapshotId || !snapshotName) {
    return "Sin layout activo";
  }
  return `Layout: ${snapshotName}`;
}
