"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
import {
  hasExceededDragSlop,
  type OperationalInstancePointerPayload,
} from "@/lib/sala-editor/canvas/pointer-interaction";

export type OperationalDragSessionOutcome = "complete" | "cancel";

export type UseOperationalElementDraggingOptions = {
  enabled: boolean;
  onUpdatePosition: (
    instanceId: string,
    position: OperationalElementPosition,
  ) => void;
  onSelectInstance: (instanceId: string) => void;
  onClearSelection: () => void;
  onDragSessionStart?: () => void;
  onDragSessionEnd?: (outcome: OperationalDragSessionOutcome) => void;
};

export type OperationalInstancePointerSample = OperationalInstancePointerPayload & {
  canvasPoint: OperationalElementPosition;
};

type PendingDragSession = {
  instanceId: string;
  startClientX: number;
  startClientY: number;
  pointerType: string;
  active: boolean;
};

const DROP_ANIMATION_MS = 130;

export function useOperationalElementDragging({
  enabled,
  onUpdatePosition,
  onSelectInstance,
  onClearSelection,
  onDragSessionStart,
  onDragSessionEnd,
}: UseOperationalElementDraggingOptions) {
  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(
    null,
  );
  const [dropAnimatingInstanceId, setDropAnimatingInstanceId] = useState<
    string | null
  >(null);

  const draggingInstanceIdRef = useRef<string | null>(null);
  const pendingDragRef = useRef<PendingDragSession | null>(null);
  const dropTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncDraggingRef = useCallback((instanceId: string | null) => {
    draggingInstanceIdRef.current = instanceId;
    setDraggingInstanceId(instanceId);
  }, []);

  const notifyDragSessionEnd = useCallback(
    (outcome: OperationalDragSessionOutcome) => {
      onDragSessionEnd?.(outcome);
    },
    [onDragSessionEnd],
  );

  const isDragging = useCallback((): boolean => {
    return draggingInstanceIdRef.current !== null;
  }, []);

  const beginInstancePointer = useCallback(
    (instanceId: string, sample: OperationalInstancePointerSample) => {
      if (!enabled) return;
      onSelectInstance(instanceId);
      pendingDragRef.current = {
        instanceId,
        startClientX: sample.clientX,
        startClientY: sample.clientY,
        pointerType: sample.pointerType,
        active: false,
      };
    },
    [enabled, onSelectInstance],
  );

  const moveInstancePointer = useCallback(
    (instanceId: string, sample: OperationalInstancePointerSample) => {
      if (!enabled) return;

      const pending = pendingDragRef.current;
      if (!pending || pending.instanceId !== instanceId) return;

      if (!pending.active) {
        if (
          !hasExceededDragSlop(
            pending.startClientX,
            pending.startClientY,
            sample.clientX,
            sample.clientY,
            pending.pointerType,
          )
        ) {
          return;
        }
        pending.active = true;
        syncDraggingRef(instanceId);
        onDragSessionStart?.();
      }

      if (draggingInstanceIdRef.current !== instanceId) return;
      onUpdatePosition(instanceId, sample.canvasPoint);
    },
    [enabled, onDragSessionStart, onUpdatePosition, syncDraggingRef],
  );

  const endInstancePointer = useCallback(
    (instanceId: string) => {
      const pending = pendingDragRef.current;

      if (pending?.instanceId === instanceId && !pending.active) {
        pendingDragRef.current = null;
        return;
      }

      if (pending?.instanceId === instanceId) {
        pendingDragRef.current = null;
      }

      const finishedId = draggingInstanceIdRef.current;
      const hadActiveDrag = finishedId != null;
      syncDraggingRef(null);

      if (!finishedId) return;

      notifyDragSessionEnd("complete");

      if (dropTimeoutRef.current) {
        clearTimeout(dropTimeoutRef.current);
      }

      setDropAnimatingInstanceId(finishedId);
      dropTimeoutRef.current = setTimeout(() => {
        setDropAnimatingInstanceId(null);
        dropTimeoutRef.current = null;
      }, DROP_ANIMATION_MS);
    },
    [notifyDragSessionEnd, syncDraggingRef],
  );

  const cancelInstancePointer = useCallback(
    (instanceId: string) => {
      const pending = pendingDragRef.current;
      if (pending?.instanceId === instanceId) {
        pendingDragRef.current = null;
      }
      if (draggingInstanceIdRef.current === instanceId) {
        syncDraggingRef(null);
        notifyDragSessionEnd("cancel");
      }
      setDropAnimatingInstanceId(null);
      if (dropTimeoutRef.current) {
        clearTimeout(dropTimeoutRef.current);
        dropTimeoutRef.current = null;
      }
    },
    [notifyDragSessionEnd, syncDraggingRef],
  );

  const finishDragging = useCallback(() => {
    const finishedId = draggingInstanceIdRef.current;
    pendingDragRef.current = null;
    syncDraggingRef(null);

    if (!finishedId) return;

    notifyDragSessionEnd("complete");

    if (dropTimeoutRef.current) {
      clearTimeout(dropTimeoutRef.current);
    }

    setDropAnimatingInstanceId(finishedId);
    dropTimeoutRef.current = setTimeout(() => {
      setDropAnimatingInstanceId(null);
      dropTimeoutRef.current = null;
    }, DROP_ANIMATION_MS);
  }, [notifyDragSessionEnd, syncDraggingRef]);

  const cancelDragging = useCallback(() => {
    const hadActiveDrag = draggingInstanceIdRef.current != null;
    pendingDragRef.current = null;
    syncDraggingRef(null);
    if (hadActiveDrag) {
      notifyDragSessionEnd("cancel");
    }
    setDropAnimatingInstanceId(null);
    if (dropTimeoutRef.current) {
      clearTimeout(dropTimeoutRef.current);
      dropTimeoutRef.current = null;
    }
  }, [notifyDragSessionEnd, syncDraggingRef]);

  const handleCanvasPointerDown = useCallback(
    (position: OperationalElementPosition, onPlace: () => void) => {
      if (!enabled) return;
      if (isDragging()) return;
      pendingDragRef.current = null;
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
    beginInstancePointer,
    moveInstancePointer,
    endInstancePointer,
    cancelInstancePointer,
    finishDragging,
    cancelDragging,
    isDragging,
    handleCanvasPointerDown,
  };
};
