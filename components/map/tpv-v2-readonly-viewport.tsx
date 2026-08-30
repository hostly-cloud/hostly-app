"use client";

import {
  isValidElement,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { HostlyButton } from "@/components/ui/hostly";
import type { FloorPlanCanvasSize } from "@/lib/firestore/floorPlans";
import { getOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { projectOperationalElement } from "@/lib/sala-editor/geometry/v2-geometry-projection";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import {
  HOSTLY_MAP_JOIN_ARMED,
  type HostlyMapJoinArmedDetail,
} from "@/lib/map/join-pinch-bridge";
import {
  fitBoundsToViewport,
  getPlanContentBounds,
  type EditableFloorMapProps,
  type EditableFloorMapViewportControls,
  type PlanContentBounds,
} from "./editable-floor-map-contract";

const ZOOM_MIN = 0.45;
const ZOOM_MAX = 1.35;
const PINCH_ZOOM_MAX = 2.5;
const FIT_ZOOM_MAX = 1.05;
const VIEW_PADDING_PX = 80;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getPlanSizeBounds(
  planSize?: FloorPlanCanvasSize | null,
): PlanContentBounds | null {
  if (
    !planSize ||
    typeof planSize.width !== "number" ||
    !Number.isFinite(planSize.width) ||
    planSize.width <= 0 ||
    typeof planSize.height !== "number" ||
    !Number.isFinite(planSize.height) ||
    planSize.height <= 0
  ) {
    return null;
  }

  return {
    minX: 0,
    minY: 0,
    maxX: planSize.width,
    maxY: planSize.height,
    width: planSize.width,
    height: planSize.height,
    centerX: planSize.width / 2,
    centerY: planSize.height / 2,
  };
}

type ReadonlyV2Geometry = {
  planSize: FloorPlanCanvasSize;
  operationalBounds: PlanContentBounds | null;
};

function getReadonlyV2Geometry(readonlyUnderlay: ReactNode): ReadonlyV2Geometry | null {
  if (!isValidElement(readonlyUnderlay)) return null;

  const props = readonlyUnderlay.props as {
    contract?: unknown;
    coordinateScale?: unknown;
  };
  const candidate = props.contract;
  if (typeof candidate !== "object" || candidate === null) return null;

  const contract = candidate as EditorTpvReadonlyVisualContract;
  const dimensions = contract.space?.base?.dimensions;
  const pixelsPerUnit = contract.space?.base?.scale?.pixelsPerUnit;
  const coordinateScale =
    typeof props.coordinateScale === "number" &&
    Number.isFinite(props.coordinateScale) &&
    props.coordinateScale > 0
      ? props.coordinateScale
      : 1;

  if (
    typeof dimensions?.width !== "number" ||
    !Number.isFinite(dimensions.width) ||
    dimensions.width <= 0 ||
    typeof dimensions?.height !== "number" ||
    !Number.isFinite(dimensions.height) ||
    dimensions.height <= 0 ||
    typeof pixelsPerUnit !== "number" ||
    !Number.isFinite(pixelsPerUnit) ||
    pixelsPerUnit <= 0
  ) {
    return null;
  }

  const planSize = {
    width: dimensions.width * pixelsPerUnit * coordinateScale,
    height: dimensions.height * pixelsPerUnit * coordinateScale,
  };

  const allInstances = Array.isArray(contract.operationalElementInstances)
    ? contract.operationalElementInstances
    : [];
  const tableInstances = allInstances.filter(
    (instance) => instance.elementType === "TABLE",
  );
  const fitInstances = tableInstances.length > 0 ? tableInstances : allInstances;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let projectedCount = 0;

  for (const instance of fitInstances) {
    const size = getOperationalInstanceCanvasSize(instance);
    const geometry = projectOperationalElement(instance, {
      coordinateScale,
      size,
    });
    if (
      !Number.isFinite(geometry.x) ||
      !Number.isFinite(geometry.y) ||
      !Number.isFinite(geometry.width) ||
      geometry.width <= 0 ||
      !Number.isFinite(geometry.height) ||
      geometry.height <= 0
    ) {
      continue;
    }

    const radians = (geometry.rotation * Math.PI) / 180;
    const absCos = Math.abs(Math.cos(radians));
    const absSin = Math.abs(Math.sin(radians));
    const rotatedWidth = geometry.width * absCos + geometry.height * absSin;
    const rotatedHeight = geometry.width * absSin + geometry.height * absCos;
    const centerX = geometry.x + geometry.width / 2;
    const centerY = geometry.y + geometry.height / 2;

    minX = Math.min(minX, centerX - rotatedWidth / 2);
    minY = Math.min(minY, centerY - rotatedHeight / 2);
    maxX = Math.max(maxX, centerX + rotatedWidth / 2);
    maxY = Math.max(maxY, centerY + rotatedHeight / 2);
    projectedCount += 1;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const operationalBounds =
    projectedCount > 0 &&
    Number.isFinite(width) &&
    width > 0 &&
    Number.isFinite(height) &&
    height > 0
      ? {
          minX,
          minY,
          maxX,
          maxY,
          width,
          height,
          centerX: minX + width / 2,
          centerY: minY + height / 2,
        }
      : null;

  return { planSize, operationalBounds };
}

function isInteractivePointerTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "button,a,input,textarea,select,[role='button'],[data-hostly-map-table],[data-hostly-v2-operational-instance-id]",
    ),
  );
}

type TrackedPointer = { clientX: number; clientY: number };
type PinchSession = {
  startZoom: number;
  startDistance: number;
  anchorMapX: number;
  anchorMapY: number;
};

export function TpvV2ReadonlyViewport(props: EditableFloorMapProps) {
  const {
    readonlyUnderlay,
    planSize,
    viewportFitElements,
    viewportFitZones,
    viewportFitMode = "plan",
    viewportFitZoomMax,
    viewportFitAlign = "center",
    viewportFitOffsetX = 0,
    viewportFitOffsetY = 0,
    viewportFitZoomMultiplier = 1,
    viewportFitPaddingPx,
    mapLayoutEmphasis = false,
    mapAutoFitKey,
    mapAutoFitNonce,
    onWheel,
    className,
    viewportControlsRef,
    hideInlineZoomControls,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const pointersRef = useRef<Map<number, TrackedPointer>>(new Map());
  const pinchRef = useRef<PinchSession | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  const fitPaddingPx = viewportFitPaddingPx ?? VIEW_PADDING_PX;
  const fitZoomMax = viewportFitZoomMax ?? FIT_ZOOM_MAX;

  const rawReadonlyV2Geometry = getReadonlyV2Geometry(readonlyUnderlay);
  const readonlyV2PlanWidth = rawReadonlyV2Geometry?.planSize.width ?? null;
  const readonlyV2PlanHeight = rawReadonlyV2Geometry?.planSize.height ?? null;
  const rawOperationalBounds = rawReadonlyV2Geometry?.operationalBounds ?? null;
  const operationalMinX = rawOperationalBounds?.minX ?? null;
  const operationalMinY = rawOperationalBounds?.minY ?? null;
  const operationalMaxX = rawOperationalBounds?.maxX ?? null;
  const operationalMaxY = rawOperationalBounds?.maxY ?? null;
  const operationalWidth = rawOperationalBounds?.width ?? null;
  const operationalHeight = rawOperationalBounds?.height ?? null;
  const operationalCenterX = rawOperationalBounds?.centerX ?? null;
  const operationalCenterY = rawOperationalBounds?.centerY ?? null;

  const readonlyV2OperationalBounds = useMemo<PlanContentBounds | null>(
    () =>
      operationalMinX != null &&
      operationalMinY != null &&
      operationalMaxX != null &&
      operationalMaxY != null &&
      operationalWidth != null &&
      operationalHeight != null &&
      operationalCenterX != null &&
      operationalCenterY != null
        ? {
            minX: operationalMinX,
            minY: operationalMinY,
            maxX: operationalMaxX,
            maxY: operationalMaxY,
            width: operationalWidth,
            height: operationalHeight,
            centerX: operationalCenterX,
            centerY: operationalCenterY,
          }
        : null,
    [
      operationalCenterX,
      operationalCenterY,
      operationalHeight,
      operationalMaxX,
      operationalMaxY,
      operationalMinX,
      operationalMinY,
      operationalWidth,
    ],
  );

  const hasReadonlyV2PlanSize =
    readonlyV2PlanWidth != null && readonlyV2PlanHeight != null;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const onJoinArmed = (event: Event) => {
      const detail = (event as CustomEvent<HostlyMapJoinArmedDetail>).detail;
      if (!detail) return;
      pointersRef.current.delete(detail.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      if (dragRef.current?.pointerId === detail.pointerId) dragRef.current = null;
    };
    document.addEventListener(HOSTLY_MAP_JOIN_ARMED, onJoinArmed);
    return () => document.removeEventListener(HOSTLY_MAP_JOIN_ARMED, onJoinArmed);
  }, []);

  // Editor V2 is the visual and geometric source of truth. Once a native V2
  // contract is mounted, legacy table/zone coordinates must not participate in
  // camera fitting. Their only remaining role is operational identity/control.
  const includeExplicitFitElementsInPlan =
    viewportFitMode === "plan" &&
    viewportFitElements !== undefined &&
    !hasReadonlyV2PlanSize;

  const effectivePlanWidth = readonlyV2PlanWidth ?? planSize?.width ?? null;
  const effectivePlanHeight = readonlyV2PlanHeight ?? planSize?.height ?? null;
  const effectivePlanSize = useMemo<FloorPlanCanvasSize | null>(
    () =>
      effectivePlanWidth != null && effectivePlanHeight != null
        ? { width: effectivePlanWidth, height: effectivePlanHeight }
        : null,
    [effectivePlanHeight, effectivePlanWidth],
  );

  // Keep auto-fit tied to geometric values, not to live array identities. A
  // recreated callback reattaches ResizeObserver and resets manual zoom.
  const rawFallbackFitBounds =
    !hasReadonlyV2PlanSize && readonlyV2OperationalBounds == null
      ? getPlanContentBounds(
          viewportFitElements ?? props.elements,
          viewportFitZones ?? props.zones,
          includeExplicitFitElementsInPlan ? effectivePlanSize : null,
        )
      : null;
  const fallbackFitMinX = rawFallbackFitBounds?.minX ?? 0;
  const fallbackFitMinY = rawFallbackFitBounds?.minY ?? 0;
  const fallbackFitMaxX = rawFallbackFitBounds?.maxX ?? 0;
  const fallbackFitMaxY = rawFallbackFitBounds?.maxY ?? 0;
  const fallbackFitWidth = rawFallbackFitBounds?.width ?? 1;
  const fallbackFitHeight = rawFallbackFitBounds?.height ?? 1;
  const fallbackFitCenterX = rawFallbackFitBounds?.centerX ?? 0;
  const fallbackFitCenterY = rawFallbackFitBounds?.centerY ?? 0;

  const fitSource = hasReadonlyV2PlanSize
    ? "editor-v2-plan"
    : readonlyV2OperationalBounds
      ? "editor-v2-operational-content"
      : "legacy-fallback";

  const applyFitToViewport = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    if (vw < 32 || vh < 32) return;

    const planBounds = getPlanSizeBounds(effectivePlanSize);
    const useOperationalV2Fit =
      !hasReadonlyV2PlanSize && readonlyV2OperationalBounds != null;
    const usePlanFit =
      !useOperationalV2Fit &&
      viewportFitMode === "plan" &&
      hasReadonlyV2PlanSize &&
      planBounds != null;
    const bounds = useOperationalV2Fit
      ? readonlyV2OperationalBounds
      : usePlanFit
        ? planBounds
        : {
            minX: fallbackFitMinX,
            minY: fallbackFitMinY,
            maxX: fallbackFitMaxX,
            maxY: fallbackFitMaxY,
            width: fallbackFitWidth,
            height: fallbackFitHeight,
            centerX: fallbackFitCenterX,
            centerY: fallbackFitCenterY,
          };

    let nextZoom: number;
    let nextPan: { x: number; y: number };

    if (usePlanFit) {
      const availableWidth = Math.max(32, vw - fitPaddingPx);
      const availableHeight = Math.max(32, vh - fitPaddingPx);
      const rawScale = Math.min(
        availableWidth / bounds.width,
        availableHeight / bounds.height,
      );
      nextZoom = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 0.06;
      nextPan = {
        x: (vw - bounds.width * nextZoom) / 2 - bounds.minX * nextZoom,
        y: (vh - bounds.height * nextZoom) / 2 - bounds.minY * nextZoom,
      };
    } else {
      ({ zoom: nextZoom, pan: nextPan } = fitBoundsToViewport(bounds, vw, vh, {
        paddingPx: fitPaddingPx,
        maxZoom: Math.max(ZOOM_MAX, fitZoomMax),
      }));
    }

    if (mapLayoutEmphasis && !includeExplicitFitElementsInPlan) {
      const cap = Math.min(Math.max(ZOOM_MAX, fitZoomMax), fitZoomMax);
      nextZoom = clamp(nextZoom * 1.085, 0.06, cap);
    }
    if (
      viewportFitZoomMultiplier !== 1 &&
      Number.isFinite(viewportFitZoomMultiplier) &&
      viewportFitZoomMultiplier > 0
    ) {
      nextZoom = clamp(
        nextZoom * viewportFitZoomMultiplier,
        0.06,
        Math.max(ZOOM_MAX, fitZoomMax),
      );
    }

    if (!useOperationalV2Fit && !usePlanFit && viewportFitAlign === "start") {
      const inset = fitPaddingPx / 2;
      nextPan = {
        x: inset - bounds.minX * nextZoom,
        y: inset - bounds.minY * nextZoom,
      };
    }

    setZoom(nextZoom);
    setPan({
      x: nextPan.x + viewportFitOffsetX,
      y: nextPan.y + viewportFitOffsetY,
    });
  }, [
    effectivePlanSize,
    fallbackFitCenterX,
    fallbackFitCenterY,
    fallbackFitHeight,
    fallbackFitMaxX,
    fallbackFitMaxY,
    fallbackFitMinX,
    fallbackFitMinY,
    fallbackFitWidth,
    fitPaddingPx,
    fitZoomMax,
    hasReadonlyV2PlanSize,
    includeExplicitFitElementsInPlan,
    mapLayoutEmphasis,
    readonlyV2OperationalBounds,
    viewportFitAlign,
    viewportFitMode,
    viewportFitOffsetX,
    viewportFitOffsetY,
    viewportFitZoomMultiplier,
  ]);

  const applyNaturalZoomCentered = useCallback(() => {
    const root = rootRef.current;
    const bounds = readonlyV2OperationalBounds ?? getPlanSizeBounds(effectivePlanSize);
    if (!root || !bounds) return;
    setZoom(1);
    setPan({
      x: root.clientWidth / 2 - bounds.centerX,
      y: root.clientHeight / 2 - bounds.centerY,
    });
  }, [effectivePlanSize, readonlyV2OperationalBounds]);

  useImperativeHandle<EditableFloorMapViewportControls | null, EditableFloorMapViewportControls | null>(
    viewportControlsRef,
    () => ({
      zoomIn: () => setZoom((value) => clamp(value * 1.12, ZOOM_MIN, ZOOM_MAX)),
      zoomOut: () => setZoom((value) => clamp(value / 1.12, ZOOM_MIN, ZOOM_MAX)),
      resetNaturalZoom: applyNaturalZoomCentered,
      fitToViewport: applyFitToViewport,
    }),
    [applyFitToViewport, applyNaturalZoomCentered],
  );

  useLayoutEffect(() => {
    const frameId = window.requestAnimationFrame(applyFitToViewport);
    return () => window.cancelAnimationFrame(frameId);
  }, [applyFitToViewport, mapAutoFitKey, mapAutoFitNonce]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => applyFitToViewport());
    observer.observe(root);
    return () => observer.disconnect();
  }, [applyFitToViewport]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      event.stopPropagation();
      onWheel?.(event);
      if (event.defaultPrevented || event.ctrlKey) return;
      event.preventDefault();
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      const nextZoom = clamp(zoom * factor, ZOOM_MIN, ZOOM_MAX);
      if (nextZoom === zoom) return;
      const mapX = (screenX - pan.x) / zoom;
      const mapY = (screenY - pan.y) / zoom;
      setZoom(nextZoom);
      setPan({
        x: screenX - mapX * nextZoom,
        y: screenY - mapY * nextZoom,
      });
    },
    [onWheel, pan.x, pan.y, zoom],
  );

  const beginPinchIfReady = useCallback(() => {
    const root = rootRef.current;
    if (!root || pointersRef.current.size !== 2) return false;
    const points = Array.from(pointersRef.current.values());
    const a = points[0]!;
    const b = points[1]!;
    const distance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
    const rect = root.getBoundingClientRect();
    const midX = (a.clientX + b.clientX) / 2 - rect.left;
    const midY = (a.clientY + b.clientY) / 2 - rect.top;
    const currentZoom = zoomRef.current;
    const currentPan = panRef.current;
    pinchRef.current = {
      startZoom: currentZoom,
      startDistance: distance,
      anchorMapX: (midX - currentPan.x) / currentZoom,
      anchorMapY: (midY - currentPan.y) / currentZoom,
    };
    dragRef.current = null;
    return true;
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.stopPropagation();

      const touchLike = event.pointerType === "touch" || event.pointerType === "pen";
      if (touchLike) {
        pointersRef.current.set(event.pointerId, {
          clientX: event.clientX,
          clientY: event.clientY,
        });
        if (beginPinchIfReady()) return;
      }

      if (isInteractivePointerTarget(event.target) || pointersRef.current.size > 1) return;
      dragRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        startX: panRef.current.x,
        startY: panRef.current.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [beginPinchIfReady],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }

    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const root = rootRef.current;
      if (!root) return;
      const points = Array.from(pointersRef.current.values());
      const a = points[0]!;
      const b = points[1]!;
      const distance = Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY));
      const ratio = distance / pinch.startDistance;
      const nextZoom = clamp(pinch.startZoom * ratio, ZOOM_MIN, PINCH_ZOOM_MAX);
      const rect = root.getBoundingClientRect();
      const midX = (a.clientX + b.clientX) / 2 - rect.left;
      const midY = (a.clientY + b.clientY) / 2 - rect.top;
      const nextPan = {
        x: midX - pinch.anchorMapX * nextZoom,
        y: midY - pinch.anchorMapY * nextZoom,
      };
      zoomRef.current = nextZoom;
      panRef.current = nextPan;
      setZoom(nextZoom);
      setPan(nextPan);
      if (event.cancelable) event.preventDefault();
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextPan = {
      x: drag.startX + event.clientX - drag.clientX,
      y: drag.startY + event.clientY - drag.clientY,
    };
    panRef.current = nextPan;
    setPan(nextPan);
  }, []);

  const handlePointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className={className}
      data-hostly-v2-viewport="native"
      data-hostly-v2-fit-source={fitSource}
      data-hostly-v2-gesture-owner="native"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <div
        data-hostly-v2-viewport-transform="true"
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        {readonlyUnderlay}
      </div>

      {!hideInlineZoomControls ? (
        <div
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            gap: 4,
            border: "1px solid rgba(148,163,184,0.24)",
            borderRadius: 10,
            background: "rgba(255,255,255,0.9)",
            padding: 4,
            boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
            backdropFilter: "blur(8px)",
          }}
        >
          <HostlyButton
            variant="icon"
            iconOnlyLabel="Alejar plano"
            onClick={() =>
              setZoom((value) => clamp(value / 1.12, ZOOM_MIN, ZOOM_MAX))
            }
          >
            −
          </HostlyButton>
          <HostlyButton
            variant="secondary"
            aria-label="Zoom natural"
            onClick={applyNaturalZoomCentered}
          >
            {Math.round(zoom * 100)}%
          </HostlyButton>
          <HostlyButton
            variant="icon"
            iconOnlyLabel="Acercar plano"
            onClick={() =>
              setZoom((value) => clamp(value * 1.12, ZOOM_MIN, ZOOM_MAX))
            }
          >
            +
          </HostlyButton>
          <HostlyButton
            variant="secondary"
            aria-label="Centrar plano"
            onClick={applyFitToViewport}
          >
            Centrar
          </HostlyButton>
        </div>
      ) : null}
    </div>
  );
}
