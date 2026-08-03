"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { normalizeSalaEspacioBase } from "@/lib/sala-editor/types/espacio-base";
import {
  buildReadonlyMapGeometryDiag,
  logReadonlyMapGeometryDiag,
  resolveInstanceLegacyTableId,
  resolveOperationalInstanceDisplayLayout,
  resolvePublishedDisplayLayout,
  scaleLogicalElementBox,
} from "@/lib/sala-editor/persistence/sala-published-geometry";
import { scaleEditorWallSegment } from "@/lib/sala-editor/canvas/editor-visual-scale";
import { SalaOperationalElementVisual } from "@/components/sala-editor/panels/sala-operational-element-visual";
import { SalaStructuralToolVisual } from "@/components/sala-editor/panels/sala-structural-tool-visual";
import type { SalaStructuralElementKind } from "@/lib/sala-editor/types/elementos-estructurales";
import type { LandscapeElementKind } from "@/lib/sala-editor/landscape/landscape-element";
import { SALA_WALL_STROKE_WIDTH } from "@/lib/sala-editor/geometry/wall-geometry";
import { MapTableJoinSplitShell } from "@/components/map/map-table-join-split-shell";
import "@/components/sala-editor/sala-editor-workbench.css";

export type SalaPublishedReadonlyOverlay = {
  tableId: string;
  busy?: boolean;
  reserved?: boolean;
  attention?: boolean;
  critical?: boolean;
  delayed?: boolean;
  selected?: boolean;
  groupBadge?: string | null;
  durationLabel?: string | null;
  productCount?: number | null;
};

export type SalaPublishedReadonlyMapProps = {
  document: SalaEditorDocument;
  /** Espacio activo (id). Si falta, primer espacio visible. */
  espacioId?: string | null;
  overlaysByTableId?: Record<string, SalaPublishedReadonlyOverlay>;
  /** Mesas secundarias de grupo: se ocultan sin alterar geometría published. */
  hiddenTableIds?: ReadonlySet<string> | string[];
  /**
   * Mesas legacy vinculadas e interactivas. Si se define, las TABLE sin vínculo
   * se pintan pero no abren comanda.
   */
  interactiveTableIds?: ReadonlySet<string> | string[];
  selectedTableId?: string | null;
  onTableClick?: (tableId: string) => void;
  /** Mismo contrato que ElementCard / mapa legacy. */
  mapJoinDragEnabled?: boolean;
  onMapTableJoinDrop?: (draggedTableId: string, targetTableId: string) => void;
  onRequestSeparateGroupedTables?: (mainTableId: string) => void;
  /** runtime tableId → main cluster id */
  mapJoinClusterMainIdByTableId?: Record<string, string>;
  /** Principales de grupo (runtime ids). */
  groupedPrimaryTableIds?: ReadonlySet<string> | string[];
  groupedTotalTablesLabelByTableId?: Record<string, string>;
  className?: string;
  style?: CSSProperties;
};

function resolveActiveEspacio(
  document: SalaEditorDocument,
  espacioId?: string | null,
): SalaEspacio | null {
  const id = espacioId?.trim();
  if (id) {
    return document.espacios.find((e) => e.id === id) ?? null;
  }
  return (
    document.espacios.find((e) => e.visible !== false && e.active !== false) ??
    document.espacios[0] ??
    null
  );
}

function landscapeClass(kind: LandscapeElementKind): string {
  switch (kind) {
    case "palm":
      return "hostly-sala-landscape-element--palm";
    case "olive":
      return "hostly-sala-landscape-element--olive";
    case "roundPlanter":
      return "hostly-sala-landscape-element--round-planter";
    default:
      return "hostly-sala-landscape-element--rect-planter";
  }
}

function overlayTone(
  overlay: SalaPublishedReadonlyOverlay | undefined,
): string {
  if (!overlay) return "free";
  if (overlay.critical) return "critical";
  if (overlay.delayed) return "delayed";
  if (overlay.attention) return "attention";
  if (overlay.reserved) return "reserved";
  if (overlay.busy) return "busy";
  return "free";
}

/**
 * Mapa readonly V2: misma geometría de paint que Editor V2
 * (stage display + coordinateScale; mesas con tamaño fijo de primitive).
 * Overlays TPV no alteran la caja geométrica.
 */
function toIdSet(
  value: ReadonlySet<string> | string[] | undefined | null,
): Set<string> {
  if (!value) return new Set();
  if (Array.isArray(value)) {
    return new Set(value.map((id) => String(id).trim()).filter(Boolean));
  }
  return new Set([...value].map((id) => String(id).trim()).filter(Boolean));
}

export function SalaPublishedReadonlyMap({
  document,
  espacioId,
  overlaysByTableId = {},
  hiddenTableIds,
  interactiveTableIds,
  selectedTableId = null,
  onTableClick,
  mapJoinDragEnabled = false,
  onMapTableJoinDrop,
  onRequestSeparateGroupedTables,
  mapJoinClusterMainIdByTableId = {},
  groupedPrimaryTableIds,
  groupedTotalTablesLabelByTableId = {},
  className,
  style,
}: SalaPublishedReadonlyMapProps) {
  const hiddenSet = useMemo(
    () => toIdSet(hiddenTableIds),
    [hiddenTableIds],
  );

  const interactiveSet = useMemo(() => {
    if (interactiveTableIds == null) return null;
    return toIdSet(interactiveTableIds);
  }, [interactiveTableIds]);

  const groupedPrimarySet = useMemo(
    () => toIdSet(groupedPrimaryTableIds),
    [groupedPrimaryTableIds],
  );

  const espacio = useMemo(
    () => resolveActiveEspacio(document, espacioId),
    [document, espacioId],
  );

  const displayLayout = useMemo(() => {
    if (!espacio) {
      return {
        stageWidth: 800,
        stageHeight: 560,
        coordinateScale: 1,
        displayPixelsPerUnit: 72,
        logicalPixelsPerUnit: 100,
      };
    }
    return resolvePublishedDisplayLayout(
      normalizeSalaEspacioBase(espacio.base),
    );
  }, [espacio]);

  const spaceId = espacio?.id ?? "";
  const coordinateScale = displayLayout.coordinateScale;

  const surfaces = (document.surfaceObjects ?? []).filter(
    (s) => s.espacioId === spaceId && s.visible !== false,
  );
  const zones = (document.zones ?? []).filter(
    (z) => z.espacioId === spaceId && z.visible !== false,
  );
  const walls = (document.walls ?? []).filter((w) => w.espacioId === spaceId);
  const structural = (document.structuralElements ?? []).filter(
    (e) => e.espacioId === spaceId,
  );
  const landscape = (document.landscapeElements ?? []).filter(
    (e) => e.espacioId === spaceId && e.visible !== false,
  );
  const instances = (document.operationalElementInstances ?? []).filter(
    (i) => i.spaceId === spaceId && i.visible !== false,
  );

  const floorColor = espacio?.base?.floor?.color ?? "#e8eef2";

  useEffect(() => {
    if (!espacio?.id) return;
    logReadonlyMapGeometryDiag(
      buildReadonlyMapGeometryDiag({
        document,
        espacioId: espacio.id,
      }),
    );
  }, [document, espacio?.id]);

  return (
    <div
      className={["hostly-sala-published-readonly", className]
        .filter(Boolean)
        .join(" ")}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        ...style,
      }}
      data-hostly-readonly-map="v2-published"
      data-hostly-coordinate-scale={String(coordinateScale)}
    >
      <div
        className="hostly-sala-published-readonly__stage"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: displayLayout.stageWidth,
          height: displayLayout.stageHeight,
          background: floorColor,
          transformOrigin: "0 0",
        }}
      >
        {surfaces.map((s) => {
          const box = scaleLogicalElementBox(
            {
              x: s.x,
              y: s.y,
              width: s.width,
              height: s.height,
              rotation: 0,
            },
            coordinateScale,
          );
          return (
            <div
              key={s.id}
              className="hostly-sala-surface-object"
              data-material={s.material}
              aria-hidden
              style={{
                position: "absolute",
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                pointerEvents: "none",
                zIndex: 1,
              }}
            />
          );
        })}

        {zones.map((z) => {
          const box = scaleLogicalElementBox(
            {
              x: z.x,
              y: z.y,
              width: z.width,
              height: z.height,
              rotation: 0,
            },
            coordinateScale,
          );
          return (
            <div
              key={z.id}
              aria-hidden
              style={{
                position: "absolute",
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                background: z.color || "rgba(59,130,246,0.12)",
                border: "1px solid rgba(59,130,246,0.28)",
                borderRadius: 8,
                pointerEvents: "none",
                zIndex: 2,
              }}
            />
          );
        })}

        <svg
          aria-hidden
          width={displayLayout.stageWidth}
          height={displayLayout.stageHeight}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          {walls.map((w) => {
            const scaled = scaleEditorWallSegment(w, coordinateScale);
            return (
              <line
                key={w.id}
                x1={scaled.x1}
                y1={scaled.y1}
                x2={scaled.x2}
                y2={scaled.y2}
                stroke="rgba(30,41,59,0.85)"
                strokeWidth={SALA_WALL_STROKE_WIDTH}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {structural.map((el) => {
          const box = scaleLogicalElementBox(
            {
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height,
              rotation: el.rotation ?? 0,
            },
            coordinateScale,
          );
          return (
            <div
              key={el.id}
              aria-hidden
              style={{
                position: "absolute",
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                transform: box.rotation
                  ? `rotate(${box.rotation}deg)`
                  : undefined,
                transformOrigin: "center center",
                pointerEvents: "none",
                zIndex: 4,
              }}
            >
              <SalaStructuralToolVisual
                kind={el.kind as SalaStructuralElementKind}
              />
            </div>
          );
        })}

        {landscape.map((el) => {
          const box = scaleLogicalElementBox(
            {
              x: el.x,
              y: el.y,
              width: el.width,
              height: el.height,
              rotation: 0,
            },
            coordinateScale,
          );
          return (
            <div
              key={el.id}
              className={[
                "hostly-sala-landscape-element",
                landscapeClass(el.kind),
              ].join(" ")}
              aria-hidden
              style={{
                position: "absolute",
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                pointerEvents: "none",
                zIndex: 5,
              }}
            />
          );
        })}

        {instances.map((instance) => {
          const layout = resolveOperationalInstanceDisplayLayout(
            instance,
            coordinateScale,
          );
          const tableId = resolveInstanceLegacyTableId(instance);
          if (tableId && hiddenSet.has(tableId)) return null;
          const overlay = tableId ? overlaysByTableId[tableId] : undefined;
          const selected =
            Boolean(selectedTableId && tableId === selectedTableId) ||
            Boolean(overlay?.selected);
          const tone = overlayTone(overlay);
          const orderable =
            instance.elementType === "TABLE" ||
            instance.elementType === "HIGH_TABLE" ||
            instance.elementType === "SUNBED" ||
            instance.elementType === "BALINESE_BED" ||
            instance.elementType === "SOFA" ||
            instance.elementType === "CUSTOM";
          const linked =
            Boolean(tableId) &&
            (interactiveSet == null || interactiveSet.has(tableId));
          const interactive = orderable && linked && Boolean(tableId);
          const isGroupedPrimary =
            Boolean(tableId) && groupedPrimarySet.has(tableId);
          const clusterMain = tableId
            ? String(
                mapJoinClusterMainIdByTableId[tableId] ?? tableId,
              ).trim()
            : "";

          const visual = (
            <>
              <SalaOperationalElementVisual
                elementType={instance.elementType}
                label={instance.name}
                color={
                  tone === "busy"
                    ? "#3b82f6"
                    : tone === "reserved"
                      ? "#8b5cf6"
                      : tone === "attention"
                        ? "#eab308"
                        : tone === "critical"
                          ? "#ef4444"
                          : tone === "delayed"
                            ? "#f97316"
                            : "#22c55e"
                }
                visualVariant={layout.variant}
              />
              {overlay?.groupBadge ? (
                <span
                  className="hostly-sala-published-readonly__badge"
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    fontSize: 10,
                    fontWeight: 700,
                    background: "rgba(15,23,42,0.88)",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "2px 6px",
                    pointerEvents: "none",
                  }}
                >
                  {overlay.groupBadge}
                </span>
              ) : null}
              {overlay?.durationLabel ? (
                <span
                  style={{
                    position: "absolute",
                    bottom: 4,
                    left: 4,
                    fontSize: 9,
                    fontWeight: 650,
                    background: "rgba(255,255,255,0.9)",
                    borderRadius: 4,
                    padding: "1px 4px",
                    pointerEvents: "none",
                  }}
                >
                  {overlay.durationLabel}
                </span>
              ) : null}
            </>
          );

          const boxStyle: CSSProperties = {
            position: "absolute",
            left: layout.x,
            top: layout.y,
            width: layout.width,
            height: layout.height,
            transform: layout.rotation
              ? `rotate(${layout.rotation}deg)`
              : undefined,
            transformOrigin: "center center",
            zIndex: 10,
            padding: 0,
            border: "none",
            background: "transparent",
          };

          if (!orderable || !tableId) {
            return (
              <div
                key={instance.id}
                className="hostly-sala-published-readonly__op"
                data-element-type={instance.elementType}
                aria-hidden
                style={{ ...boxStyle, pointerEvents: "none" }}
              >
                {visual}
              </div>
            );
          }

          return (
            <MapTableJoinSplitShell
              key={instance.id}
              tableId={tableId}
              instanceId={instance.id}
              logSource="v2-published"
              disabled={!interactive}
              onTableClick={interactive ? onTableClick : undefined}
              mapJoinDragEnabled={interactive && mapJoinDragEnabled}
              onMapTableJoinDrop={
                interactive ? onMapTableJoinDrop : undefined
              }
              mapJoinClusterMainId={clusterMain || tableId}
              isMapGroupedPrimary={interactive && isGroupedPrimary}
              onRequestSeparateGroupedTables={
                interactive ? onRequestSeparateGroupedTables : undefined
              }
              groupedTotalTablesLabel={
                groupedTotalTablesLabelByTableId[tableId] ?? null
              }
              previewWidth={layout.width}
              previewHeight={layout.height}
              className="hostly-sala-published-readonly__op"
              style={{
                ...boxStyle,
                pointerEvents: "auto",
              }}
            >
              <div
                data-tpv-tone={tone}
                data-tpv-selected={selected ? "1" : "0"}
                data-element-type={instance.elementType}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  pointerEvents: "none",
                }}
              >
                {visual}
              </div>
            </MapTableJoinSplitShell>
          );
        })}
      </div>
    </div>
  );
}
