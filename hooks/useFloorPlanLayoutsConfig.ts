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
  const [config, setConfig] = useState<FloorPlanLayoutsConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    if (!rid) {
      setConfig(EMPTY_CONFIG);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = listenFloorPlanLayoutsConfig(
      rid,
      (next) => {
        setConfig(next);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );

    return () => {
      unsub();
    };
  }, [restaurantId]);

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
