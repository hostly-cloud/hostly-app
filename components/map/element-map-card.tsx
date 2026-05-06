"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Table, TableMapStatus } from "@/lib/firestore/tables";

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
  groupedBadgeText?: string | null;
  mapJoinDragEnabled?: boolean;
  onMapTableJoinDrop?: (draggedTableId: string, targetTableId: string) => void;
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
  "hostly-map-table--free": { background: "#bbf7d0", color: "#166534" },
  "hostly-map-table--occupied": { background: "#7dd3fc", color: "#1e40af" },
  "hostly-map-table--reserved": { background: "#f3e8ff", color: "#7e22ce" },
};

const ALERT_DOT_COLORS: Record<MapAlertDotClass, string> = {
  critical: "#ef4444",
  attention: "#f59e0b",
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
): "LIBRE" | "RESERVADA" | "OCUPADA" | "RETRASADA" {
  if (reservationPressure?.type === "late") return "RETRASADA";
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
    groupedBadgeText,
    mapJoinDragEnabled = false,
    onMapTableJoinDrop,
  }: ElementMapCardProps) {
    const joinDragStateRef = useRef<{
      startX: number;
      startY: number;
      armed: boolean;
      active: boolean;
    } | null>(null);
    const joinSuppressClickRef = useRef(false);
    const pressResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isPressedPulse, setIsPressedPulse] = useState(false);

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

    const handleJoinPointerDown = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (!mapJoinDragEnabled || !onMapTableJoinDrop) return;
        if (e.button !== 0) return;
        joinDragStateRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          armed: true,
          active: false,
        };
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      [mapJoinDragEnabled, onMapTableJoinDrop],
    );

    const handleJoinPointerMove = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const st = joinDragStateRef.current;
        if (!st?.armed) return;
        const dx = e.clientX - st.startX;
        const dy = e.clientY - st.startY;
        if (dx * dx + dy * dy > 64) st.active = true;
      },
      [],
    );

    const handleJoinPointerUp = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        const st = joinDragStateRef.current;
        joinDragStateRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        if (!st?.armed) return;
        if (st.active) {
          joinSuppressClickRef.current = true;
          const els = document.elementsFromPoint(e.clientX, e.clientY);
          for (const node of els) {
            if (!(node instanceof HTMLElement)) continue;
            const host = node.closest("[data-hostly-map-table]");
            if (!host) continue;
            const tid = host.getAttribute("data-hostly-map-table")?.trim();
            if (tid && tid !== tableId) {
              onMapTableJoinDrop?.(tableId, tid);
              break;
            }
          }
        }
      },
      [onMapTableJoinDrop, tableId],
    );

    const handleRootClick = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (joinSuppressClickRef.current) {
          joinSuppressClickRef.current = false;
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
        if (e.button === 0) armPressBurst();
        handleJoinPointerDown(e);
      },
      [armPressBurst, handleJoinPointerDown],
    );

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

    const tableNumber = useMemo(
      () => tableNumberForDisplay(table, tableId),
      [table, tableId],
    );

    const groupCorner = useMemo(() => {
      const t = groupedBadgeText?.trim();
      if (!t || !t.startsWith("+")) return null;
      return t;
    }, [groupedBadgeText]);

    const statusLabel = useMemo(
      () =>
        resolveMapTableStatusLabel(busy, reservationBadge, reservationPressure),
      [busy, reservationBadge, reservationPressure],
    );

    const baseTileShadow = "0 2px 8px rgba(15, 23, 42, 0.06)";
    const occupiedHoverShadow = "0 4px 12px rgba(15, 23, 42, 0.11)";

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

    const transition = animationsOff
      ? "none"
      : "transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease";

    return (
      <div
        role="button"
        tabIndex={0}
        ref={setNodeRef}
        data-hostly-map-table={tableId}
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
        onPointerMove={handleJoinPointerMove}
        onPointerUp={handleJoinPointerUp}
        onPointerCancel={handleJoinPointerUp}
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
          padding: "6px",
          cursor: mapJoinDragEnabled ? "grab" : "pointer",
          zIndex: 10 + priorityLevel,
          transform,
          transition,
          borderRadius: tileBorderRadius,
          background: skin.background,
          color: skin.color,
          border: "1px solid rgba(15, 23, 42, 0.1)",
          boxShadow,
        }}
      >
        {alertDot ? (
          <span
            aria-hidden
            className={`hostly-map-table-alert-dot hostly-map-table-alert-dot--${alertDot}`}
            style={{
              position: "absolute",
              top: 5,
              right: 5,
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: ALERT_DOT_COLORS[alertDot],
              boxShadow:
                alertDot === "critical"
                  ? "0 0 0 1px rgba(255,255,255,0.95), 0 0 4px rgba(239, 68, 68, 0.6)"
                  : "0 0 0 1px rgba(255,255,255,0.95)",
              zIndex: 2,
              pointerEvents: "none",
            }}
          />
        ) : null}
        {groupCorner ? (
          <span
            aria-hidden
            className="table-group-corner"
            style={{
              position: "absolute",
              top: 4,
              ...(alertDot ? { left: 5 } : { right: 5 }),
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              opacity: 0.55,
              pointerEvents: "none",
              lineHeight: 1,
            }}
          >
            {groupCorner}
          </span>
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            minWidth: 0,
            maxWidth: "100%",
            pointerEvents: "none",
          }}
        >
          <div
            className="table-number"
            style={{
              color: "#000000",
              fontSize: "clamp(19px, 4.75vw, 28px)",
              fontWeight: 700,
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
              color: "#374151",
              fontSize: "10px",
              fontWeight: 400,
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
        </div>
      </div>
    );
  },
  (prev, next) => {
    const a = prev.table;
    const b = next.table;
    if (a.id !== b.id) return false;
    if (a.type !== b.type) return false;
    if (a.name !== b.name) return false;
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
    if (prev.readyToClose !== next.readyToClose) return false;
    if ((prev.groupedBadgeText ?? "") !== (next.groupedBadgeText ?? ""))
      return false;
    if (prev.mapJoinDragEnabled !== next.mapJoinDragEnabled) return false;
    if (prev.onMapTableJoinDrop !== next.onMapTableJoinDrop) return false;
    return true;
  },
);

/** @deprecated Usar `ElementCard`. */
export const TableCard = ElementCard;
export type TableMapCardProps = ElementMapCardProps;
