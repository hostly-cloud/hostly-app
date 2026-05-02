"use client";

import type { CSSProperties, WheelEvent as ReactWheelEvent } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  getDefaultSizeForPlanElementType,
  type PlanElementType,
  type Table,
} from "@/lib/firestore/tables";

export const DEFAULT_MAP_TILE_WIDTH =
  getDefaultSizeForPlanElementType("table").width;
export const DEFAULT_MAP_TILE_HEIGHT =
  getDefaultSizeForPlanElementType("table").height;
const MIN_TILE = 48;

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;

const GRID_SIZE = 10;

function snapToGrid(n: number): number {
  return Math.round(n / GRID_SIZE) * GRID_SIZE;
}

function minSizeForPlanType(planType: PlanElementType): { w: number; h: number } {
  if (planType === "sunbed") return { w: 80, h: 40 };
  if (planType === "bed") return { w: 100, h: 60 };
  if (planType === "wall") return { w: 100, h: 6 };
  if (planType === "bar") return { w: 80, h: 40 };
  if (planType === "column") return { w: 24, h: 24 };
  if (planType === "pool") return { w: 100, h: 60 };
  return { w: 60, h: 60 };
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clampPositionKeepVisible(
  x: number,
  y: number,
  w: number,
  h: number,
  floorW: number,
  floorH: number,
): { x: number; y: number } {
  // Keep at least half the element inside the map so it can't be fully lost.
  const minX = -w / 2;
  const maxX = floorW - w / 2;
  const minY = -h / 2;
  const maxY = floorH - h / 2;
  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
  };
}

export type FloorMapRenderContext = {
  element: Table;
  elementId: string;
  mapLayoutX: number;
  mapLayoutY: number;
  mapTileWidth: number;
  mapTileHeight: number;
  setNodeRef?: (el: HTMLDivElement | null) => void;
};

export type EditableFloorMapZone = {
  id: string;
  name: string;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type EditableFloorMapZoneHighlight = "all" | "unassigned" | string;

export type EditableFloorMapProps = {
  elements: Table[];
  editable: boolean;
  selectedId?: string | null;
  /** Si se pasa y no está vacío, sustituye la lógica de `selectedId` para el resaltado. */
  selectedIds?: string[];
  onSelect?: (id: string, modifiers?: { shiftKey?: boolean }) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onResize?: (id: string, width: number, height: number) => void;
  /** Renombrar desde doble clic en la etiqueta (editor). */
  onRename?: (id: string, newName: string) => void;
  onCreate?: (planType: PlanElementType, x: number, y: number) => void;
  /** Tipo a crear al hacer click en el fondo (modo editor). */
  createType?: PlanElementType;
  renderElement?: (ctx: FloorMapRenderContext) => React.ReactNode;
  /** Solo modo editor: fondo de plano (rejilla) para alinear elementos. */
  editorPlanSurface?: boolean;
  /** Solo modo editor: zonas conocidas (para color / badge). */
  zones?: EditableFloorMapZone[];
  /** Solo modo editor: resaltar zona (opacidad atenuada en el resto). */
  zoneHighlight?: EditableFloorMapZoneHighlight;
  /** Solo modo editor: modo edición de zonas (desactiva mover/redimensionar elementos). */
  editingZones?: boolean;
  selectedZoneId?: string | null;
  onSelectZone?: (zoneId: string) => void;
  onMoveZone?: (zoneId: string, x: number, y: number) => void;
  onResizeZone?: (zoneId: string, width: number, height: number) => void;
  mapRef?: React.Ref<HTMLDivElement | null>;
  onWheel?: (e: ReactWheelEvent<HTMLDivElement>) => void;
  className?: string;
};

function elementSize(el: Table) {
  const def = getDefaultSizeForPlanElementType(el.type);
  const w =
    typeof el.width === "number" && Number.isFinite(el.width) ? el.width : def.width;
  const h =
    typeof el.height === "number" && Number.isFinite(el.height)
      ? el.height
      : def.height;
  return { w, h };
}

function editorChromeForPlanType(
  planType: PlanElementType,
  tableShape: Table["tableShape"],
): { borderRadius: number; background: string } {
  switch (planType) {
    case "sunbed":
      return { borderRadius: 6, background: "rgba(234, 179, 8, 0.42)" };
    case "bed":
      return { borderRadius: 16, background: "rgba(167, 139, 250, 0.4)" };
    case "wall":
      return {
        borderRadius: 2,
        background: "rgba(148, 163, 184, 0.35)",
      };
    case "bar":
      return {
        borderRadius: 8,
        background: "rgba(30, 41, 59, 0.95)",
      };
    case "column":
      return {
        borderRadius: 999,
        background: "rgba(51, 65, 85, 0.95)",
      };
    case "pool":
      return {
        borderRadius: 12,
        background: "rgba(125, 211, 252, 0.5)",
      };
    case "custom":
      return {
        borderRadius: tableShape === "round" ? 999 : 12,
        background: "rgba(34, 197, 94, 0.38)",
      };
    default:
      return {
        borderRadius: tableShape === "round" ? 999 : 12,
        background: "rgba(34, 197, 94, 0.38)",
      };
  }
}

export function EditableFloorMap({
  elements,
  editable,
  selectedId = null,
  selectedIds,
  onSelect,
  onMove,
  onResize,
  onRename,
  onCreate,
  createType,
  renderElement,
  editorPlanSurface = false,
  zones,
  zoneHighlight = "all",
  editingZones = false,
  selectedZoneId = null,
  onSelectZone,
  onMoveZone,
  onResizeZone,
  mapRef,
  onWheel,
  className,
}: EditableFloorMapProps) {
  const zonesById = (() => {
    const map: Record<string, EditableFloorMapZone> = {};
    if (zones) {
      for (const z of zones) map[z.id] = z;
    }
    return map;
  })();
  const floorRef = useRef<HTMLDivElement | null>(null);
  const spaceHeldRef = useRef(false);
  const panRef = useRef({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const [panSession, setPanSession] = useState<{
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const setFloorRef = useCallback(
    (el: HTMLDivElement | null) => {
      floorRef.current = el;
      if (typeof mapRef === "function") mapRef(el);
      else if (mapRef && "current" in mapRef)
        (mapRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    },
    [mapRef],
  );

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const beginPan = useCallback((e: React.PointerEvent) => {
    const wantsPan =
      e.button === 1 || (e.button === 0 && spaceHeldRef.current);
    if (!wantsPan) return;
    e.preventDefault();
    const p = panRef.current;
    setPanSession({
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: p.x,
      startPanY: p.y,
    });
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']",
        )
      ) {
        return;
      }
      e.preventDefault();
      spaceHeldRef.current = true;
      setSpacePressed(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      spaceHeldRef.current = false;
      setSpacePressed(false);
    };
    const onBlur = () => {
      spaceHeldRef.current = false;
      setSpacePressed(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    if (!panSession) return;
    const session = panSession;
    const onMove = (e: PointerEvent) => {
      setPan({
        x: session.startPanX + (e.clientX - session.startClientX),
        y: session.startPanY + (e.clientY - session.startClientY),
      });
    };
    const onUp = () => setPanSession(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [panSession]);

  const [drag, setDrag] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [resize, setResize] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origW: number;
    origH: number;
  } | null>(null);
  const [preview, setPreview] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});

  const [zoneDrag, setZoneDrag] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [zoneResize, setZoneResize] = useState<{
    id: string;
    startPx: number;
    startPy: number;
    origW: number;
    origH: number;
  } | null>(null);
  const [zonePreview, setZonePreview] = useState<
    Record<string, { x: number; y: number; w: number; h: number }>
  >({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const skipBlurSaveRef = useRef(false);

  const saveName = useCallback(() => {
    if (skipBlurSaveRef.current) return;
    if (!editingId) return;
    onRename?.(editingId, editingName.trim());
    setEditingId(null);
  }, [editingId, editingName, onRename]);

  const cancelEditName = useCallback(() => {
    skipBlurSaveRef.current = true;
    setEditingId(null);
    queueMicrotask(() => {
      skipBlurSaveRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (editingZones) setEditingId(null);
  }, [editingZones]);

  useEffect(() => {
    if (!editingId) return;
    if (
      !elements.some((e) => String(e.id).trim() === String(editingId).trim())
    ) {
      setEditingId(null);
    }
  }, [elements, editingId]);

  useEffect(() => {
    if (!drag && !resize && !zoneDrag && !zoneResize) return;
    const onMoveEv = (e: PointerEvent) => {
      if (drag) {
        const nx =
          drag.origX + (e.clientX - drag.startPx) / zoom;
        const ny =
          drag.origY + (e.clientY - drag.startPy) / zoom;
        const sx = snapToGrid(nx);
        const sy = snapToGrid(ny);
        const { w, h } = elementSize(
          elements.find((el) => String(el.id).trim() === drag.id)!,
        );
        setPreview((p) => ({
          ...p,
          [drag.id]: { x: sx, y: sy, w: p[drag.id]?.w ?? w, h: p[drag.id]?.h ?? h },
        }));
      } else if (resize) {
        const el = elements.find((x) => String(x.id).trim() === resize.id)!;
        const mins = minSizeForPlanType(el.type ?? "table");
        let nw = Math.max(
          MIN_TILE,
          resize.origW + (e.clientX - resize.startPx) / zoom,
        );
        let nh = Math.max(
          MIN_TILE,
          resize.origH + (e.clientY - resize.startPy) / zoom,
        );
        nw = snapToGrid(nw);
        nh = snapToGrid(nh);
        nw = Math.max(mins.w, nw);
        nh = Math.max(mins.h, nh);
        const ox = el.x ?? 0;
        const oy = el.y ?? 0;
        setPreview((p) => ({
          ...p,
          [resize.id]: {
            x: p[resize.id]?.x ?? ox,
            y: p[resize.id]?.y ?? oy,
            w: nw,
            h: nh,
          },
        }));
      } else if (zoneDrag) {
        const nx =
          zoneDrag.origX + (e.clientX - zoneDrag.startPx) / zoom;
        const ny =
          zoneDrag.origY + (e.clientY - zoneDrag.startPy) / zoom;
        const z = zonesById[zoneDrag.id];
        const ow =
          z && typeof z.width === "number" && Number.isFinite(z.width)
            ? z.width
            : 260;
        const oh =
          z && typeof z.height === "number" && Number.isFinite(z.height)
            ? z.height
            : 180;
        setZonePreview((p) => ({
          ...p,
          [zoneDrag.id]: {
            x: nx,
            y: ny,
            w: p[zoneDrag.id]?.w ?? ow,
            h: p[zoneDrag.id]?.h ?? oh,
          },
        }));
      } else if (zoneResize) {
        const nw = Math.max(
          120,
          zoneResize.origW + (e.clientX - zoneResize.startPx) / zoom,
        );
        const nh = Math.max(
          90,
          zoneResize.origH + (e.clientY - zoneResize.startPy) / zoom,
        );
        const z = zonesById[zoneResize.id];
        const ox =
          z && typeof z.x === "number" && Number.isFinite(z.x) ? z.x : 40;
        const oy =
          z && typeof z.y === "number" && Number.isFinite(z.y) ? z.y : 40;
        setZonePreview((p) => ({
          ...p,
          [zoneResize.id]: {
            x: p[zoneResize.id]?.x ?? ox,
            y: p[zoneResize.id]?.y ?? oy,
            w: nw,
            h: nh,
          },
        }));
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag) {
        const nx =
          drag.origX + (e.clientX - drag.startPx) / zoom;
        const ny =
          drag.origY + (e.clientY - drag.startPy) / zoom;
        const sx = snapToGrid(nx);
        const sy = snapToGrid(ny);
        const el = elements.find((x) => String(x.id).trim() === drag.id);
        const { w, h } = el ? elementSize(el) : { w: 100, h: 80 };
        const floorW = floorRef.current?.clientWidth ?? 0;
        const floorH = floorRef.current?.clientHeight ?? 0;
        const pos =
          floorW > 0 && floorH > 0
            ? clampPositionKeepVisible(sx, sy, w, h, floorW, floorH)
            : { x: sx, y: sy };
        onMove?.(drag.id, Math.round(pos.x), Math.round(pos.y));
        setDrag(null);
        setPreview({});
      } else if (resize) {
        const el = elements.find((x) => String(x.id).trim() === resize.id);
        const planType = el?.type ?? "table";
        const mins = minSizeForPlanType(planType);
        const floorW = floorRef.current?.clientWidth ?? 0;
        const floorH = floorRef.current?.clientHeight ?? 0;
        const ox = el?.x ?? 0;
        const oy = el?.y ?? 0;
        const rawW = resize.origW + (e.clientX - resize.startPx) / zoom;
        const rawH = resize.origH + (e.clientY - resize.startPy) / zoom;
        const maxW =
          floorW > 0 ? Math.max(mins.w, floorW - ox + mins.w / 2) : rawW;
        const maxH =
          floorH > 0 ? Math.max(mins.h, floorH - oy + mins.h / 2) : rawH;
        let nw = clamp(rawW, Math.max(MIN_TILE, mins.w), maxW);
        let nh = clamp(rawH, Math.max(MIN_TILE, mins.h), maxH);
        nw = snapToGrid(nw);
        nh = snapToGrid(nh);
        nw = clamp(nw, Math.max(MIN_TILE, mins.w), maxW);
        nh = clamp(nh, Math.max(MIN_TILE, mins.h), maxH);
        onResize?.(resize.id, Math.round(nw), Math.round(nh));
        setResize(null);
        setPreview({});
      } else if (zoneDrag) {
        const nx =
          zoneDrag.origX + (e.clientX - zoneDrag.startPx) / zoom;
        const ny =
          zoneDrag.origY + (e.clientY - zoneDrag.startPy) / zoom;
        onMoveZone?.(zoneDrag.id, Math.round(nx), Math.round(ny));
        setZoneDrag(null);
        setZonePreview({});
      } else if (zoneResize) {
        const nw = Math.max(
          120,
          zoneResize.origW + (e.clientX - zoneResize.startPx) / zoom,
        );
        const nh = Math.max(
          90,
          zoneResize.origH + (e.clientY - zoneResize.startPy) / zoom,
        );
        onResizeZone?.(zoneResize.id, Math.round(nw), Math.round(nh));
        setZoneResize(null);
        setZonePreview({});
      }
    };
    window.addEventListener("pointermove", onMoveEv);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMoveEv);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    drag,
    resize,
    zoneDrag,
    zoneResize,
    onMove,
    onResize,
    onMoveZone,
    onResizeZone,
    elements,
    zonesById,
    zoom,
  ]);

  useLayoutEffect(() => {
    if (!editable) return;
    const el = floorRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.94 : 1.06;
        setZoom((z) => clamp(z * factor, ZOOM_MIN, ZOOM_MAX));
        return;
      }
      onWheel?.(e as unknown as ReactWheelEvent<HTMLDivElement>);
    };
    el.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", onNativeWheel);
  }, [editable, onWheel]);

  const handleFloorPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!editable) return;
      if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
        beginPan(e);
        return;
      }
      if (editingZones || !onCreate) return;
      if (e.target !== e.currentTarget) return;
      const fr = floorRef.current?.getBoundingClientRect();
      if (!fr) return;
      const x = (e.clientX - fr.left - pan.x) / zoom;
      const y = (e.clientY - fr.top - pan.y) / zoom;
      onCreate(createType ?? "table", x, y);
    },
    [editable, onCreate, editingZones, createType, zoom, pan.x, pan.y, beginPan],
  );

  if (!editable) {
    if (!renderElement) return null;
    return (
      <>
        {elements.map((element) => {
          const elementId = String(element.id).trim();
          const { w, h } = elementSize(element);
          const mapLayoutX = element.x ?? 0;
          const mapLayoutY = element.y ?? 0;
          return (
            <Fragment key={element.id}>
              {renderElement({
                element,
                elementId,
                mapLayoutX,
                mapLayoutY,
                mapTileWidth: w,
                mapTileHeight: h,
              })}
            </Fragment>
          );
        })}
      </>
    );
  }

  const planSurfaceStyle: CSSProperties | undefined =
    editorPlanSurface && editable
      ? {
          backgroundColor: "rgba(15, 23, 42, 0.5)",
          backgroundImage: [
            "linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
            "linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
          backgroundPosition: "0 0",
        }
      : undefined;

  return (
    <div
      ref={setFloorRef}
      className={className}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        width: "100%",
        overflow: "hidden",
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 6,
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          aria-label="Acercar"
          onClick={() =>
            setZoom((z) => clamp(z + 0.1, ZOOM_MIN, ZOOM_MAX))
          }
          style={{
            minWidth: 32,
            height: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.35)",
            background: "rgba(15, 23, 42, 0.75)",
            color: "#e2e8f0",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Alejar"
          onClick={() =>
            setZoom((z) => clamp(z - 0.1, ZOOM_MIN, ZOOM_MAX))
          }
          style={{
            minWidth: 32,
            height: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.35)",
            background: "rgba(15, 23, 42, 0.75)",
            color: "#e2e8f0",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Restablecer zoom"
          onClick={() => setZoom(1)}
          style={{
            height: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.35)",
            background: "rgba(15, 23, 42, 0.75)",
            color: "#e2e8f0",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reset
        </button>
        <button
          type="button"
          aria-label="Centrar plano"
          onClick={() => setPan({ x: 0, y: 0 })}
          style={{
            height: 32,
            padding: "0 10px",
            borderRadius: 8,
            border: "1px solid rgba(148, 163, 184, 0.35)",
            background: "rgba(15, 23, 42, 0.75)",
            color: "#e2e8f0",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Centrar
        </button>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "top left",
          transition: panSession ? undefined : "transform 0.15s ease-out",
          cursor: panSession ? "grabbing" : spacePressed ? "grab" : "default",
          ...planSurfaceStyle,
        }}
      >
      <div
        onPointerDown={handleFloorPointerDown}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          height: "100%",
          minHeight: 0,
          pointerEvents: "none",
        }}
      >
        {zones
          ? zones.map((z) => {
              const hasRect =
                typeof z.x === "number" &&
                typeof z.y === "number" &&
                typeof z.width === "number" &&
                typeof z.height === "number" &&
                Number.isFinite(z.x) &&
                Number.isFinite(z.y) &&
                Number.isFinite(z.width) &&
                Number.isFinite(z.height);
              if (!hasRect) return null;
              const pv = zonePreview[z.id];
              const x = pv?.x ?? (z.x as number);
              const y = pv?.y ?? (z.y as number);
              const w = pv?.w ?? (z.width as number);
              const h = pv?.h ?? (z.height as number);
              const selected = selectedZoneId === z.id;
              const border = z.color
                ? `1px solid ${z.color}`
                : "1px solid rgba(148, 163, 184, 0.28)";
              const bg = z.color ? `${z.color}1A` : "rgba(148, 163, 184, 0.06)";
              return (
                <div
                  key={z.id}
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    boxSizing: "border-box",
                    borderRadius: 14,
                    border: selected ? "2px solid #38bdf8" : border,
                    background: bg,
                    zIndex: selected ? 8 : 4,
                    pointerEvents: editingZones ? "auto" : "none",
                    userSelect: "none",
                    touchAction: "none",
                    transition: "opacity 120ms ease",
                    opacity: editingZones ? 1 : 0.9,
                  }}
                  onPointerDown={(e) => {
                    if (!editingZones) return;
                    if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                      e.preventDefault();
                      e.stopPropagation();
                      beginPan(e);
                      return;
                    }
                    e.stopPropagation();
                    onSelectZone?.(z.id);
                    setZoneDrag({
                      id: z.id,
                      startPx: e.clientX,
                      startPy: e.clientY,
                      origX: x,
                      origY: y,
                    });
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 6,
                      left: 8,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#e2e8f0",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(15, 23, 42, 0.55)",
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      pointerEvents: "none",
                      maxWidth: "calc(100% - 16px)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {z.name}
                  </span>
                  {editingZones ? (
                    <button
                      type="button"
                      aria-label="Redimensionar zona"
                      onPointerDown={(e) => {
                        if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                          e.preventDefault();
                          e.stopPropagation();
                          beginPan(e);
                          return;
                        }
                        e.stopPropagation();
                        onSelectZone?.(z.id);
                        setZoneResize({
                          id: z.id,
                          startPx: e.clientX,
                          startPy: e.clientY,
                          origW: w,
                          origH: h,
                        });
                      }}
                      style={{
                        position: "absolute",
                        right: 0,
                        bottom: 0,
                        width: 14,
                        height: 14,
                        padding: 0,
                        border: "none",
                        borderRadius: "0 0 14px 0",
                        background: "rgba(15, 23, 42, 0.5)",
                        cursor: "nwse-resize",
                        pointerEvents: "auto",
                      }}
                    />
                  ) : null}
                </div>
              );
            })
          : null}
        {elements.map((element) => {
          const elementId = String(element.id).trim();
          const { w: dw, h: dh } = elementSize(element);
          const pv = preview[elementId];
          const baseX = element.x ?? 0;
          const baseY = element.y ?? 0;
          const mapLayoutX = pv?.x ?? baseX;
          const mapLayoutY = pv?.y ?? baseY;
          const mapTileWidth = pv?.w ?? dw;
          const mapTileHeight = pv?.h ?? dh;
          const selected =
            selectedIds != null && selectedIds.length > 0
              ? selectedIds.some((s) => String(s).trim() === elementId)
              : selectedId === elementId;
          const locked = element.locked === true;
          const chrome = editorChromeForPlanType(element.type, element.tableShape);

          const zoneIdStr =
            typeof element.zoneId === "string" && element.zoneId.trim() !== ""
              ? element.zoneId.trim()
              : "";
          const zoneInfo = zoneIdStr ? zonesById[zoneIdStr] : undefined;
          const zoneNameFallback =
            typeof element.zoneName === "string" && element.zoneName.trim() !== ""
              ? element.zoneName.trim()
              : undefined;
          const zoneDisplayName = zoneInfo?.name ?? zoneNameFallback;
          const zoneColor = zoneInfo?.color;
          const hasZone = !!zoneIdStr || !!zoneNameFallback;

          let dimmed = false;
          if (zoneHighlight !== "all") {
            if (zoneHighlight === "unassigned") {
              dimmed = hasZone;
            } else {
              dimmed = zoneIdStr !== zoneHighlight;
            }
          }
          let displayOpacity = selected ? 1 : dimmed ? 0.32 : 0.9;
          if (locked && !selected) displayOpacity *= 0.92;

          const zoneBorder = zoneColor
            ? `1px solid ${zoneColor}`
            : undefined;
          const normalBorder =
            element.type === "wall"
              ? zoneBorder ?? "1px solid rgba(71, 85, 105, 0.65)"
              : zoneBorder ?? "1px solid rgba(100, 116, 139, 0.38)";
          const darkDecorLabel =
            element.type === "bar" || element.type === "column";
          const tileBorder = selected
            ? "3px solid #38bdf8"
            : locked
              ? zoneColor
                ? `1px dashed ${zoneColor}`
                : `1px dashed rgba(148, 163, 184, 0.55)`
              : normalBorder;

          return (
            <div
              key={element.id}
              style={{
                position: "absolute",
                left: mapLayoutX,
                top: mapLayoutY,
                width: mapTileWidth,
                height: mapTileHeight,
                boxSizing: "border-box",
                borderRadius: chrome.borderRadius,
                background: chrome.background,
                border: tileBorder,
                boxShadow: selected
                  ? "0 0 0 4px rgba(56, 189, 248, 0.22), 0 10px 28px rgba(15, 23, 42, 0.32), 0 4px 12px rgba(56, 189, 248, 0.28)"
                  : locked
                    ? "inset 0 0 0 1px rgba(148, 163, 184, 0.12), 0 1px 2px rgba(15, 23, 42, 0.1)"
                    : zoneColor
                      ? `inset 0 3px 0 ${zoneColor}, 0 1px 2px rgba(15, 23, 42, 0.12)`
                      : "0 1px 2px rgba(15, 23, 42, 0.12)",
                opacity: displayOpacity,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                cursor: panSession
                  ? "grabbing"
                  : spacePressed
                    ? "grab"
                    : locked
                      ? "default"
                      : "grab",
                userSelect: "none",
                touchAction: "none",
                zIndex:
                  editingId != null && String(editingId).trim() === elementId
                    ? 40
                    : selected
                      ? 32
                      : dimmed
                        ? 5
                        : 10,
                pointerEvents: "auto",
                transform: selected ? "scale(1.02)" : undefined,
                transformOrigin: "center center",
                transition:
                  "opacity 120ms ease, box-shadow 120ms ease, transform 120ms ease, border-color 120ms ease",
              }}
              onDoubleClick={(e) => {
                if (editingZones) return;
                if (locked) return;
                if (!onRename) return;
                e.stopPropagation();
                setEditingId(elementId);
                setEditingName(
                  typeof element.name === "string" ? element.name : "",
                );
              }}
              onPointerDown={(e) => {
                if (editingZones) return;
                if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                  e.preventDefault();
                  e.stopPropagation();
                  beginPan(e);
                  return;
                }
                if (
                  editingId != null &&
                  String(editingId).trim() === elementId
                ) {
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation();
                onSelect?.(elementId, { shiftKey: e.shiftKey });
                if (locked) return;
                setDrag({
                  id: elementId,
                  startPx: e.clientX,
                  startPy: e.clientY,
                  origX: mapLayoutX,
                  origY: mapLayoutY,
                });
              }}
            >
              {zoneDisplayName ? (
                <span
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 6,
                    maxWidth: "calc(100% - 12px)",
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: zoneColor ? "#0f172a" : "#e2e8f0",
                    background: zoneColor ?? "rgba(15, 23, 42, 0.55)",
                    border: zoneColor
                      ? "1px solid rgba(15, 23, 42, 0.18)"
                      : "1px solid rgba(148, 163, 184, 0.28)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                  }}
                >
                  {zoneDisplayName}
                </span>
              ) : null}
              {locked ? (
                <span
                  title="Elemento bloqueado"
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    fontSize: 11,
                    lineHeight: 1,
                    pointerEvents: "none",
                    filter: selected ? "drop-shadow(0 0 2px rgba(255,255,255,0.6))" : undefined,
                  }}
                >
                  🔒
                </span>
              ) : null}
              {editingId != null &&
              String(editingId).trim() === elementId &&
              onRename ? (
                <input
                  value={editingName}
                  autoFocus
                  aria-label="Nombre del elemento"
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => saveName()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditName();
                    }
                  }}
                  style={{
                    width: "100%",
                    maxWidth: "calc(100% - 12px)",
                    fontWeight: selected ? 800 : 600,
                    fontSize: selected ? 13 : 12,
                    color: "#0f172a",
                    textAlign: "center",
                    padding: "2px 4px",
                    lineHeight: 1.25,
                    borderRadius: 6,
                    border: "1px solid rgba(56, 189, 248, 0.65)",
                    background: "rgba(255, 255, 255, 0.95)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                <span
                  style={{
                    fontWeight: selected ? 800 : 600,
                    fontSize: selected ? 13 : 12,
                    color: darkDecorLabel
                      ? selected
                        ? "#f8fafc"
                        : "#e2e8f0"
                      : selected
                        ? "#0f172a"
                        : "#1e293b",
                    textAlign: "center",
                    padding: "0 6px",
                    lineHeight: 1.25,
                    textShadow: selected ? "0 1px 0 rgba(255,255,255,0.35)" : "none",
                  }}
                >
                  {element.name || elementId}
                </span>
              )}
              <button
                type="button"
                aria-label="Redimensionar elemento"
                onPointerDown={(e) => {
                  if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                    e.preventDefault();
                    e.stopPropagation();
                    beginPan(e);
                    return;
                  }
                  if (editingZones) return;
                  if (locked) return;
                  e.stopPropagation();
                  onSelect?.(elementId, { shiftKey: false });
                  setResize({
                    id: elementId,
                    startPx: e.clientX,
                    startPy: e.clientY,
                    origW: mapTileWidth,
                    origH: mapTileHeight,
                  });
                }}
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  width: 14,
                  height: 14,
                  padding: 0,
                  border: "none",
                  borderRadius:
                    chrome.borderRadius >= 999
                      ? "0 0 999px 0"
                      : "0 0 10px 0",
                  background: "rgba(15, 23, 42, 0.5)",
                  cursor: "nwse-resize",
                  pointerEvents: locked ? "none" : "auto",
                  opacity: editingZones || locked ? 0 : 1,
                }}
              />
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
