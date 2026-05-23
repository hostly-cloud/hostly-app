"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FloorPlanSnapshotFloorPlan } from "@/lib/firestore/floor-plan-snapshots";
import type { FloorPlanSnapshotSummary } from "@/lib/firestore/floor-plan-snapshots";
import {
  applyFloorPlanLayout,
  archiveLayoutPreset,
  assertFloorPlanLayoutCanActivate,
  duplicateLayoutPreset,
  floorPlanHasActiveTableService,
  FLOOR_PLAN_LAYOUT_ACTIVATE_PRECHECK_HINT,
  listenFloorPlanLayoutPresets,
  listenFloorPlanLayoutsConfig,
  resolveSnapshotFloorPlanId,
  saveLayoutPreset,
  type ActiveFloorPlanLayoutEntry,
} from "@/lib/firestore/floor-plan-layouts";
import {
  FLOOR_PLAN_SNAPSHOT_SCHEMA_VERSION,
  getFloorPlanSnapshot,
  snapshotToSummary,
} from "@/lib/firestore/floor-plan-snapshots";

export type FloorPlanLayoutFeedback = {
  type: "success" | "error" | "info";
  message: string;
};

export type UseFloorPlanLayoutsOptions = {
  restaurantId: string | null;
  selectedFloorPlanId: string | null;
  /** Estado embebido del plano seleccionado (plan + elements + zones visibles). */
  buildCurrentFloorPlanSnapshot: () => FloorPlanSnapshotFloorPlan | null;
  createdBy?: string;
  /** Tras activar/restaurar: recargar editor desde Firestore. */
  onAfterActivate?: () => void | Promise<void>;
};

export type FloorPlanLayoutBusyAction =
  | "save"
  | "activate"
  | "duplicate"
  | "archive"
  | null;

export type FloorPlanLayoutActivatePrecheck = {
  /** Preset para el que se calculó el precheck (si aplica). */
  snapshotId: string | null;
  loading: boolean;
  /** `null` = sin dato / error de precheck (no bloquea visualmente). */
  blocked: boolean | null;
};

function mergePresetIntoList(
  prev: FloorPlanSnapshotSummary[],
  snapshot: FloorPlanSnapshotSummary,
  floorPlanId: string,
): FloorPlanSnapshotSummary[] {
  const pid = floorPlanId.trim();
  const snapPlanId =
    typeof snapshot.floorPlanId === "string" && snapshot.floorPlanId.trim() !== ""
      ? snapshot.floorPlanId.trim()
      : "";
  if (snapPlanId !== pid) return prev;
  if (snapshot.isArchived === true || snapshot.kind === "backup") {
    return prev.filter((item) => item.id !== snapshot.id);
  }
  const without = prev.filter((item) => item.id !== snapshot.id);
  return [...without, snapshot].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function useFloorPlanLayouts(options: UseFloorPlanLayoutsOptions) {
  const {
    restaurantId,
    selectedFloorPlanId,
    buildCurrentFloorPlanSnapshot,
    createdBy,
    onAfterActivate,
  } = options;

  const [presets, setPresets] = useState<FloorPlanSnapshotSummary[]>([]);
  const [activeByFloorPlan, setActiveByFloorPlan] = useState<
    Record<string, ActiveFloorPlanLayoutEntry>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<FloorPlanLayoutBusyAction>(null);
  const [feedback, setFeedback] = useState<FloorPlanLayoutFeedback | null>(null);
  const [activatePrecheck, setActivatePrecheck] =
    useState<FloorPlanLayoutActivatePrecheck>({
      snapshotId: null,
      loading: false,
      blocked: null,
    });

  const precheckRequestIdRef = useRef(0);
  const precheckCacheRef = useRef<Map<string, boolean>>(new Map());

  const buildRef = useRef(buildCurrentFloorPlanSnapshot);
  const onAfterActivateRef = useRef(onAfterActivate);
  useEffect(() => {
    buildRef.current = buildCurrentFloorPlanSnapshot;
  }, [buildCurrentFloorPlanSnapshot]);
  useEffect(() => {
    onAfterActivateRef.current = onAfterActivate;
  }, [onAfterActivate]);

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(t);
  }, [feedback]);

  useEffect(() => {
    const rid = restaurantId?.trim() ?? "";
    const planId = selectedFloorPlanId?.trim() ?? "";
    if (!rid || !planId) {
      setPresets([]);
      setActiveByFloorPlan({});
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    let presetsReady = false;
    let configReady = false;

    const maybeDone = () => {
      if (presetsReady && configReady) setLoading(false);
    };

    const unsubPresets = listenFloorPlanLayoutPresets(
      rid,
      planId,
      (list) => {
        setPresets(list);
        presetsReady = true;
        maybeDone();
      },
      (err) => {
        setError(err.message);
        presetsReady = true;
        maybeDone();
      },
    );

    const unsubConfig = listenFloorPlanLayoutsConfig(
      rid,
      (config) => {
        setActiveByFloorPlan(config.activeByFloorPlan);
        configReady = true;
        maybeDone();
      },
      (err) => {
        console.warn("[useFloorPlanLayouts] config listener", err);
        configReady = true;
        maybeDone();
      },
    );

    return () => {
      unsubPresets();
      unsubConfig();
    };
  }, [restaurantId, selectedFloorPlanId]);

  useEffect(() => {
    precheckCacheRef.current.clear();
    precheckRequestIdRef.current += 1;
    setActivatePrecheck({
      snapshotId: null,
      loading: false,
      blocked: null,
    });
  }, [restaurantId, selectedFloorPlanId]);

  const runActivatePrecheck = useCallback(
    (snapshotId: string, options?: { skipCache?: boolean }) => {
      const rid = restaurantId?.trim() ?? "";
      const sid = String(snapshotId ?? "").trim();
      const planId = selectedFloorPlanId?.trim() ?? "";

      if (!sid) {
        precheckRequestIdRef.current += 1;
        setActivatePrecheck({
          snapshotId: null,
          loading: false,
          blocked: null,
        });
        return;
      }

      if (!rid || !planId) {
        setActivatePrecheck({
          snapshotId: sid,
          loading: false,
          blocked: null,
        });
        return;
      }

      const cacheKey = `${rid}:${planId}`;
      if (options?.skipCache) {
        precheckCacheRef.current.delete(cacheKey);
      } else {
        const cached = precheckCacheRef.current.get(cacheKey);
        if (cached !== undefined) {
          setActivatePrecheck({
            snapshotId: sid,
            loading: false,
            blocked: cached,
          });
          return;
        }
      }

      const requestId = ++precheckRequestIdRef.current;
      setActivatePrecheck({
        snapshotId: sid,
        loading: true,
        blocked: null,
      });

      void (async () => {
        try {
          const blocked = await floorPlanHasActiveTableService(rid, planId);
          if (requestId !== precheckRequestIdRef.current) return;
          precheckCacheRef.current.set(cacheKey, blocked);
          setActivatePrecheck({
            snapshotId: sid,
            loading: false,
            blocked,
          });
        } catch {
          if (requestId !== precheckRequestIdRef.current) return;
          setActivatePrecheck({
            snapshotId: sid,
            loading: false,
            blocked: null,
          });
        }
      })();
    },
    [restaurantId, selectedFloorPlanId],
  );

  const refreshActivatePrecheck = useCallback(
    (snapshotId: string) => {
      runActivatePrecheck(snapshotId, { skipCache: true });
    },
    [runActivatePrecheck],
  );

  const activeLayout = useMemo(() => {
    const planId = selectedFloorPlanId?.trim() ?? "";
    if (!planId) return null;
    return activeByFloorPlan[planId] ?? null;
  }, [activeByFloorPlan, selectedFloorPlanId]);

  const savePreset = useCallback(
    async (name: string, description?: string) => {
      const rid = restaurantId?.trim() ?? "";
      const planId = selectedFloorPlanId?.trim() ?? "";
      const trimmedName = String(name ?? "").trim();
      if (!rid) throw new Error("Restaurante no disponible");
      if (!planId) throw new Error("Selecciona un plano");
      if (!trimmedName) throw new Error("El nombre es obligatorio");

      const floorPlan = buildRef.current();
      if (!floorPlan) throw new Error("No hay plano para guardar");
      if (floorPlan.elements.length === 0) {
        throw new Error("Añade al menos un elemento al plano antes de guardar");
      }

      setBusyAction("save");
      setError(null);
      try {
        const snapshotId = await saveLayoutPreset(rid, {
          name: trimmedName,
          description,
          createdBy,
          floorPlan,
          kind: "preset",
        });
        let saved: Awaited<ReturnType<typeof getFloorPlanSnapshot>> = null;
        try {
          saved = await getFloorPlanSnapshot(rid, snapshotId);
        } catch {
          saved = null;
        }
        const summary = saved
          ? snapshotToSummary(saved)
          : ({
              id: snapshotId,
              restaurantId: rid,
              name: trimmedName,
              ...(description?.trim()
                ? { description: description.trim() }
                : {}),
              createdAt: Date.now(),
              updatedAt: Date.now(),
              ...(createdBy ? { createdBy } : {}),
              source: "manual" as const,
              schemaVersion: FLOOR_PLAN_SNAPSHOT_SCHEMA_VERSION,
              floorPlanId: planId,
              kind: "preset" as const,
              isArchived: false,
              elementCount: floorPlan.elements.length,
            } satisfies FloorPlanSnapshotSummary);
        setPresets((prev) => mergePresetIntoList(prev, summary, planId));
        setFeedback({
          type: "success",
          message: `Layout «${trimmedName}» guardado`,
        });
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message.includes("permission-denied")
              ? "No se pudo guardar el layout. Comprueba permisos Firestore (floorPlanSnapshots)."
              : e.message
            : String(e);
        setError(message);
        setFeedback({ type: "error", message });
        throw e;
      } finally {
        setBusyAction(null);
      }
    },
    [restaurantId, selectedFloorPlanId, createdBy],
  );

  const duplicatePreset = useCallback(
    async (snapshotId: string) => {
      const rid = restaurantId?.trim() ?? "";
      const sid = String(snapshotId ?? "").trim();
      if (!rid || !sid) throw new Error("Preset no válido");

      setBusyAction("duplicate");
      setError(null);
      try {
        await duplicateLayoutPreset(rid, {
          sourceSnapshotId: sid,
          createdBy,
        });
        setFeedback({ type: "success", message: "Layout duplicado" });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setFeedback({ type: "error", message });
        throw e;
      } finally {
        setBusyAction(null);
      }
    },
    [restaurantId, createdBy],
  );

  const archivePreset = useCallback(
    async (snapshotId: string) => {
      const rid = restaurantId?.trim() ?? "";
      const sid = String(snapshotId ?? "").trim();
      if (!rid || !sid) throw new Error("Preset no válido");

      setBusyAction("archive");
      setError(null);
      try {
        await archiveLayoutPreset(rid, sid);
        setFeedback({ type: "success", message: "Layout archivado" });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setFeedback({ type: "error", message });
        throw e;
      } finally {
        setBusyAction(null);
      }
    },
    [restaurantId],
  );

  const activatePreset = useCallback(
    async (snapshotId: string) => {
      const rid = restaurantId?.trim() ?? "";
      const sid = String(snapshotId ?? "").trim();
      if (!rid || !sid) throw new Error("Preset no válido");

      setBusyAction("activate");
      setError(null);
      try {
        const snapshot = await getFloorPlanSnapshot(rid, sid);
        if (!snapshot) {
          throw new Error("Preset no encontrado");
        }
        const floorPlanId = resolveSnapshotFloorPlanId(snapshot);
        await assertFloorPlanLayoutCanActivate(rid, floorPlanId);

        await applyFloorPlanLayout({
          restaurantId: rid,
          snapshotId: sid,
          activatedBy: createdBy,
          createBackupBefore: true,
        });
        await onAfterActivateRef.current?.();
        setFeedback({ type: "success", message: "Layout activado en el plano" });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setFeedback({ type: "error", message });
        throw e;
      } finally {
        setBusyAction(null);
      }
    },
    [restaurantId, createdBy],
  );

  return {
    presets,
    activeLayout,
    loading,
    error,
    busyAction,
    feedback,
    activatePrecheck,
    activatePrecheckHint: FLOOR_PLAN_LAYOUT_ACTIVATE_PRECHECK_HINT,
    runActivatePrecheck,
    refreshActivatePrecheck,
    savePreset,
    duplicatePreset,
    archivePreset,
    activatePreset,
  };
}
