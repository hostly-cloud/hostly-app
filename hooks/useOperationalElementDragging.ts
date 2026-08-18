"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationalElementPosition } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalMoveSession } from "@/lib/sala-editor/canvas/operational-interaction";
import {
  hasExceededDragSlop,
  type OperationalInstancePointerPayload,
} from "@/lib/sala-editor/canvas/pointer-interaction";

export type OperationalDragSessionOutcome = "complete" | "cancel";

export type UseOperationalElementDraggingOptions = {
  enabled: boolean;
  activePlacementTool: boolean;
  escapeCancellationBlocked?: boolean;
  onUpdatePosition: (
    instanceId: string,
    position: OperationalElementPosition,
  ) => void;
  onSelectInstance: (instanceId: string) => void;
  onClearSelection: () => void;
  onCancelPlacementTool: () => void;
  onDragSessionStart?: () => void;
  onDragSessionEnd?: (outcome: OperationalDragSessionOutcome) => void;
};

export type OperationalEscapeAction =
  | "cancel-drag"
  | "cancel-tool"
  | "clear-selection"
  | null;

export function resolveOperationalEscapeAction(input: {
  activePlacementTool: boolean;
  blocked: boolean;
  defaultPrevented: boolean;
  editableTarget: boolean;
  hasPendingDrag: boolean;
  isDragging: boolean;
}): OperationalEscapeAction {
  if (input.blocked || input.defaultPrevented || input.editableTarget) return null;
  if (input.isDragging || input.hasPendingDrag) return "cancel-drag";
  if (input.activePlacementTool) return "cancel-tool";
  return "clear-selection";
}

export function registerOperationalEscapeListener(
  target: EventTarget,
  listener: (event: KeyboardEvent) => void,
): () => void {
  const eventListener = listener as EventListener;
  target.addEventListener("keydown", eventListener);
  return () => target.removeEventListener("keydown", eventListener);
}

function isEditableEscapeTarget(target: EventTarget | null): boolean {
  const candidate = target as { closest?: (selector: string) => Element | null } | null;
  if (typeof candidate?.closest !== "function") return false;
  return Boolean(
    candidate.closest(
      'input, textarea, select, [contenteditable="true"], [role="dialog"]',
    ),
  );
}

export type OperationalInstancePointerSample = OperationalInstancePointerPayload & {
  canvasPoint: OperationalElementPosition;
};

const DROP_ANIMATION_MS = 130;

export function useOperationalElementDragging({
  enabled,
  activePlacementTool,
  escapeCancellationBlocked = false,
  onUpdatePosition,
  onSelectInstance,
  onClearSelection,
  onCancelPlacementTool,
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
  const pendingDragRef = useRef<OperationalMoveSession | null>(null);
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
    (
      instanceId: string,
      sample: OperationalInstancePointerSample,
      originPosition: OperationalElementPosition,
    ) => {
      if (!enabled) return;
      onSelectInstance(instanceId);
      pendingDragRef.current = {
        objectId: instanceId,
        mode: "move",
        originPointer: sample.canvasPoint,
        originObject: originPosition,
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
      if (!pending || pending.objectId !== instanceId) return;

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
      onUpdatePosition(instanceId, {
        x: pending.originObject.x + sample.canvasPoint.x - pending.originPointer.x,
        y: pending.originObject.y + sample.canvasPoint.y - pending.originPointer.y,
      });
    },
    [enabled, onDragSessionStart, onUpdatePosition, syncDraggingRef],
  );

  const endInstancePointer = useCallback(
    (instanceId: string) => {
      const pending = pendingDragRef.current;

      if (pending?.objectId === instanceId && !pending.active) {
        pendingDragRef.current = null;
        return;
      }

      if (pending?.objectId === instanceId) {
        pendingDragRef.current = null;
      }

      const finishedId = draggingInstanceIdRef.current;
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
      if (pending?.objectId === instanceId) {
        pendingDragRef.current = null;
      }
      if (draggingInstanceIdRef.current === instanceId) {
        if (pending?.active) {
          onUpdatePosition(instanceId, pending.originObject);
        }
        syncDraggingRef(null);
        notifyDragSessionEnd("cancel");
      }
      setDropAnimatingInstanceId(null);
      if (dropTimeoutRef.current) {
        clearTimeout(dropTimeoutRef.current);
        dropTimeoutRef.current = null;
      }
    },
    [notifyDragSessionEnd, onUpdatePosition, syncDraggingRef],
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
    const pending = pendingDragRef.current;
    const hadActiveDrag = draggingInstanceIdRef.current != null;
    if (hadActiveDrag && pending) {
      onUpdatePosition(pending.objectId, pending.originObject);
    }
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
  }, [notifyDragSessionEnd, onUpdatePosition, syncDraggingRef]);

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
      // Disabling the interaction must synchronously discard transient pointer state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      const action = resolveOperationalEscapeAction({
        activePlacementTool,
        blocked: escapeCancellationBlocked,
        defaultPrevented: event.defaultPrevented,
        editableTarget: isEditableEscapeTarget(event.target),
        hasPendingDrag: pendingDragRef.current != null,
        isDragging: isDragging(),
      });
      if (!action) return;
      event.preventDefault();
      if (action === "cancel-drag") {
        cancelDragging();
      } else if (action === "cancel-tool") {
        onCancelPlacementTool();
      } else {
        onClearSelection();
      }
    };

    return registerOperationalEscapeListener(window, onKeyDown);
  }, [
    activePlacementTool,
    cancelDragging,
    enabled,
    escapeCancellationBlocked,
    isDragging,
    onCancelPlacementTool,
    onClearSelection,
  ]);

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
