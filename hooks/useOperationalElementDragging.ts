"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";

export type UseOperationalElementDraggingOptions = {
  enabled: boolean;
  onUpdatePosition: (
    instanceId: string,
    position: OperationalElementPosition,
  ) => void;
  onSelectInstance: (instanceId: string) => void;
  onClearSelection: () => void;
};

const DROP_ANIMATION_MS = 130;

export function useOperationalElementDragging({
  enabled,
  onUpdatePosition,
  onSelectInstance,
  onClearSelection,
}: UseOperationalElementDraggingOptions) {
  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(
    null,
  );
  const [dropAnimatingInstanceId, setDropAnimatingInstanceId] = useState<
    string | null
  >(null);

  const draggingInstanceIdRef = useRef<string | null>(null);
  const dropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncDraggingRef = useCallback((instanceId: string | null) => {
    draggingInstanceIdRef.current = instanceId;
    setDraggingInstanceId(instanceId);
  }, []);

  const isDragging = useCallback((): boolean => {
    return draggingInstanceIdRef.current !== null;
  }, []);

  const startDragging = useCallback(
    (instanceId: string) => {
      if (!enabled) return;
      onSelectInstance(instanceId);
      syncDraggingRef(instanceId);
    },
    [enabled, onSelectInstance, syncDraggingRef],
  );

  const updateDragging = useCallback(
    (instanceId: string, position: OperationalElementPosition) => {
      if (!enabled) return;
      if (draggingInstanceIdRef.current !== instanceId) return;
      onUpdatePosition(instanceId, position);
    },
    [enabled, onUpdatePosition],
  );

  const finishDragging = useCallback(() => {
    const finishedId = draggingInstanceIdRef.current;
    syncDraggingRef(null);

    if (!finishedId) return;

    if (dropTimeoutRef.current) {
      clearTimeout(dropTimeoutRef.current);
    }

    setDropAnimatingInstanceId(finishedId);
    dropTimeoutRef.current = setTimeout(() => {
      setDropAnimatingInstanceId(null);
      dropTimeoutRef.current = null;
    }, DROP_ANIMATION_MS);
  }, [syncDraggingRef]);

  const cancelDragging = useCallback(() => {
    syncDraggingRef(null);
    setDropAnimatingInstanceId(null);
    if (dropTimeoutRef.current) {
      clearTimeout(dropTimeoutRef.current);
      dropTimeoutRef.current = null;
    }
  }, [syncDraggingRef]);

  const handleCanvasPointerDown = useCallback(
    (position: OperationalElementPosition, onPlace: () => void) => {
      if (!enabled) return;
      if (isDragging()) return;
      onClearSelection();
      onPlace();
    },
    [enabled, isDragging, onClearSelection],
  );

  useEffect(() => {
    if (!enabled) {
      cancelDragging();
    }
  }, [cancelDragging, enabled]);

  useEffect(() => {
    return () => {
      if (dropTimeoutRef.current) {
        clearTimeout(dropTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!isDragging()) return;
      event.preventDefault();
      cancelDragging();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelDragging, enabled, isDragging]);

  return {
    draggingInstanceId,
    dropAnimatingInstanceId,
    startDragging,
    updateDragging,
    finishDragging,
    cancelDragging,
    isDragging,
    handleCanvasPointerDown,
  };
}
