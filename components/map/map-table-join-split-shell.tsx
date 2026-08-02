"use client";

/**
 * Capa interactiva join/split reutilizable (legacy ElementCard + V2 published).
 * No contiene lógica de negocio: solo gestos → callbacks con runtime table IDs.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getJoinTargetFromPoint } from "@/lib/map/join-hit-test";
import {
  HOSTLY_MAP_JOIN_ABORTED,
  HOSTLY_MAP_JOIN_ARMED,
} from "@/lib/map/join-pinch-bridge";
import {
  HOSTLY_MAP_JOIN_DRAG_END,
  HOSTLY_MAP_JOIN_DRAG_HOVER,
  type HostlyMapJoinDragHoverDetail,
} from "@/lib/map/join-drag-events";
import {
  computeFixedMenuPosition,
  GROUP_SEPARATE_MENU_ESTIMATED_SIZE,
  type FixedMenuAnchorRect,
  type FixedMenuPosition,
} from "@/lib/map/compute-fixed-menu-position";
import { logPublishedMapJoinSplit } from "@/lib/map/log-published-map-join-split";

const LONG_PRESS_GROUP_MS = 1000;
const LONG_PRESS_MOVE_PX_SQ = 64;
const MAP_JOIN_ARM_MS = 420;
const MAP_JOIN_ARM_CANCEL_PX_SQ = 14 * 14;
const MAP_JOIN_DRAG_START_PX_SQ = 8 * 8;

function readViewportSize() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function rectFromDomRect(r: DOMRect): FixedMenuAnchorRect {
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export type MapTableJoinSplitShellProps = {
  /** Runtime table ID operativo (resolvedTableId). */
  tableId: string;
  /** Id de instancia V2 (solo diag). */
  instanceId?: string | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  onTableClick?: (tableId: string) => void;
  mapJoinDragEnabled?: boolean;
  onMapTableJoinDrop?: (draggedTableId: string, targetTableId: string) => void;
  mapJoinClusterMainId?: string;
  isMapGroupedPrimary?: boolean;
  onRequestSeparateGroupedTables?: (mainTableId: string) => void;
  groupedTotalTablesLabel?: string | null;
  /** Dimensiones para preview de drag (opcional). */
  previewWidth?: number;
  previewHeight?: number;
  /** Prefijo de log (v2-published | legacy). */
  logSource?: "v2-published" | "legacy";
};

export function MapTableJoinSplitShell({
  tableId,
  instanceId = null,
  children,
  className,
  style,
  disabled = false,
  onTableClick,
  mapJoinDragEnabled = false,
  onMapTableJoinDrop,
  mapJoinClusterMainId,
  isMapGroupedPrimary = false,
  onRequestSeparateGroupedTables,
  groupedTotalTablesLabel = null,
  previewWidth = 80,
  previewHeight = 80,
  logSource = "v2-published",
}: MapTableJoinSplitShellProps) {
  const joinDragStateRef = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    mode: "arming" | "armed" | "dragging";
  } | null>(null);
  const joinArmTimerRef = useRef<number | null>(null);
  const joinDragLastClientRef = useRef<{ x: number; y: number } | null>(null);
  const joinSuppressClickRef = useRef(false);
  const longPressMenuSuppressClickRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const tileElRef = useRef<HTMLDivElement | null>(null);
  const groupMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const groupMenuAnchorRef = useRef<FixedMenuAnchorRect | null>(null);
  const separateOnceRef = useRef(false);
  const separateFlashTimerRef = useRef<number | null>(null);
  const onRequestSeparateGroupedTablesRef = useRef(
    onRequestSeparateGroupedTables,
  );
  onRequestSeparateGroupedTablesRef.current = onRequestSeparateGroupedTables;

  const [joinDropHighlight, setJoinDropHighlight] = useState(false);
  const [isJoinGestureActive, setIsJoinGestureActive] = useState(false);
  const [isJoinArmReady, setIsJoinArmReady] = useState(false);
  const [joinDragPreviewPos, setJoinDragPreviewPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groupMenuPos, setGroupMenuPos] = useState<FixedMenuPosition | null>(
    null,
  );
  const [separateFlashActive, setSeparateFlashActive] = useState(false);

  const joinEnabled = Boolean(mapJoinDragEnabled && onMapTableJoinDrop && !disabled);
  const splitEnabled = Boolean(
    isMapGroupedPrimary && onRequestSeparateGroupedTables && !disabled,
  );

  const log = useCallback(
    (
      action: Parameters<typeof logPublishedMapJoinSplit>[0]["action"],
      extra?: Partial<Parameters<typeof logPublishedMapJoinSplit>[0]>,
    ) => {
      if (logSource !== "v2-published") return;
      logPublishedMapJoinSplit({
        action,
        instanceId,
        resolvedTableId: tableId,
        grouped: isMapGroupedPrimary,
        interactive: !disabled,
        ...extra,
      });
    },
    [disabled, instanceId, isMapGroupedPrimary, logSource, tableId],
  );

  const closeGroupMenu = useCallback(() => {
    setGroupMenuOpen(false);
    setGroupMenuPos(null);
    groupMenuAnchorRef.current = null;
  }, []);

  const positionGroupMenu = useCallback(
    (
      anchor: FixedMenuAnchorRect,
      menuSize?: { width: number; height: number },
    ) => {
      groupMenuAnchorRef.current = anchor;
      const measured = groupMenuPanelRef.current?.getBoundingClientRect();
      const size = menuSize ?? {
        width: measured?.width || GROUP_SEPARATE_MENU_ESTIMATED_SIZE.width,
        height: measured?.height || GROUP_SEPARATE_MENU_ESTIMATED_SIZE.height,
      };
      setGroupMenuPos(
        computeFixedMenuPosition({
          anchor,
          menuSize: size,
          viewport: readViewportSize(),
        }),
      );
    },
    [],
  );

  const runSeparateGroupedTables = useCallback(
    (origin: "onClick" | "keyboard" = "onClick") => {
      if (separateOnceRef.current) {
        log("split-blocked", { reason: "menu_once_guard", mainTableId: tableId });
        return;
      }
      separateOnceRef.current = true;
      if (separateFlashTimerRef.current != null) {
        window.clearTimeout(separateFlashTimerRef.current);
        separateFlashTimerRef.current = null;
      }
      setSeparateFlashActive(true);
      separateFlashTimerRef.current = window.setTimeout(() => {
        setSeparateFlashActive(false);
        separateFlashTimerRef.current = null;
      }, 420);
      const cb = onRequestSeparateGroupedTablesRef.current;
      log("split-callback", {
        mainTableId: tableId,
        reason: origin,
      });
      try {
        cb?.(tableId);
      } finally {
        closeGroupMenu();
      }
    },
    [closeGroupMenu, log, tableId],
  );

  useLayoutEffect(() => {
    if (groupMenuOpen) separateOnceRef.current = false;
  }, [groupMenuOpen]);

  useLayoutEffect(() => {
    if (!groupMenuOpen) return;
    const anchor = groupMenuAnchorRef.current;
    const panel = groupMenuPanelRef.current;
    if (!anchor || !panel) return;
    const r = panel.getBoundingClientRect();
    positionGroupMenu(anchor, { width: r.width, height: r.height });
  }, [groupMenuOpen, positionGroupMenu]);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearJoinArmTimer = useCallback(() => {
    if (joinArmTimerRef.current != null) {
      window.clearTimeout(joinArmTimerRef.current);
      joinArmTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearLongPressTimer();
      clearJoinArmTimer();
      if (separateFlashTimerRef.current != null) {
        window.clearTimeout(separateFlashTimerRef.current);
      }
    },
    [clearJoinArmTimer, clearLongPressTimer],
  );

  const emitJoinArmed = useCallback((pointerId: number) => {
    document.dispatchEvent(
      new CustomEvent(HOSTLY_MAP_JOIN_ARMED, {
        bubbles: true,
        detail: { pointerId },
      }),
    );
  }, []);

  const emitJoinAborted = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      document.dispatchEvent(
        new CustomEvent(HOSTLY_MAP_JOIN_ABORTED, {
          bubbles: true,
          detail: { pointerId, clientX, clientY },
        }),
      );
    },
    [],
  );

  const draggedJoinClusterMain = String(
    mapJoinClusterMainId ?? tableId,
  ).trim();

  const handleJoinPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!joinEnabled) return;
      if (e.button !== 0) return;
      clearJoinArmTimer();
      setIsJoinGestureActive(false);
      setIsJoinArmReady(false);
      setJoinDragPreviewPos(null);
      joinDragStateRef.current = null;
      joinDragLastClientRef.current = null;

      const isTouchLike =
        e.pointerType === "touch" || e.pointerType === "pen";

      if (!isTouchLike) {
        joinDragStateRef.current = {
          pointerId: e.pointerId,
          originX: e.clientX,
          originY: e.clientY,
          mode: "armed",
        };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        emitJoinArmed(e.pointerId);
        return;
      }

      joinDragStateRef.current = {
        pointerId: e.pointerId,
        originX: e.clientX,
        originY: e.clientY,
        mode: "arming",
      };
      const pid = e.pointerId;
      joinArmTimerRef.current = window.setTimeout(() => {
        joinArmTimerRef.current = null;
        const st = joinDragStateRef.current;
        if (!st || st.mode !== "arming" || st.pointerId !== pid) return;
        const el = tileElRef.current;
        if (!el) return;
        st.mode = "armed";
        setIsJoinArmReady(true);
        try {
          el.setPointerCapture(pid);
        } catch {
          /* ignore */
        }
        emitJoinArmed(pid);
      }, MAP_JOIN_ARM_MS);
    },
    [clearJoinArmTimer, emitJoinArmed, joinEnabled],
  );

  const handleJoinPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const st = joinDragStateRef.current;
      if (!st) return;
      const dx = e.clientX - st.originX;
      const dy = e.clientY - st.originY;
      const distSq = dx * dx + dy * dy;

      if (st.mode === "arming") {
        if (distSq > MAP_JOIN_ARM_CANCEL_PX_SQ) {
          clearJoinArmTimer();
          joinDragStateRef.current = null;
          setIsJoinArmReady(false);
          emitJoinAborted(st.pointerId, e.clientX, e.clientY);
        }
        return;
      }

      if (st.mode === "armed") {
        if (distSq > MAP_JOIN_DRAG_START_PX_SQ) {
          st.mode = "dragging";
          setIsJoinGestureActive(true);
          setIsJoinArmReady(false);
          log("join-candidate", { reason: "drag-start" });
        } else {
          return;
        }
      }

      if (st.mode !== "dragging") return;
      if (!joinEnabled) return;
      if (e.cancelable) e.preventDefault();

      const rootEl = e.currentTarget as HTMLElement;
      const prevPe = rootEl.style.pointerEvents;
      rootEl.style.pointerEvents = "none";
      let hoverId: string | null = null;
      try {
        joinDragLastClientRef.current = { x: e.clientX, y: e.clientY };
        hoverId = getJoinTargetFromPoint(
          e.clientX,
          e.clientY,
          tableId,
          rootEl,
        );
      } finally {
        rootEl.style.pointerEvents = prevPe;
      }

      document.dispatchEvent(
        new CustomEvent<HostlyMapJoinDragHoverDetail>(
          HOSTLY_MAP_JOIN_DRAG_HOVER,
          {
            bubbles: true,
            detail: {
              hoverTableId: hoverId,
              draggedTableId: tableId,
              draggedClusterMain: draggedJoinClusterMain,
            },
          },
        ),
      );
      setJoinDragPreviewPos({ x: e.clientX, y: e.clientY });
    },
    [
      clearJoinArmTimer,
      draggedJoinClusterMain,
      emitJoinAborted,
      joinEnabled,
      log,
      tableId,
    ],
  );

  const emitJoinDragEnd = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent(HOSTLY_MAP_JOIN_DRAG_END, { bubbles: true }),
    );
  }, []);

  const handleJoinPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      clearJoinArmTimer();
      const st = joinDragStateRef.current;
      joinDragStateRef.current = null;
      setIsJoinGestureActive(false);
      setIsJoinArmReady(false);
      setJoinDragPreviewPos(null);
      emitJoinDragEnd();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!st) {
        joinDragLastClientRef.current = null;
        return;
      }
      if (st.mode === "arming" || st.mode === "armed") {
        joinDragLastClientRef.current = null;
        return;
      }
      if (st.mode === "dragging") {
        joinSuppressClickRef.current = true;
        const rootEl = e.currentTarget as HTMLElement;
        const prevPe = rootEl.style.pointerEvents;
        rootEl.style.pointerEvents = "none";
        let targetId: string | null = null;
        try {
          const last = joinDragLastClientRef.current;
          const cx = last?.x ?? e.clientX;
          const cy = last?.y ?? e.clientY;
          targetId = getJoinTargetFromPoint(cx, cy, tableId, rootEl);
        } finally {
          rootEl.style.pointerEvents = prevPe;
        }
        joinDragLastClientRef.current = null;
        if (targetId) {
          log("join-callback", {
            mainTableId: targetId,
            secondaryTableId: tableId,
          });
          onMapTableJoinDrop?.(tableId, targetId);
        } else {
          log("join-blocked", { reason: "no-drop-target" });
        }
      }
    },
    [
      clearJoinArmTimer,
      emitJoinDragEnd,
      log,
      onMapTableJoinDrop,
      tableId,
    ],
  );

  useEffect(() => {
    if (!joinEnabled) return;
    const clusterSelf = String(mapJoinClusterMainId ?? tableId).trim();
    const onHover = (ev: Event) => {
      const ce = ev as CustomEvent<HostlyMapJoinDragHoverDetail>;
      const d = ce.detail;
      if (!d) return;
      if (d.draggedTableId === tableId) {
        setJoinDropHighlight(false);
        return;
      }
      const hover = d.hoverTableId?.trim() ?? "";
      if (!hover || hover !== tableId) {
        setJoinDropHighlight(false);
        return;
      }
      const dm = String(d.draggedClusterMain ?? "").trim();
      setJoinDropHighlight(dm !== clusterSelf);
    };
    const onEnd = () => setJoinDropHighlight(false);
    document.addEventListener(
      HOSTLY_MAP_JOIN_DRAG_HOVER,
      onHover as EventListener,
    );
    document.addEventListener(HOSTLY_MAP_JOIN_DRAG_END, onEnd);
    return () => {
      document.removeEventListener(
        HOSTLY_MAP_JOIN_DRAG_HOVER,
        onHover as EventListener,
      );
      document.removeEventListener(HOSTLY_MAP_JOIN_DRAG_END, onEnd);
    };
  }, [joinEnabled, mapJoinClusterMainId, tableId]);

  const handleRootClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (joinSuppressClickRef.current) {
        joinSuppressClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (longPressMenuSuppressClickRef.current) {
        longPressMenuSuppressClickRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onTableClick?.(tableId);
    },
    [disabled, onTableClick, tableId],
  );

  const handleTilePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled) {
        log("join-blocked", { reason: "disabled" });
        return;
      }
      closeGroupMenu();
      log("table-pointer-down", {
        grouped: isMapGroupedPrimary,
        interactive: true,
      });
      handleJoinPointerDown(e);
      clearLongPressTimer();
      longPressStartRef.current = null;
      if (e.button === 0 && splitEnabled) {
        longPressStartRef.current = { x: e.clientX, y: e.clientY };
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          longPressStartRef.current = null;
          const el = tileElRef.current;
          if (el && typeof document !== "undefined") {
            positionGroupMenu(rectFromDomRect(el.getBoundingClientRect()));
          } else {
            positionGroupMenu({
              left: e.clientX - 20,
              top: e.clientY - 20,
              width: 40,
              height: 40,
            });
          }
          longPressMenuSuppressClickRef.current = true;
          setGroupMenuOpen(true);
          log("group-menu-open", { mainTableId: tableId });
        }, LONG_PRESS_GROUP_MS);
      } else if (e.button === 0 && isMapGroupedPrimary && !onRequestSeparateGroupedTables) {
        log("split-blocked", { reason: "missing-callback", mainTableId: tableId });
      }
    },
    [
      clearLongPressTimer,
      closeGroupMenu,
      disabled,
      handleJoinPointerDown,
      isMapGroupedPrimary,
      log,
      onRequestSeparateGroupedTables,
      positionGroupMenu,
      splitEnabled,
      tableId,
    ],
  );

  const handleTilePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const lpStart = longPressStartRef.current;
      if (lpStart != null && longPressTimerRef.current != null) {
        const dx = e.clientX - lpStart.x;
        const dy = e.clientY - lpStart.y;
        if (dx * dx + dy * dy > LONG_PRESS_MOVE_PX_SQ) {
          clearLongPressTimer();
          longPressStartRef.current = null;
        }
      }
      handleJoinPointerMove(e);
      const st = joinDragStateRef.current;
      if (st?.mode === "dragging") {
        clearLongPressTimer();
        longPressStartRef.current = null;
      }
    },
    [clearLongPressTimer, handleJoinPointerMove],
  );

  const handleTilePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      clearLongPressTimer();
      longPressStartRef.current = null;
      handleJoinPointerUp(e);
    },
    [clearLongPressTimer, handleJoinPointerUp],
  );

  useEffect(() => {
    if (!groupMenuOpen) return;
    const onDown = (ev: MouseEvent | TouchEvent) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (groupMenuPanelRef.current?.contains(t)) return;
      if (tileElRef.current?.contains(t)) return;
      closeGroupMenu();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeGroupMenu();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeGroupMenu, groupMenuOpen]);

  const groupMenuPortal =
    groupMenuOpen &&
    groupMenuPos &&
    typeof document !== "undefined" &&
    onRequestSeparateGroupedTables
      ? createPortal(
          <div
            ref={groupMenuPanelRef}
            role="dialog"
            aria-label="Mesa agrupada"
            data-hostly-map-group-menu="1"
            data-placement={groupMenuPos.placement}
            style={{
              position: "fixed",
              top: groupMenuPos.top,
              left: groupMenuPos.left,
              zIndex: 10000,
              minWidth: 196,
              maxWidth: "min(280px, calc(100vw - 16px))",
              padding: "10px 11px 11px",
              borderRadius: 14,
              background: "rgba(255, 255, 255, 0.98)",
              border: "1px solid rgba(148, 163, 184, 0.38)",
              boxShadow: "var(--hostly-shadow-float)",
              touchAction: "manipulation",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#64748b",
                marginBottom: 5,
              }}
            >
              Grupo de mesas
            </div>
            {groupedTotalTablesLabel ? (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 750,
                  letterSpacing: "-0.02em",
                  color: "#1f2933",
                  lineHeight: 1.25,
                  marginBottom: 10,
                }}
              >
                {groupedTotalTablesLabel}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#667085",
                  lineHeight: 1.3,
                  marginBottom: 10,
                }}
              >
                Varias mesas comparten esta cuenta
              </div>
            )}
            <button
              type="button"
              className="hostly-map-separate-group-btn"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                runSeparateGroupedTables("onClick");
              }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
              }}
              onPointerUp={(ev) => {
                ev.stopPropagation();
              }}
              onKeyDown={(ev) => {
                if (ev.key !== "Enter" && ev.key !== " ") return;
                ev.preventDefault();
                ev.stopPropagation();
                runSeparateGroupedTables("keyboard");
              }}
              style={{
                width: "100%",
                padding: "11px 12px 10px",
                border: "none",
                borderRadius: 11,
                background: "#1f2933",
                color: "#ffffff",
                cursor: "pointer",
                textAlign: "center",
                boxShadow: "var(--hostly-shadow-card)",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 780,
                  letterSpacing: "-0.01em",
                }}
              >
                Separar mesas
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 600,
                  opacity: 0.82,
                  marginTop: 3,
                  letterSpacing: "0.02em",
                }}
              >
                Cada mesa vuelve a mostrarse sola en el mapa
              </span>
            </button>
          </div>,
          document.body,
        )
      : null;

  const joinDragPreviewPortal =
    joinDragPreviewPos != null &&
    typeof document !== "undefined" &&
    joinEnabled
      ? createPortal(
          <div
            aria-hidden
            data-hostly-map-join-preview="1"
            style={{
              position: "fixed",
              left: joinDragPreviewPos.x,
              top: joinDragPreviewPos.y,
              transform: "translate(-50%, -50%) scale(1.06)",
              width: previewWidth,
              height: previewHeight,
              boxSizing: "border-box",
              borderRadius: 10,
              background: "rgba(59, 130, 246, 0.35)",
              border: "1px solid rgba(51, 65, 85, 0.32)",
              opacity: 0.92,
              pointerEvents: "none",
              zIndex: 10100,
            }}
          />,
          document.body,
        )
      : null;

  return (
    <>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        ref={tileElRef}
        data-hostly-map-table={tableId}
        data-hostly-map-table-id={tableId}
        data-hostly-map-join-target={joinEnabled ? "1" : undefined}
        data-hostly-map-join={joinEnabled ? "1" : undefined}
        data-hostly-map-instance-id={instanceId ?? undefined}
        data-hostly-join-drop-highlight={joinDropHighlight ? "1" : "0"}
        data-hostly-separate-flash={separateFlashActive ? "1" : "0"}
        className={className}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onTableClick?.(tableId);
        }}
        onPointerDown={handleTilePointerDown}
        onPointerMove={handleTilePointerMove}
        onPointerUp={handleTilePointerUp}
        onPointerCancel={handleTilePointerUp}
        onClick={handleRootClick}
        style={{
          ...style,
          cursor: disabled
            ? "default"
            : isJoinGestureActive && joinEnabled
              ? "grabbing"
              : joinEnabled
                ? "grab"
                : "pointer",
          touchAction: joinEnabled ? "none" : style?.touchAction,
          userSelect:
            (isJoinGestureActive || isJoinArmReady) && joinEnabled
              ? "none"
              : style?.userSelect,
          opacity:
            isJoinGestureActive && joinEnabled
              ? 0.56
              : isJoinArmReady && joinEnabled
                ? 0.88
                : style?.opacity,
          outline:
            joinDropHighlight && joinEnabled
              ? "3px solid rgba(59, 130, 246, 0.85)"
              : style?.outline,
          outlineOffset: joinDropHighlight ? 2 : style?.outlineOffset,
          zIndex:
            typeof style?.zIndex === "number"
              ? style.zIndex +
                (joinDropHighlight && joinEnabled ? 6 : 0) +
                (isJoinGestureActive && joinEnabled ? 40 : 0) +
                (isJoinArmReady && joinEnabled ? 8 : 0)
              : style?.zIndex,
        }}
      >
        {children}
      </div>
      {groupMenuPortal}
      {joinDragPreviewPortal}
    </>
  );
}
