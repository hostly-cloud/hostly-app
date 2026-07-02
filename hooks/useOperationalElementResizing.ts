"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
import {
  computeResizedOperationalInstanceLayout,
  type OperationalInstanceCanvasSize,
  type OperationalInstanceResizeCorner,
} from "@/lib/sala-editor/canvas/operational-instance-layout";

export type OperationalResizeSessionOutcome = "complete" | "cancel";

export type UseOperationalElementResizingOptions = {
  enabled: boolean;
  onResize: (
    instanceId: string,
    patch: {
      size: OperationalInstanceCanvasSize;
      position: OperationalElementPosition;
    },
  ) => void;
  onSelectInstance: (instanceId: string) => void;
  onResizeSessionEnd?: (outcome: OperationalResizeSessionOutcome) => void;
};

type ResizeSession = {
  instanceId: string;
  corner: OperationalInstanceResizeCorner;
  startClientX: number;
  startClientY: number;
  originSize: OperationalInstanceCanvasSize;
  originPosition: OperationalElementPosition;
};

export function useOperationalElementResizing({
  enabled,
  onResize,
  onSelectInstance,
  onResizeSessionEnd,
}: UseOperationalElementResizingOptions) {
  const [resizingInstanceId, setResizingInstanceId] = useState<string | null>(null);
  const sessionRef = useRef<ResizeSession | null>(null);

  const syncResizing = useCallback((instanceId: string | null) => {
    setResizingInstanceId(instanceId);
  }, []);

  const isResizing = useCallback((): boolean => {
    return sessionRef.current !== null;
  }, []);

  const startResize = useCallback(
    (
      instanceId: string,
      corner: OperationalInstanceResizeCorner,
      clientX: number,
      clientY: number,
      originSize: OperationalInstanceCanvasSize,
      originPosition: OperationalElementPosition,
    ) => {
      if (!enabled) return;
      onSelectInstance(instanceId);
      sessionRef.current = {
        instanceId,
        corner,
        startClientX: clientX,
        startClientY: clientY,
        originSize,
        originPosition,
      };
      syncResizing(instanceId);
    },
    [enabled, onSelectInstance, syncResizing],
  );

  const updateResize = useCallback(
    (clientX: number, clientY: number) => {
      const session = sessionRef.current;
      if (!session || !enabled) return;

      const layout = computeResizedOperationalInstanceLayout({
        corner: session.corner,
        originSize: session.originSize,
        originPosition: session.originPosition,
        pointerDelta: {
          x: clientX - session.startClientX,
          y: clientY - session.startClientY,
        },
      });

      onResize(session.instanceId, layout);
    },
    [enabled, onResize],
  );

  const finishResize = useCallback(() => {
    const hadSession = sessionRef.current != null;
    sessionRef.current = null;
    syncResizing(null);
    if (hadSession) {
      onResizeSessionEnd?.("complete");
    }
  }, [onResizeSessionEnd, syncResizing]);

  const cancelResize = useCallback(() => {
    const hadSession = sessionRef.current != null;
    sessionRef.current = null;
    syncResizing(null);
    if (hadSession) {
      onResizeSessionEnd?.("cancel");
    }
  }, [onResizeSessionEnd, syncResizing]);

  useEffect(() => {
    if (!enabled) cancelResize();
  }, [cancelResize, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!isResizing()) return;
      event.preventDefault();
      cancelResize();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelResize, enabled, isResizing]);

  return {
    resizingInstanceId,
    startResize,
    updateResize,
    finishResize,
    cancelResize,
    isResizing,
  };
}
