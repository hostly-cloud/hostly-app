"use client";

import { memo } from "react";
import {
  TABLE_MAP_STATUS_OCCUPIED,
  type Table,
  type TableMapStatus,
} from "@/lib/firestore/tables";

function formatOrderOpenDurationLabel(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}

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
};

export const ElementCard = memo(
  function ElementCard({
    table,
    tableId,
    busy,
    tileVisual,
    durationLabel,
    showProductCount,
    activeLineCount,
    badgeTier,
    isCriticalTable,
    ariaLabel,
    mapLibreLabel,
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
    seats,
    tableMapStatus,
    hasOpenOrder,
    orderTotal,
    openedAt,
    mapNow,
    priorityLevel = 0,
    inactiveMinutes = 0,
    waiterShortLabel = null,
    billRequested = false,
    reservationBadge = null,
    reservationPressure = null,
  }: ElementMapCardProps) {
    const finalStatus = hasOpenOrder
      ? TABLE_MAP_STATUS_OCCUPIED
      : tableMapStatus;
    const planType = table.type;
    const tileBorderRadius =
      planType === "sunbed"
        ? "6px"
        : planType === "bed"
          ? "14px"
          : tableShape === "round"
            ? "999px"
            : "12px";
    let orderTotalLevel: "low" | "medium" | "high" = "low";
    if (
      typeof orderTotal === "number" &&
      Number.isFinite(orderTotal) &&
      orderTotal > 0
    ) {
      if (orderTotal > 50) orderTotalLevel = "high";
      else if (orderTotal > 20) orderTotalLevel = "medium";
    }
    const minutes =
      typeof openedAt === "number" &&
      Number.isFinite(openedAt) &&
      typeof mapNow === "number" &&
      Number.isFinite(mapNow)
        ? Math.max(0, Math.floor((mapNow - openedAt) / 60000))
        : null;
    const orderOpenLabel =
      minutes != null ? formatOrderOpenDurationLabel(minutes) : null;
    const timeOpenAlertBg =
      minutes == null
        ? null
        : minutes >= 60
          ? "rgba(255, 0, 0, 0.9)"
          : minutes >= 30
            ? "rgba(255, 165, 0, 0.85)"
            : "rgba(15, 23, 42, 0.72)";
    const baseShadow =
      priorityLevel === 1 ? "0 4px 16px rgba(15, 23, 42, 0.28)" : "";
    const reservedShadow =
      reservationBadge && !prefersReducedMotion && !isUltraFastMode
        ? "inset 0 0 0 2px rgba(245, 158, 11, 0.95)"
        : "";
    const pressureShadow =
      reservationPressure?.type === "late" && !prefersReducedMotion && !isUltraFastMode
        ? "inset 0 0 0 2px rgba(248, 113, 113, 0.95)"
        : reservationPressure?.type === "upcoming" && !prefersReducedMotion && !isUltraFastMode
          ? "inset 0 0 0 2px rgba(245, 158, 11, 0.95)"
          : "";
    const finalShadow = [baseShadow, pressureShadow || reservedShadow]
      .filter(Boolean)
      .join(", ");

    return (
      <div
        role="button"
        tabIndex={0}
        ref={setNodeRef}
        className={`carta-table-map-tile carta-table-map-tile--${tileVisual}${
          isCriticalTable ? " carta-table-map-tile--critical" : ""
        }`}
        aria-label={ariaLabel}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          onTableClick(tableId);
        }}
        onClick={() => onTableClick(tableId)}
        style={{
          position: "absolute",
          left: mapLayoutX,
          top: mapLayoutY,
          width: mapTileWidth,
          height: mapTileHeight,
          boxSizing: "border-box",
          cursor: "pointer",
          zIndex: 10 + priorityLevel,
          outline:
            priorityLevel === 2
              ? "3px solid rgba(255, 140, 0, 0.95)"
              : "none",
          boxShadow: finalShadow || undefined,
          transition:
            prefersReducedMotion || isUltraFastMode || priorityLevel === 3
              ? "none"
              : "transform 200ms ease, opacity 200ms ease",
          willChange: "transform",
          backfaceVisibility: "hidden",
          borderRadius: tileBorderRadius,
          backgroundColor:
            finalStatus === "free"
              ? "#22c55e"
              : finalStatus === "occupied"
                ? "#ef4444"
                : "#eab308",
        }}
      >
        <span className="carta-table-map-tile-name">{table.name}</span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 900,
            lineHeight: 1.1,
            color: "#475569",
          }}
        >
          {seats}
        </span>
        {busy && durationLabel ? (
          <span className="carta-table-map-tile-duration">{durationLabel}</span>
        ) : null}
        {showProductCount ? (
          <span
            className={`carta-table-map-tile-badge carta-table-map-tile-badge--${badgeTier}`}
          >
            {activeLineCount}
          </span>
        ) : null}
        {busy ? (
          <span className="carta-table-map-tile-state carta-table-map-tile-state--occupied">
            <span className="carta-table-map-tile-live-dot" aria-hidden />
          </span>
        ) : (
          <span className="carta-table-map-tile-state">{mapLibreLabel}</span>
        )}
        {waiterShortLabel ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              zIndex: 2,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              boxSizing: "border-box",
              borderRadius: 999,
              background: "#0f172a",
              color: "#ffffff",
              fontSize: waiterShortLabel.length > 1 ? 9 : 11,
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            {waiterShortLabel}
          </span>
        ) : null}
        {hasOpenOrder && inactiveMinutes >= 10 ? (
          <span
            aria-hidden
            className={
              inactiveMinutes >= 20 &&
              !prefersReducedMotion &&
              !isUltraFastMode
                ? "carta-table-map-tile--inactive-blink"
                : undefined
            }
            style={{
              position: "absolute",
              top: 4,
              left: waiterShortLabel ? 26 : 4,
              zIndex: 1,
              fontSize: inactiveMinutes >= 20 ? 13 : 10,
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            {inactiveMinutes >= 20 ? (
              "⚠️"
            ) : (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#fbbf24",
                  verticalAlign: "middle",
                }}
              />
            )}
          </span>
        ) : null}
        {orderOpenLabel && timeOpenAlertBg ? (
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              zIndex: 1,
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.2,
              color: "#ffffff",
              background: timeOpenAlertBg,
              pointerEvents: "none",
            }}
          >
            {orderOpenLabel}
          </span>
        ) : null}
        {typeof orderTotal === "number" &&
        Number.isFinite(orderTotal) &&
        orderTotal > 0 ? (
          <span
            style={{
              position: "absolute",
              right: 6,
              bottom: 6,
              zIndex: 1,
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 800,
              lineHeight: 1.2,
              color: "#ffffff",
              background:
                orderTotalLevel === "high"
                  ? "rgba(255, 0, 0, 0.85)"
                  : orderTotalLevel === "medium"
                    ? "rgba(255, 165, 0, 0.85)"
                    : "rgba(15, 23, 42, 0.72)",
              pointerEvents: "none",
            }}
          >
            €{orderTotal.toFixed(2)}
          </span>
        ) : null}
        {billRequested ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 6,
              bottom: 6,
              zIndex: 2,
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#78350f",
              background: "rgba(251, 191, 36, 0.95)",
              border: "1px solid rgba(180, 83, 9, 0.45)",
              pointerEvents: "none",
              lineHeight: 1.2,
            }}
          >
            Cuenta
          </span>
        ) : null}
        {reservationPressure ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 6,
              bottom: billRequested ? 26 : 6,
              zIndex: 3,
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: reservationPressure.type === "late" ? "#7f1d1d" : "#78350f",
              background:
                reservationPressure.type === "late"
                  ? "rgba(248, 113, 113, 0.92)"
                  : "rgba(251, 191, 36, 0.95)",
              border:
                reservationPressure.type === "late"
                  ? "1px solid rgba(127, 29, 29, 0.55)"
                  : "1px solid rgba(180, 83, 9, 0.45)",
              pointerEvents: "none",
              lineHeight: 1.2,
              maxWidth: "calc(100% - 12px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={`${reservationPressure.type === "late" ? "Retrasada" : "Próxima"} · ${reservationPressure.time}`}
          >
            {reservationPressure.type === "late"
              ? `Retrasada · ${reservationPressure.time}`
              : `Próxima · ${reservationPressure.time}`}
          </span>
        ) : reservationBadge ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 6,
              bottom: billRequested ? 26 : 6,
              zIndex: 2,
              padding: "2px 6px",
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#78350f",
              background: "rgba(251, 191, 36, 0.95)",
              border: "1px solid rgba(180, 83, 9, 0.45)",
              pointerEvents: "none",
              lineHeight: 1.2,
              maxWidth: "calc(100% - 12px)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={
              reservationBadge.subLabel
                ? `${reservationBadge.label} · ${reservationBadge.subLabel}`
                : reservationBadge.label
            }
          >
            {reservationBadge.subLabel
              ? `${reservationBadge.label} · ${reservationBadge.subLabel}`
              : reservationBadge.label}
          </span>
        ) : null}
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
    if (prev.activeLineCount !== next.activeLineCount) return false;
    if (prev.tileVisual !== next.tileVisual) return false;
    if (prev.durationLabel !== next.durationLabel) return false;
    if (prev.showProductCount !== next.showProductCount) return false;
    if (prev.badgeTier !== next.badgeTier) return false;
    if (prev.isCriticalTable !== next.isCriticalTable) return false;
    if (prev.ariaLabel !== next.ariaLabel) return false;
    if (prev.mapLibreLabel !== next.mapLibreLabel) return false;
    if (prev.onTableClick !== next.onTableClick) return false;
    const timeA = prev.occupancyStart || 0;
    const timeB = next.occupancyStart || 0;
    if (timeA !== timeB) return false;
    if (prev.priority !== next.priority) return false;
    if (prev.setNodeRef !== next.setNodeRef) return false;
    if (prev.prefersReducedMotion !== next.prefersReducedMotion) return false;
    if (prev.isUltraFastMode !== next.isUltraFastMode) return false;
    if (prev.mapLayoutX !== next.mapLayoutX) return false;
    if (prev.mapLayoutY !== next.mapLayoutY) return false;
    if (prev.mapTileWidth !== next.mapTileWidth) return false;
    if (prev.mapTileHeight !== next.mapTileHeight) return false;
    if (prev.tableShape !== next.tableShape) return false;
    if (prev.seats !== next.seats) return false;
    if (prev.tableMapStatus !== next.tableMapStatus) return false;
    if (prev.hasOpenOrder !== next.hasOpenOrder) return false;
    if (prev.orderTotal !== next.orderTotal) return false;
    if (prev.openedAt !== next.openedAt) return false;
    if (prev.mapNow !== next.mapNow) return false;
    const prevMin =
      typeof prev.openedAt === "number" &&
      Number.isFinite(prev.openedAt) &&
      typeof prev.mapNow === "number" &&
      Number.isFinite(prev.mapNow)
        ? Math.max(0, Math.floor((prev.mapNow - prev.openedAt) / 60000))
        : null;
    const nextMin =
      typeof next.openedAt === "number" &&
      Number.isFinite(next.openedAt) &&
      typeof next.mapNow === "number" &&
      Number.isFinite(next.mapNow)
        ? Math.max(0, Math.floor((next.mapNow - next.openedAt) / 60000))
        : null;
    if (prevMin !== nextMin) return false;
    if (prev.priorityLevel !== next.priorityLevel) return false;
    if (prev.inactiveMinutes !== next.inactiveMinutes) return false;
    if (prev.waiterShortLabel !== next.waiterShortLabel) return false;
    if (prev.billRequested !== next.billRequested) return false;
    const prevBadge = prev.reservationBadge;
    const nextBadge = next.reservationBadge;
    if ((prevBadge?.label ?? "") !== (nextBadge?.label ?? "")) return false;
    if ((prevBadge?.subLabel ?? "") !== (nextBadge?.subLabel ?? "")) return false;
    const pa = prev.reservationPressure;
    const pb = next.reservationPressure;
    if ((pa?.type ?? "") !== (pb?.type ?? "")) return false;
    if ((pa?.time ?? "") !== (pb?.time ?? "")) return false;
    return true;
  },
);

/** @deprecated Usar `ElementCard`. */
export const TableCard = ElementCard;
export type TableMapCardProps = ElementMapCardProps;
