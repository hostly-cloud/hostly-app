"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { getJoinTargetFromPoint } from "@/lib/map/join-hit-test";
import {
  HOSTLY_MAP_JOIN_ABORTED,
  HOSTLY_MAP_JOIN_ARMED,
} from "@/lib/map/join-pinch-bridge";
import {
  computeFixedMenuPosition,
  GROUP_SEPARATE_MENU_ESTIMATED_SIZE,
  readViewportSize,
  rectFromDomRect,
  type FixedMenuAnchorRect,
  type FixedMenuPosition,
} from "@/lib/map/compute-fixed-menu-position";

/** Sincroniza highlight de destino entre fichas durante join-drag. */
const HOSTLY_MAP_JOIN_DRAG_HOVER = "hostly-map-join-drag-hover";
const HOSTLY_MAP_JOIN_DRAG_END = "hostly-map-join-drag-end";

export type HostlyMapJoinDragHoverDetail = {
  hoverTableId: string | null;
  draggedTableId: string;
  draggedClusterMain: string;
};
import type { Table, TableMapStatus } from "@/lib/firestore/tables";
import {
  MAP_TABLE_CHAIR_BORDER,
  MAP_TABLE_CHAIR_FILL,
  MAP_TABLE_CHAIR_SHADOW,
  mapTableChairLayouts,
  mapTableSeatCount,
} from "./map-table-chairs-visual";

export type ElementMapCardProps = {
  table: Table;
  tableId: string;
  busy: boolean;
  tileVisual: "free" | "busy-short" | "busy-medium" | "busy-long";
  durationLabel: string | null;
  showProductCount: boolean;
  activeLineCount: number;
  badgeTier: "low" | "medium" | "high";
  isCriticalTable: boolean;
  ariaLabel: string | undefined;
  mapLibreLabel: string;
  onTableClick: (tableId: string) => void;
  occupancyStart: number;
  priority: number;
  setNodeRef?: (el: HTMLDivElement | null) => void;
  prefersReducedMotion?: boolean;
  isUltraFastMode?: boolean;
  mapLayoutX: number;
  mapLayoutY: number;
  mapTileWidth: number;
  mapTileHeight: number;
  tableShape: "square" | "round";
  seats: number;
  tableMapStatus: TableMapStatus;
  hasOpenOrder: boolean;
  orderTotal?: number;
  openedAt?: number;
  mapNow?: number;
  priorityLevel?: number;
  inactiveMinutes?: number;
  waiterShortLabel?: string | null;
  billRequested?: boolean;
  reservationBadge?: { label: string; subLabel?: string } | null;
  reservationPressure?: { type: "upcoming" | "late"; time: string } | null;
  readyToClose?: boolean;
  /** Pase de cocina pendiente de marchar (p. ej. «Segundos») cuando el anterior ya está servido. */
  pendingMarchPassHint?: string | null;
  groupedBadgeText?: string | null;
  mapJoinDragEnabled?: boolean;
  onMapTableJoinDrop?: (draggedTableId: string, targetTableId: string) => void;
  /** Id de mesa principal del grupo (resolveMainTableId); para no destacar mismo cluster al arrastrar. */
  mapJoinClusterMainId?: string;
  /** false: no dibujar sillas decorativas (p. ej. móvil). Por defecto true. */
  showVisualChairs?: boolean;
  /** Mesa principal con al menos una secundaria (long-press → separar grupo). */
  isMapGroupedPrimary?: boolean;
  /** Mesa agrupada (principal) con selección activa en el mapa: sombra y ligera elevación. */
  isMapGroupedSelectionElevated?: boolean;
  onRequestSeparateGroupedTables?: (mainTableId: string) => void;
  /**
   * Solo plano vivo Reservas Hostly: re-tinte de superficie por estado de reserva
   * cuando la mesa no está ocupada por comanda (`busy === false`).
   */
  reservasLiveTone?: "booked" | "seated" | "completed" | "no_show" | null;
  /**
   * Con comanda activa: mini chip (p. ej. hora de reserva booked pendiente).
   */
  reservasLiveFollowUpHint?: string | null;
};

type MapBaseSurfaceClass =
  | "hostly-map-table--free"
  | "hostly-map-table--occupied"
  | "hostly-map-table--reserved";

type MapAlertDotClass = "critical" | "attention";

const SURFACE_TOKENS: Record<
  MapBaseSurfaceClass,
  { background: string; color: string }
> = {
  "hostly-map-table--free": { background: "#dff0e4", color: "#264f34" },
  "hostly-map-table--occupied": { background: "#dcecf3", color: "#25495a" },
  "hostly-map-table--reserved": { background: "#ebe4f4", color: "#51425f" },
};

const LONG_PRESS_GROUP_MS = 1000;
const LONG_PRESS_MOVE_PX_SQ = 64;

/** Hold antes de capturar puntero en táctil (coordinado con PinchZoomMap). */
const MAP_JOIN_ARM_MS = 420;
/** Si mueves demasiado durante el hold, cuenta como pan del mapa (abort join). */
const MAP_JOIN_ARM_CANCEL_PX_SQ = 14 * 14;
const MAP_JOIN_DRAG_START_PX_SQ = 8 * 8;

const RESERVAS_LIVE_SKINS: Record<
  "booked" | "seated" | "completed" | "no_show",
  { background: string; color: string; border: string }
> = {
  booked: {
    background: "linear-gradient(180deg, #eef2ff 0%, #e8e0f5 100%)",
    color: "#312e81",
    border: "1px solid rgba(99, 102, 241, 0.32)",
  },
  seated: {
    background: "linear-gradient(180deg, #e0f2fe 0%, #dbeafe 100%)",
    color: "#0c4a6e",
    border: "1px solid rgba(14, 116, 144, 0.42)",
  },
  completed: {
    background: "linear-gradient(180deg, #f1f5f9 0%, #e8edf3 100%)",
    color: "#475569",
    border: "1px solid rgba(100, 116, 139, 0.28)",
  },
  no_show: {
    background: "linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)",
    color: "#9f1239",
    border: "1px solid rgba(225, 29, 72, 0.28)",
  },
};

const ALERT_DOT_COLORS: Record<MapAlertDotClass, string> = {
  critical: "#b94c46",
  attention: "#b87922",
};

/** Superficie base: solo libre / ocupada / reservada (sin urgencia en el fondo). */
function resolveBaseSurface(
  busy: boolean,
  reservationBadge: { label: string; subLabel?: string } | null | undefined,
): MapBaseSurfaceClass {
  if (!busy && reservationBadge) return "hostly-map-table--reserved";
  if (!busy) return "hostly-map-table--free";
  return "hostly-map-table--occupied";
}

/** Indicador discreto: crítico tiene prioridad sobre atención. */
function resolveAlertDot(
  isCriticalTable: boolean,
  priorityLevel: number,
  readyToClose: boolean,
  reservationPressure: { type: "upcoming" | "late" } | null | undefined,
): MapAlertDotClass | null {
  if (isCriticalTable || priorityLevel >= 3) return "critical";
  if (
    priorityLevel === 1 ||
    priorityLevel === 2 ||
    readyToClose ||
    reservationPressure?.type === "late"
  ) {
    return "attention";
  }
  return null;
}

/** Leyenda inferior de la tesela (no altera superficie/colores ni reglas Firestore). */
function resolveMapTableStatusLabel(
  busy: boolean,
  reservationBadge: { label: string; subLabel?: string } | null | undefined,
  reservationPressure:
    | { type: "upcoming" | "late"; time: string }
    | null
    | undefined,
  reservasLiveTone?:
    | "booked"
    | "seated"
    | "completed"
    | "no_show"
    | null
    | undefined,
):
  | "LIBRE"
  | "RESERVADA"
  | "OCUPADA"
  | "RETRASADA"
  | "RESERVA"
  | "EN SALA"
  | "CERRADA"
  | "NO SHOW" {
  if (reservationPressure?.type === "late") return "RETRASADA";
  if (!busy && reservasLiveTone === "seated") return "EN SALA";
  if (!busy && reservasLiveTone === "completed") return "CERRADA";
  if (!busy && reservasLiveTone === "no_show") return "NO SHOW";
  if (!busy && reservasLiveTone === "booked") return "RESERVA";
  if (!busy && reservationBadge) return "RESERVADA";
  if (busy) return "OCUPADA";
  return "LIBRE";
}

/** Número visible: primer bloque de dígitos en el nombre; si no, en tableId. */
function tableNumberForDisplay(table: Table, tableId: string): string {
  const name = String(table.name ?? "").trim();
  const fromName = name.match(/(\d+)/);
  if (fromName) return fromName[1] ?? name;
  const fromId = tableId.match(/(\d+)/);
  if (fromId) return fromId[1] ?? tableId;
  return name || tableId.slice(0, 4);
}

export const ElementCard = memo(
  function ElementCard({
    table,
    tableId,
    busy,
    tileVisual: _tileVisual,
    durationLabel: _durationLabel,
    showProductCount: _showProductCount,
    activeLineCount: _activeLineCount,
    badgeTier: _badgeTier,
    isCriticalTable,
    ariaLabel,
    mapLibreLabel: _mapLibreLabel,
    onTableClick,
    occupancyStart: _occupancyStart,
    priority: _priority,
    setNodeRef,
    prefersReducedMotion = false,
    isUltraFastMode = false,
    mapLayoutX,
    mapLayoutY,
    mapTileWidth,
    mapTileHeight,
    tableShape,
    seats: _seats,
    tableMapStatus: _tableMapStatus,
    hasOpenOrder: _hasOpenOrder,
    orderTotal: _orderTotal,
    openedAt: _openedAt,
    mapNow: _mapNow,
    priorityLevel = 0,
    inactiveMinutes: _inactiveMinutes,
    waiterShortLabel: _waiterShortLabel,
    billRequested: _billRequested,
    reservationBadge,
    reservationPressure,
    readyToClose,
    pendingMarchPassHint,
    groupedBadgeText,
    mapJoinDragEnabled = false,
    onMapTableJoinDrop,
    mapJoinClusterMainId,
    showVisualChairs = true,
    isMapGroupedPrimary = false,
    isMapGroupedSelectionElevated = false,
    onRequestSeparateGroupedTables,
    reservasLiveTone = null,
    reservasLiveFollowUpHint = null,
  }: ElementMapCardProps) {
    const joinDragStateRef = useRef<{
      pointerId: number;
      originX: number;
      originY: number;
      mode: "arming" | "armed" | "dragging";
    } | null>(null);
    const joinArmTimerRef = useRef<number | null>(null);
    /** Última posición en dragging (pointerup en iOS a veces devuelve 0,0). */
    const joinDragLastClientRef = useRef<{ x: number; y: number } | null>(null);
    const joinSuppressClickRef = useRef(false);
    const longPressMenuSuppressClickRef = useRef(false);
    const longPressTimerRef = useRef<number | null>(null);
    const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
    const tileElRef = useRef<HTMLDivElement | null>(null);
    const groupMenuPanelRef = useRef<HTMLDivElement | null>(null);
    const pressResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isPressedPulse, setIsPressedPulse] = useState(false);
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
    const groupMenuAnchorRef = useRef<FixedMenuAnchorRect | null>(null);
    const [separateFlashActive, setSeparateFlashActive] = useState(false);
    const separateFlashTimerRef = useRef<number | null>(null);

    const closeGroupMenu = useCallback(() => {
      setGroupMenuOpen(false);
      setGroupMenuPos(null);
      groupMenuAnchorRef.current = null;
    }, []);

    const positionGroupMenu = useCallback(
      (anchor: FixedMenuAnchorRect, menuSize?: { width: number; height: number }) => {
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

    const separateGroupButtonRef = useRef<HTMLButtonElement | null>(null);
    const onRequestSeparateGroupedTablesRef = useRef(
      onRequestSeparateGroupedTables,
    );
    onRequestSeparateGroupedTablesRef.current = onRequestSeparateGroupedTables;

    /**
     * Un solo punto de ejecución del split en el menú (solo onClick React).
     * No usar capture/pointerUp para lanzar la operación: duplicaban POST
     * con operationIds distintos → GROUP_NOT_FOUND tras el primer 200.
     */
    const separateOnceRef = useRef(false);
    const runSeparateGroupedTables = useCallback(
      (origin: "onClick" | "keyboard" = "onClick") => {
        if (separateOnceRef.current) {
          if (process.env.NODE_ENV === "development") {
            console.log("[Hostly:TableJoinMerge]", "split:menu-ignored", {
              timestamp: Date.now(),
              tableId,
              origin,
              reason: "menu_once_guard",
            });
          }
          return;
        }
        separateOnceRef.current = true;
        if (process.env.NODE_ENV === "development") {
          console.log("[Hostly:TableJoinMerge]", "split:menu-click", {
            timestamp: Date.now(),
            tableId,
            origin,
            hasCallback: Boolean(onRequestSeparateGroupedTablesRef.current),
          });
        }
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
        // Ejecutar split ANTES de desmontar el portal.
        try {
          cb?.(tableId);
        } finally {
          closeGroupMenu();
        }
      },
      [tableId, closeGroupMenu],
    );

    /** Al abrir el menú se habilita de nuevo el botón; al cerrar no se rearma. */
    useLayoutEffect(() => {
      if (groupMenuOpen) {
        separateOnceRef.current = false;
      }
    }, [groupMenuOpen]);

    /** Tras montar el portal: medir tamaño real y reclamar contra viewport. */
    useLayoutEffect(() => {
      if (!groupMenuOpen) return;
      const anchor = groupMenuAnchorRef.current;
      const panel = groupMenuPanelRef.current;
      if (!anchor || !panel) return;
      const r = panel.getBoundingClientRect();
      positionGroupMenu(anchor, { width: r.width, height: r.height });
    }, [groupMenuOpen, positionGroupMenu]);

    useEffect(() => {
      return () => {
        if (separateFlashTimerRef.current != null) {
          window.clearTimeout(separateFlashTimerRef.current);
        }
      };
    }, []);

    const animationsOff = prefersReducedMotion || isUltraFastMode;

    const armPressBurst = useCallback(() => {
      if (animationsOff) return;
      if (pressResetRef.current !== null) {
        clearTimeout(pressResetRef.current);
      }
      setIsPressedPulse(true);
      pressResetRef.current = setTimeout(() => {
        setIsPressedPulse(false);
        pressResetRef.current = null;
      }, 100);
    }, [animationsOff]);

    useEffect(() => {
      return () => {
        if (pressResetRef.current !== null) {
          clearTimeout(pressResetRef.current);
        }
      };
    }, []);

    const clearLongPressTimer = useCallback(() => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }, []);

    useEffect(() => {
      return () => {
        clearLongPressTimer();
      };
    }, [clearLongPressTimer]);

    const clearJoinArmTimer = useCallback(() => {
      if (joinArmTimerRef.current != null) {
        window.clearTimeout(joinArmTimerRef.current);
        joinArmTimerRef.current = null;
      }
    }, []);

    useEffect(() => {
      return () => {
        clearJoinArmTimer();
      };
    }, [clearJoinArmTimer]);

    const mergedTileRef = useCallback(
      (el: HTMLDivElement | null) => {
        tileElRef.current = el;
        setNodeRef?.(el);
      },
      [setNodeRef],
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

    const handleJoinPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!mapJoinDragEnabled || !onMapTableJoinDrop) return;
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
        const ox = e.clientX;
        const oy = e.clientY;

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
      [
        clearJoinArmTimer,
        emitJoinArmed,
        mapJoinDragEnabled,
        onMapTableJoinDrop,
      ],
    );

    const draggedJoinClusterMain = String(
      mapJoinClusterMainId ?? tableId,
    ).trim();

    const handleJoinPointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
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
          } else {
            return;
          }
        }

        if (st.mode !== "dragging") return;
        if (!mapJoinDragEnabled || !onMapTableJoinDrop) return;

        if (e.cancelable) {
          e.preventDefault();
        }

        const rootEl = e.currentTarget as HTMLElement;
        const prevPe = rootEl.style.pointerEvents;
        rootEl.style.pointerEvents = "none";
        let hoverId: string | null = null;
        try {
          joinDragLastClientRef.current = {
            x: e.clientX,
            y: e.clientY,
          };
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
        mapJoinDragEnabled,
        onMapTableJoinDrop,
        tableId,
      ],
    );

    const emitJoinDragEnd = useCallback(() => {
      document.dispatchEvent(
        new CustomEvent(HOSTLY_MAP_JOIN_DRAG_END, { bubbles: true }),
      );
    }, []);

    const handleJoinPointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
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
            onMapTableJoinDrop?.(tableId, targetId);
          }
        }
      },
      [clearJoinArmTimer, emitJoinDragEnd, onMapTableJoinDrop, tableId],
    );

    useEffect(() => {
      if (!mapJoinDragEnabled || !onMapTableJoinDrop) return;
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
    }, [mapJoinClusterMainId, mapJoinDragEnabled, onMapTableJoinDrop, tableId]);

    const handleRootClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
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
        onTableClick(tableId);
      },
      [onTableClick, tableId],
    );

    const handleTilePointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        closeGroupMenu();
        if (e.button === 0) armPressBurst();
        handleJoinPointerDown(e);
        clearLongPressTimer();
        longPressStartRef.current = null;
        if (
          e.button === 0 &&
          isMapGroupedPrimary &&
          onRequestSeparateGroupedTables
        ) {
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
          }, LONG_PRESS_GROUP_MS);
        }
      },
      [
        closeGroupMenu,
        armPressBurst,
        handleJoinPointerDown,
        clearLongPressTimer,
        isMapGroupedPrimary,
        onRequestSeparateGroupedTables,
        positionGroupMenu,
      ],
    );

    const handleTilePointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
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
      (e: React.PointerEvent<HTMLDivElement>) => {
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
      /** Pan/zoom del mapa: cerrar (el ancla se mueve con el canvas transformado). */
      const onWheel = () => closeGroupMenu();
      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches.length >= 2) closeGroupMenu();
      };
      const onViewportChange = () => {
        const tile = tileElRef.current;
        const anchor = groupMenuAnchorRef.current;
        if (!tile || !anchor) {
          closeGroupMenu();
          return;
        }
        const next = rectFromDomRect(tile.getBoundingClientRect());
        const moved =
          Math.abs(next.left - anchor.left) > 2 ||
          Math.abs(next.top - anchor.top) > 2 ||
          Math.abs(next.width - anchor.width) > 2 ||
          Math.abs(next.height - anchor.height) > 2;
        if (moved) {
          closeGroupMenu();
          return;
        }
        const panel = groupMenuPanelRef.current;
        const size = panel
          ? {
              width: panel.getBoundingClientRect().width,
              height: panel.getBoundingClientRect().height,
            }
          : undefined;
        positionGroupMenu(anchor, size);
      };

      document.addEventListener("mousedown", onDown);
      document.addEventListener("touchstart", onDown, { passive: true });
      document.addEventListener("keydown", onKey);
      window.addEventListener("wheel", onWheel, { passive: true, capture: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("resize", onViewportChange);
      window.visualViewport?.addEventListener("resize", onViewportChange);
      window.visualViewport?.addEventListener("scroll", onViewportChange);
      return () => {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("touchstart", onDown);
        document.removeEventListener("keydown", onKey);
        window.removeEventListener("wheel", onWheel, true);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("resize", onViewportChange);
        window.visualViewport?.removeEventListener("resize", onViewportChange);
        window.visualViewport?.removeEventListener("scroll", onViewportChange);
      };
    }, [groupMenuOpen, closeGroupMenu, positionGroupMenu]);

    const planType = table.type;
    const tileBorderRadius =
      planType === "sunbed"
        ? "6px"
        : planType === "bed"
          ? "14px"
          : tableShape === "round"
            ? "999px"
            : "12px";

    const baseSurface = useMemo(
      () => resolveBaseSurface(busy, reservationBadge),
      [busy, reservationBadge],
    );

    const alertDot = useMemo(
      () =>
        resolveAlertDot(
          isCriticalTable,
          priorityLevel,
          readyToClose ?? false,
          reservationPressure,
        ),
      [
        isCriticalTable,
        priorityLevel,
        readyToClose,
        reservationPressure,
      ],
    );

    const skin = SURFACE_TOKENS[baseSurface];

    const reservasLiveSkin =
      !busy && reservasLiveTone
        ? RESERVAS_LIVE_SKINS[reservasLiveTone]
        : null;
    const effectiveSkin = reservasLiveSkin ?? skin;
    const tableNumber = useMemo(
      () => tableNumberForDisplay(table, tableId),
      [table, tableId],
    );

    const groupCorner = useMemo(() => {
      const t = groupedBadgeText?.trim();
      if (!t || !t.startsWith("+")) return null;
      return t;
    }, [groupedBadgeText]);

    /** Copy contextual para el menú largo (solo UI). */
    const groupedTotalTablesLabel = useMemo(() => {
      const t = groupCorner?.trim();
      if (!t?.startsWith("+")) return null;
      const sec = Number.parseInt(t.slice(1), 10);
      if (!Number.isFinite(sec) || sec < 1) return null;
      const total = sec + 1;
      return total === 2 ? "2 mesas unidas" : `${total} mesas unidas`;
    }, [groupCorner]);

    const statusLabel = useMemo(
      () =>
        resolveMapTableStatusLabel(
          busy,
          reservationBadge,
          reservationPressure,
          reservasLiveTone,
        ),
      [busy, reservationBadge, reservationPressure, reservasLiveTone],
    );

    const reservationTimeDisplay = useMemo(() => {
      if (statusLabel === "RETRASADA") {
        if (reservationPressure?.type !== "late") return null;
        const t = reservationPressure.time.trim();
        return t || null;
      }
      if (statusLabel === "RESERVADA") {
        const raw = reservationBadge?.subLabel?.trim() ?? "";
        if (!raw || /^libre$/i.test(raw)) return null;
        return raw;
      }
      return null;
    }, [statusLabel, reservationPressure, reservationBadge]);

    /** Etiqueta discreta esquina (R u hora corta); solo lectura de datos ya existentes. */
    const reserveCornerLabel = useMemo((): string | null => {
      if (!reservationBadge) return null;
      const t = reservationTimeDisplay?.trim();
      if (t) {
        const timeHm = t.match(/\d{1,2}:\d{2}/);
        if (timeHm) return timeHm[0];
        const compact = t.replace(/\s+/g, "");
        return compact.length <= 5 ? compact : compact.slice(0, 5);
      }
      return "R";
    }, [reservationBadge, reservationTimeDisplay]);

    const showReserveCornerPill = reserveCornerLabel != null;

    const baseTileShadow =
      "0 1px 2px rgba(15, 23, 42, 0.06), 0 7px 16px rgba(49, 95, 125, 0.075)";
    const occupiedHoverShadow =
      "0 2px 5px rgba(15, 23, 42, 0.08), 0 10px 22px rgba(49, 95, 125, 0.11)";
    /** Mesa agrupada (principal): sombra un poco más densa, sin animaciones ni cambio de tamaño. */
    const groupedIdleShadowBoost =
      "0 4px 14px rgba(48, 39, 28, 0.08), 0 2px 6px rgba(48, 39, 28, 0.05)";
    /** Agrupada + seleccionada: más elevación y anillo legible. */
    const groupedSelectedShadow =
      "0 10px 26px rgba(48, 39, 28, 0.14), 0 3px 10px rgba(48, 39, 28, 0.08)";
    const groupedSelectedHoverShadow =
      "0 12px 32px rgba(48, 39, 28, 0.16), 0 4px 12px rgba(48, 39, 28, 0.09)";
    /** Anillo suave sin mover layout (solo box-shadow). */
    const groupedSelectedRing =
      "0 0 0 2px rgba(255, 255, 255, 0.96), 0 0 0 5px rgba(63, 100, 120, 0.22)";

    let transform: string | undefined;
    let boxShadow: string;

    if (animationsOff) {
      transform = undefined;
      boxShadow = baseTileShadow;
    } else if (busy) {
      boxShadow =
        isHovered && !isPressedPulse ? occupiedHoverShadow : baseTileShadow;
      if (isPressedPulse) {
        transform = "scale(0.985)";
      } else if (isHovered) {
        transform = "translateY(-1px)";
      } else {
        transform = undefined;
      }
    } else {
      const tactileScale = isPressedPulse ? 0.95 : isHovered ? 1.03 : 1;
      transform =
        tactileScale !== 1 ? `scale(${tactileScale})` : undefined;
      boxShadow = baseTileShadow;
    }

    if (mapJoinDragEnabled) {
      if (isJoinGestureActive) {
        transform = transform
          ? `${transform} scale(1.065)`
          : "scale(1.065)";
      } else if (isJoinArmReady) {
        transform = transform
          ? `${transform} scale(1.028)`
          : "scale(1.028)";
      }
    }

    const isGroupedPrimaryTile = Boolean(groupCorner);

    if (isGroupedPrimaryTile && !isMapGroupedSelectionElevated) {
      boxShadow = `${boxShadow}, ${groupedIdleShadowBoost}`;
    }

    if (isMapGroupedSelectionElevated) {
      const elevatedShadow =
        !animationsOff && isHovered && !isPressedPulse
          ? groupedSelectedHoverShadow
          : groupedSelectedShadow;
      boxShadow = `${elevatedShadow}, ${groupedSelectedRing}`;
    }

    if (joinDropHighlight && mapJoinDragEnabled) {
      boxShadow = `${boxShadow}, 0 0 0 2px rgba(186, 230, 253, 0.95), 0 0 26px rgba(56, 189, 248, 0.42), 0 10px 28px rgba(15, 23, 42, 0.08), 0 5px 16px rgba(63, 100, 120, 0.12)`;
    }

    if (isJoinArmReady && mapJoinDragEnabled) {
      boxShadow = `${boxShadow}, 0 0 0 2px rgba(125, 211, 252, 0.55)`;
    }

    if (isJoinGestureActive && mapJoinDragEnabled) {
      boxShadow = `${boxShadow}, 0 0 0 2px rgba(63, 100, 120, 0.24)`;
    }

    if (isGroupedPrimaryTile) {
      boxShadow = `${boxShadow}, inset 0 0 0 1px rgba(63, 100, 120, 0.22)`;
    }

    if (separateFlashActive) {
      boxShadow = `${boxShadow}, 0 0 0 3px rgba(63, 100, 120, 0.26), 0 12px 28px rgba(63, 100, 120, 0.1)`;
    }

    const tileBorder =
      isMapGroupedSelectionElevated && isGroupedPrimaryTile
        ? "1px solid rgba(63, 100, 120, 0.34)"
        : isGroupedPrimaryTile
          ? "1px solid rgba(63, 100, 120, 0.3)"
          : "1px solid var(--hostly-line)";

    const transition = animationsOff
      ? "none"
      : "transform 120ms ease, box-shadow 280ms ease, opacity 120ms ease";

    const visualChairLayouts = useMemo(() => {
      if (!showVisualChairs || planType !== "table") return [];
      const n = mapTableSeatCount(table);
      return mapTableChairLayouts(
        mapTileWidth,
        mapTileHeight,
        table.tableShape,
        n,
      );
    }, [showVisualChairs, planType, table, mapTileWidth, mapTileHeight]);

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
                // Tamaño táctil independiente del zoom del mapa (portal + fixed).
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
                ref={separateGroupButtonRef}
                type="button"
                className="hostly-map-separate-group-btn"
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  runSeparateGroupedTables("onClick");
                }}
                onPointerDown={(ev) => {
                  // Solo corta propagación; NO ejecuta split (evita doble POST).
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
      mapJoinDragEnabled &&
      onMapTableJoinDrop
        ? createPortal(
            <div
              aria-hidden
              data-hostly-map-join-preview="1"
              style={{
                position: "fixed",
                left: joinDragPreviewPos.x,
                top: joinDragPreviewPos.y,
                transform: "translate(-50%, -50%) scale(1.06)",
                width: mapTileWidth,
                height: mapTileHeight,
                boxSizing: "border-box",
                borderRadius: tileBorderRadius,
                background: skin.background,
                border: "1px solid rgba(51, 65, 85, 0.32)",
                opacity: 0.92,
                pointerEvents: "none",
                zIndex: 10100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 6,
                boxShadow:
                  "0 0 0 1px rgba(15, 23, 42, 0.1), 0 10px 24px rgba(15, 23, 42, 0.1), var(--hostly-shadow-float)",
                transition: animationsOff
                  ? undefined
                  : "transform 90ms ease, opacity 90ms ease, box-shadow 120ms ease",
              }}
            >
              {groupCorner ? (
                <span
                  style={{
                    position: "absolute",
                    top: 5,
                    left: 5,
                    padding: "3px 9px",
                    borderRadius: 9999,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    lineHeight: 1.15,
                    color: "#ffffff",
                    background: "rgba(31, 41, 51, 0.88)",
                    pointerEvents: "none",
                    boxShadow:
                      "0 1px 3px rgba(48, 39, 28, 0.18), 0 1px 1px rgba(0, 0, 0, 0.05)",
                  }}
                >
                  {groupCorner}
                </span>
              ) : null}
              <div
                style={{
                  color: "#1f2933",
                  fontSize: "clamp(19px, 4.75vw, 28px)",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  userSelect: "none",
                  pointerEvents: "none",
                }}
              >
                {tableNumber}
              </div>
            </div>,
            document.body,
          )
        : null;

    return (
      <>
      <div
        role="button"
        tabIndex={0}
        ref={mergedTileRef}
        data-hostly-map-table={tableId}
        data-hostly-map-table-id={tableId}
        data-hostly-map-join-target={
          mapJoinDragEnabled && onMapTableJoinDrop ? "1" : undefined
        }
        data-hostly-map-join={
          mapJoinDragEnabled && onMapTableJoinDrop ? "1" : undefined
        }
        className={`hostly-map-table ${baseSurface}`}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          armPressBurst();
          e.preventDefault();
          onTableClick(tableId);
        }}
        onPointerDown={handleTilePointerDown}
        onMouseEnter={() => {
          if (!animationsOff) setIsHovered(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
        onPointerMove={handleTilePointerMove}
        onPointerUp={handleTilePointerUp}
        onPointerCancel={handleTilePointerUp}
        onClick={handleRootClick}
        style={{
          position: "absolute",
          left: mapLayoutX,
          top: mapLayoutY,
          width: mapTileWidth,
          height: mapTileHeight,
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px",
          cursor:
            isJoinGestureActive && mapJoinDragEnabled
              ? "grabbing"
              : mapJoinDragEnabled
                ? "grab"
                : "pointer",
          zIndex:
            10 +
            priorityLevel +
            (isMapGroupedSelectionElevated ? 5 : 0) +
            (joinDropHighlight && mapJoinDragEnabled ? 6 : 0) +
            (isJoinGestureActive && mapJoinDragEnabled ? 40 : 0) +
            (isJoinArmReady && mapJoinDragEnabled ? 8 : 0),
          transform,
          transition,
          borderRadius: tileBorderRadius,
          background: effectiveSkin.background,
          color: effectiveSkin.color,
          border: reservasLiveSkin
            ? reservasLiveSkin.border
            : baseSurface === "hostly-map-table--free"
              ? "1px solid rgba(47, 93, 60, 0.22)"
              : baseSurface === "hostly-map-table--occupied"
                ? "1px solid rgba(45, 82, 97, 0.24)"
                : tileBorder,
          boxShadow,
          touchAction:
            mapJoinDragEnabled && onMapTableJoinDrop ? "none" : undefined,
          userSelect:
            (isJoinGestureActive || isJoinArmReady) && mapJoinDragEnabled
              ? "none"
              : undefined,
          WebkitUserSelect:
            (isJoinGestureActive || isJoinArmReady) && mapJoinDragEnabled
              ? "none"
              : undefined,
          opacity:
            isJoinGestureActive && mapJoinDragEnabled
              ? 0.56
              : isJoinArmReady && mapJoinDragEnabled
                ? 0.88
                : 1,
        }}
      >
        {planType === "table" ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: tileBorderRadius,
              background: "transparent",
              pointerEvents: "auto",
              zIndex: 0,
            }}
          />
        ) : null}
        {planType === "table" && showVisualChairs ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              borderRadius: tileBorderRadius,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            {visualChairLayouts.map((layout, chairIdx) => (
              <span
                key={chairIdx}
                style={{
                  position: "absolute",
                  left: layout.left,
                  top: layout.top,
                  width: layout.width,
                  height: layout.height,
                  boxSizing: "border-box",
                  borderRadius: 999,
                  background: MAP_TABLE_CHAIR_FILL,
                  border: MAP_TABLE_CHAIR_BORDER,
                  boxShadow: MAP_TABLE_CHAIR_SHADOW,
                  transform: `rotate(${layout.rotation}deg)`,
                  transformOrigin: "center center",
                  pointerEvents: "none",
                }}
              />
            ))}
          </span>
        ) : null}
        {groupCorner ? (
          <span
            aria-hidden
            className="hostly-map-table-group-badge"
            style={{
              position: "absolute",
              top: 5,
              left: 5,
              padding: "3px 9px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.02em",
              lineHeight: 1.15,
              color: "#ffffff",
              background: "rgba(31, 41, 51, 0.84)",
              pointerEvents: "none",
              /* Por debajo del punto de alerta (esquina contraria) para no competir por capa */
              zIndex: 2,
              boxShadow:
                "0 1px 3px rgba(48, 39, 28, 0.18), 0 1px 1px rgba(0, 0, 0, 0.05)",
            }}
          >
            {groupCorner}
          </span>
        ) : null}
        {showReserveCornerPill ? (
          <span
            aria-hidden
            className="hostly-map-table-reserve-corner"
            style={{
              position: "absolute",
              top: 5,
              right: 5,
              padding: "3px 8px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.02em",
              lineHeight: 1.15,
              color: "#4c3b5f",
              background: "rgba(247, 241, 255, 0.98)",
              border: "1px solid rgba(111, 78, 139, 0.2)",
              pointerEvents: "none",
              zIndex: 3,
              maxWidth: "calc(100% - 28px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              boxShadow: "var(--hostly-shadow-card)",
            }}
          >
            {reserveCornerLabel}
          </span>
        ) : null}
        {alertDot ? (
          <span
            aria-hidden
            className={`hostly-map-table-alert-dot hostly-map-table-alert-dot--${alertDot}`}
            style={{
              position: "absolute",
              top: showReserveCornerPill ? 21 : 5,
              right: 5,
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: ALERT_DOT_COLORS[alertDot],
              boxShadow:
                alertDot === "critical"
                  ? "0 0 0 2px rgba(255,255,255,0.96), 0 1px 4px rgba(185, 76, 70, 0.28)"
                  : "0 0 0 2px rgba(255,255,255,0.96), 0 1px 4px rgba(184, 121, 34, 0.24)",
              zIndex: 5,
              pointerEvents: "none",
            }}
          />
        ) : null}
        {busy && pendingMarchPassHint ? (
          <span
            aria-hidden
            data-hostly-march-pass-hint
            style={{
              position: "absolute",
              bottom: reservasLiveFollowUpHint ? 18 : 4,
              left: "50%",
              transform: "translateX(-50%)",
              maxWidth: "calc(100% - 8px)",
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.02em",
              lineHeight: 1.2,
              color: "#9a3412",
              background: "rgba(255, 247, 237, 0.98)",
              border: "1px solid rgba(251, 146, 60, 0.45)",
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
              pointerEvents: "none",
              zIndex: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {`${pendingMarchPassHint} ↗`}
          </span>
        ) : null}
        {busy && reservasLiveFollowUpHint ? (
          <span
            aria-hidden
            data-hostly-reservas-followup-hint
            style={{
              position: "absolute",
              bottom: 4,
              left: "50%",
              transform: "translateX(-50%)",
              maxWidth: "calc(100% - 8px)",
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 750,
              letterSpacing: "0.02em",
              lineHeight: 1.2,
              color: "#312e81",
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(99, 102, 241, 0.35)",
              boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
              pointerEvents: "none",
              zIndex: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {reservasLiveFollowUpHint}
          </span>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            minWidth: 0,
            maxWidth: "100%",
            pointerEvents: "none",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            className="table-number"
            style={{
              color: "#17212b",
              fontSize: "clamp(22px, 5vw, 31px)",
              fontWeight: 820,
              lineHeight: 1,
              letterSpacing: "-0.03em",
              userSelect: "none",
            }}
          >
            {tableNumber}
          </div>
          <span
            className="hostly-map-table-status-label"
            style={{
              color: "#4f6475",
              fontSize: "10.5px",
              fontWeight: 720,
              textTransform: "uppercase",
              letterSpacing: "0.045em",
              lineHeight: 1.08,
              textAlign: "center",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {statusLabel}
          </span>
          {reservationTimeDisplay ? (
            <span
              className="hostly-map-table-res-time"
              style={{
                color: "#5f4e72",
                fontSize: "10px",
                fontWeight: 760,
                lineHeight: 1.1,
                textAlign: "center",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {reservationTimeDisplay}
            </span>
          ) : null}
        </div>
      </div>
      {groupMenuPortal}
      {joinDragPreviewPortal}
      </>
    );
  },
  (prev, next) => {
    const a = prev.table;
    const b = next.table;
    if (a.id !== b.id) return false;
    if (a.type !== b.type) return false;
    if (a.name !== b.name) return false;
    if (a.seats !== b.seats) return false;
    if (a.tableShape !== b.tableShape) return false;
    if (
      (a as Table & { capacity?: number }).capacity !==
      (b as Table & { capacity?: number }).capacity
    )
      return false;
    if (prev.busy !== next.busy) return false;
    if (prev.tileVisual !== next.tileVisual) return false;
    if (prev.isCriticalTable !== next.isCriticalTable) return false;
    if (prev.ariaLabel !== next.ariaLabel) return false;
    if (prev.onTableClick !== next.onTableClick) return false;
    if (prev.setNodeRef !== next.setNodeRef) return false;
    if (prev.prefersReducedMotion !== next.prefersReducedMotion) return false;
    if (prev.isUltraFastMode !== next.isUltraFastMode) return false;
    if (prev.mapLayoutX !== next.mapLayoutX) return false;
    if (prev.mapLayoutY !== next.mapLayoutY) return false;
    if (prev.mapTileWidth !== next.mapTileWidth) return false;
    if (prev.mapTileHeight !== next.mapTileHeight) return false;
    if (prev.tableShape !== next.tableShape) return false;
    if (prev.tableMapStatus !== next.tableMapStatus) return false;
    if (prev.hasOpenOrder !== next.hasOpenOrder) return false;
    if (prev.priorityLevel !== next.priorityLevel) return false;
    if (prev.billRequested !== next.billRequested) return false;
    const prevBadge = prev.reservationBadge;
    const nextBadge = next.reservationBadge;
    if ((prevBadge?.label ?? "") !== (nextBadge?.label ?? "")) return false;
    if ((prevBadge?.subLabel ?? "") !== (nextBadge?.subLabel ?? "")) return false;
    const pa = prev.reservationPressure;
    const pb = next.reservationPressure;
    if ((pa?.type ?? "") !== (pb?.type ?? "")) return false;
    if ((pa?.time ?? "") !== (pb?.time ?? "")) return false;
    if (prev.readyToClose !== next.readyToClose) return false;
    if ((prev.pendingMarchPassHint ?? "") !== (next.pendingMarchPassHint ?? ""))
      return false;
    if ((prev.groupedBadgeText ?? "") !== (next.groupedBadgeText ?? ""))
      return false;
    if (prev.mapJoinDragEnabled !== next.mapJoinDragEnabled) return false;
    if (prev.onMapTableJoinDrop !== next.onMapTableJoinDrop) return false;
    if ((prev.mapJoinClusterMainId ?? "") !== (next.mapJoinClusterMainId ?? ""))
      return false;
    if ((prev.showVisualChairs ?? true) !== (next.showVisualChairs ?? true))
      return false;
    if ((prev.isMapGroupedPrimary ?? false) !== (next.isMapGroupedPrimary ?? false))
      return false;
    if ((prev.isMapGroupedSelectionElevated ?? false) !==
      (next.isMapGroupedSelectionElevated ?? false))
      return false;
    if (prev.onRequestSeparateGroupedTables !== next.onRequestSeparateGroupedTables)
      return false;
    if ((prev.reservasLiveTone ?? null) !== (next.reservasLiveTone ?? null))
      return false;
    if (
      (prev.reservasLiveFollowUpHint ?? "") !==
      (next.reservasLiveFollowUpHint ?? "")
    )
      return false;
    return true;
  },
);

/** @deprecated Usar `ElementCard`. */
export const TableCard = ElementCard;
export type TableMapCardProps = ElementMapCardProps;
