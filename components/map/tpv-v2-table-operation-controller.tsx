"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import { getJoinTargetFromPoint } from "@/lib/map/join-hit-test";
import {
  HOSTLY_MAP_JOIN_ABORTED,
  HOSTLY_MAP_JOIN_ARMED,
} from "@/lib/map/join-pinch-bridge";
import { registerTpvV2TableController } from "@/lib/tpv/v2-table-controller-registry";

const HOSTLY_MAP_JOIN_DRAG_HOVER = "hostly-map-join-drag-hover";
const HOSTLY_MAP_JOIN_DRAG_END = "hostly-map-join-drag-end";
const MAP_JOIN_ARM_MS = 420;
const MAP_JOIN_ARM_CANCEL_PX_SQ = 14 * 14;
const MAP_JOIN_DRAG_START_PX_SQ = 8 * 8;
const LONG_PRESS_GROUP_MS = 1000;
const LONG_PRESS_MOVE_PX_SQ = 64;

type JoinState = {
  pointerId: number;
  originX: number;
  originY: number;
  mode: "arming" | "armed" | "dragging";
};

type Point = { x: number; y: number };

export type TpvV2TableOperationControllerProps = {
  tableId: string;
  tableLabel: string;
  onOpenTable: (tableId: string) => void;
  joinEnabled?: boolean;
  onJoinDrop?: (draggedTableId: string, targetTableId: string) => void;
  joinClusterMainId?: string;
  previewWidth: number;
  previewHeight: number;
  groupedPrimary?: boolean;
  onSeparateGroup?: (mainTableId: string) => void;
};

export function TpvV2TableOperationController({
  tableId,
  tableLabel,
  onOpenTable,
  joinEnabled = false,
  onJoinDrop,
  joinClusterMainId,
  previewWidth,
  previewHeight,
  groupedPrimary = false,
  onSeparateGroup,
}: TpvV2TableOperationControllerProps) {
  const separateMenuRef = useRef<HTMLDivElement | null>(null);
  const joinStateRef = useRef<JoinState | null>(null);
  const joinArmTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<Point | null>(null);
  const lastPointerRef = useRef<Point | null>(null);
  const suppressClickRef = useRef(false);
  const [joinPreview, setJoinPreview] = useState<Point | null>(null);
  const [separateMenu, setSeparateMenu] = useState<Point | null>(null);

  const clearJoinArmTimer = useCallback(() => {
    if (joinArmTimerRef.current != null) {
      window.clearTimeout(joinArmTimerRef.current);
      joinArmTimerRef.current = null;
    }
  }, []);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const emitJoinDragEnd = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent(HOSTLY_MAP_JOIN_DRAG_END, { bubbles: true }),
    );
  }, []);

  useEffect(() => {
    return () => {
      clearJoinArmTimer();
      clearLongPressTimer();
      joinStateRef.current = null;
      longPressStartRef.current = null;
      lastPointerRef.current = null;
      emitJoinDragEnd();
    };
  }, [clearJoinArmTimer, clearLongPressTimer, emitJoinDragEnd]);

  useEffect(() => {
    if (!separateMenu) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && separateMenuRef.current?.contains(target)) {
        return;
      }
      setSeparateMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSeparateMenu(null);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [separateMenu]);

  const emitJoinAborted = useCallback(
    (pointerId: number, x: number, y: number) => {
      document.dispatchEvent(
        new CustomEvent(HOSTLY_MAP_JOIN_ABORTED, {
          bubbles: true,
          detail: { pointerId, clientX: x, clientY: y },
        }),
      );
    },
    [],
  );

  const emitJoinArmed = useCallback((pointerId: number) => {
    document.dispatchEvent(
      new CustomEvent(HOSTLY_MAP_JOIN_ARMED, {
        bubbles: true,
        detail: { pointerId },
      }),
    );
  }, []);

  const beginLongPress = useCallback(
    (x: number, y: number) => {
      clearLongPressTimer();
      if (!groupedPrimary || !onSeparateGroup) return;
      longPressStartRef.current = { x, y };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        longPressStartRef.current = null;
        suppressClickRef.current = true;
        setSeparateMenu({ x, y });
      }, LONG_PRESS_GROUP_MS);
    }, [clearLongPressTimer, groupedPrimary, onSeparateGroup],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent) => {
      if (event.button !== 0) return;
      setSeparateMenu(null);
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      beginLongPress(event.clientX, event.clientY);

      if (!joinEnabled || !onJoinDrop) {
        joinStateRef.current = null;
        return;
      }

      clearJoinArmTimer();
      const touchLike = event.pointerType === "touch" || event.pointerType === "pen";
      joinStateRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originY: event.clientY,
        mode: touchLike ? "arming" : "armed",
      };

      if (!touchLike) {
        emitJoinArmed(event.pointerId);
        return;
      }

      const pointerId = event.pointerId;
      joinArmTimerRef.current = window.setTimeout(() => {
        joinArmTimerRef.current = null;
        const state = joinStateRef.current;
        if (!state || state.pointerId !== pointerId || state.mode !== "arming") return;
        state.mode = "armed";
        emitJoinArmed(pointerId);
      }, MAP_JOIN_ARM_MS);
    }, [
      beginLongPress,
      clearJoinArmTimer,
      emitJoinArmed,
      joinEnabled,
      onJoinDrop,
    ],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };

      const longPressStart = longPressStartRef.current;
      if (longPressStart && longPressTimerRef.current != null) {
        const dx = event.clientX - longPressStart.x;
        const dy = event.clientY - longPressStart.y;
        if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX_SQ) {
          clearLongPressTimer();
          longPressStartRef.current = null;
        }
      }

      const state = joinStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const dx = event.clientX - state.originX;
      const dy = event.clientY - state.originY;
      const distanceSq = dx * dx + dy * dy;

      if (state.mode === "arming") {
        if (distanceSq > MAP_JOIN_ARM_CANCEL_PX_SQ) {
          clearJoinArmTimer();
          joinStateRef.current = null;
          emitJoinAborted(event.pointerId, event.clientX, event.clientY);
        }
        return;
      }

      if (state.mode === "armed") {
        if (distanceSq <= MAP_JOIN_DRAG_START_PX_SQ) return;
        state.mode = "dragging";
        clearLongPressTimer();
        longPressStartRef.current = null;
      }

      if (state.mode !== "dragging" || !joinEnabled || !onJoinDrop) return;

      if (event.cancelable) event.preventDefault();
      setJoinPreview({ x: event.clientX, y: event.clientY });

      const hoverTableId = getJoinTargetFromPoint(
        event.clientX,
        event.clientY,
        tableId,
        null,
      );
      document.dispatchEvent(
        new CustomEvent(HOSTLY_MAP_JOIN_DRAG_HOVER, {
          bubbles: true,
          detail: {
            hoverTableId,
            draggedTableId: tableId,
            draggedClusterMain: String(joinClusterMainId ?? tableId).trim(),
          },
        }),
      );
    }, [
      clearJoinArmTimer,
      clearLongPressTimer,
      emitJoinAborted,
      joinClusterMainId,
      joinEnabled,
      onJoinDrop,
      tableId,
    ],
  );

  const finishPointer = useCallback(
    (event: PointerEvent, cancelled: boolean) => {
      clearJoinArmTimer();
      clearLongPressTimer();
      longPressStartRef.current = null;

      const state = joinStateRef.current;
      joinStateRef.current = null;
      setJoinPreview(null);
      emitJoinDragEnd();

      if (!state || state.pointerId !== event.pointerId) {
        lastPointerRef.current = null;
        return;
      }

      if (cancelled) {
        lastPointerRef.current = null;
        return;
      }

      if (state.mode === "dragging") {
        suppressClickRef.current = true;
        const last = lastPointerRef.current;
        const x = last?.x ?? event.clientX;
        const y = last?.y ?? event.clientY;
        const targetId = getJoinTargetFromPoint(x, y, tableId, null);
        if (targetId) onJoinDrop?.(tableId, targetId);
      }
      lastPointerRef.current = null;
    }, [
      clearJoinArmTimer,
      clearLongPressTimer,
      emitJoinDragEnd,
      onJoinDrop,
      tableId,
    ],
  );

  const onClick = useCallback(() => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpenTable(tableId);
  }, [onOpenTable, tableId]);

  useEffect(() => {
    return registerTpvV2TableController(tableId, {
      joinEnabled: joinEnabled && onJoinDrop != null,
      onPointerDown,
      onPointerMove,
      onPointerUp: (event) => finishPointer(event, false),
      onPointerCancel: (event) => finishPointer(event, true),
      onClick,
    });
  }, [
    finishPointer,
    joinEnabled,
    onClick,
    onJoinDrop,
    onPointerDown,
    onPointerMove,
    tableId,
  ]);

  const preview =
    joinPreview && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-hidden
            data-hostly-map-join-preview="1"
            style={{
              position: "fixed",
              left: joinPreview.x,
              top: joinPreview.y,
              width: Math.max(42, Math.min(previewWidth, 120)),
              height: Math.max(42, Math.min(previewHeight, 90)),
              transform: "translate(-50%, -50%)",
              borderRadius: 12,
              border: "1px solid rgba(49, 95, 125, 0.28)",
              background: "rgba(255,255,255,0.94)",
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 8,
              fontSize: 12,
              fontWeight: 750,
              color: "#25495a",
              pointerEvents: "none",
              zIndex: 10100,
            }}
          >
            {tableLabel || tableId}
          </div>,
          document.body,
        )
      : null;

  const separateMenuPortal =
    separateMenu && typeof document !== "undefined" && onSeparateGroup
      ? createPortal(
          <div
            ref={separateMenuRef}
            role="dialog"
            aria-label="Mesa agrupada"
            style={{
              position: "fixed",
              left: separateMenu.x,
              top: separateMenu.y + 12,
              transform: "translateX(-50%)",
              zIndex: 10110,
              minWidth: 190,
              padding: 10,
              borderRadius: 14,
              border: "1px solid rgba(148, 163, 184, 0.38)",
              background: "rgba(255,255,255,0.98)",
              boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
            }}
          >
            <div
              style={{
                marginBottom: 8,
                fontSize: 12,
                fontWeight: 700,
                color: "#475569",
              }}
            >
              Grupo de mesas
            </div>
            <button
              type="button"
              onClick={() => {
                onSeparateGroup(tableId);
                setSeparateMenu(null);
              }}
              style={{
                width: "100%",
                border: 0,
                borderRadius: 10,
                padding: "10px 12px",
                background: "#1f2933",
                color: "white",
                fontSize: 13,
                fontWeight: 750,
                cursor: "pointer",
              }}
            >
              Separar mesas
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {preview}
      {separateMenuPortal}
    </>
  );
}
