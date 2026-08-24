"use client";

import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { getOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { projectOperationalElement } from "@/lib/sala-editor/geometry/v2-geometry-projection";
import { resolveOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaOperationalElementVisual } from "@/components/sala-editor/panels/sala-operational-element-visual";
import { tableOperationalAccentColor } from "@/lib/map/table-operational-visual-tokens";
import {
  getTpvV2TableController,
  HOSTLY_V2_TABLE_CONTROLLER_REGISTRY_CHANGE,
} from "@/lib/tpv/v2-table-controller-registry";

export type SalaEditorReadonlyTpvOperationalState =
  | "libre"
  | "ocupada"
  | "reservada"
  | "atencion"
  | "critica"
  | "retrasada"
  | "seleccionada";

export type SalaEditorReadonlyOperationalLayerProps = {
  instances: OperationalElementInstance[];
  stateByInstanceId?: Record<string, SalaEditorReadonlyTpvOperationalState>;
  stateByLegacyTableId?: Record<string, SalaEditorReadonlyTpvOperationalState>;
  selectedLegacyTableIds?: readonly string[];
  onLegacyTableClick?: (legacyTableId: string, instanceId: string) => void;
};

const HOSTLY_MAP_JOIN_DRAG_HOVER = "hostly-map-join-drag-hover";
const HOSTLY_MAP_JOIN_DRAG_END = "hostly-map-join-drag-end";

type HostlyMapJoinDragHoverDetail = {
  hoverTableId: string | null;
  draggedTableId: string;
  draggedClusterMain: string;
};

function readLegacyTableId(instance: OperationalElementInstance): string {
  const raw = instance.metadata.legacyTableId;
  return typeof raw === "string" ? raw.trim() : "";
}

function forwardPointerToRegisteredController(
  legacyTableId: string,
  event: ReactPointerEvent<HTMLButtonElement>,
  phase: "down" | "move" | "up" | "cancel",
) {
  const controller = getTpvV2TableController(legacyTableId);
  if (!controller) return;

  const nativeEvent = event.nativeEvent;
  if (phase === "down") controller.onPointerDown(nativeEvent);
  else if (phase === "move") controller.onPointerMove(nativeEvent);
  else if (phase === "up") controller.onPointerUp(nativeEvent);
  else controller.onPointerCancel(nativeEvent);
}

function resolveReadonlyOperationalState(
  instance: OperationalElementInstance,
  stateByInstanceId: Record<string, SalaEditorReadonlyTpvOperationalState> | undefined,
  stateByLegacyTableId: Record<string, SalaEditorReadonlyTpvOperationalState> | undefined,
): SalaEditorReadonlyTpvOperationalState | null {
  const byInstance = stateByInstanceId?.[instance.id];
  if (byInstance) return byInstance;
  const legacyTableId = readLegacyTableId(instance);
  if (!legacyTableId) return null;
  return stateByLegacyTableId?.[legacyTableId] ?? null;
}

export function SalaEditorReadonlyOperationalLayer({
  instances,
  stateByInstanceId,
  stateByLegacyTableId,
  selectedLegacyTableIds,
  onLegacyTableClick,
}: SalaEditorReadonlyOperationalLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const [joinHoverTableId, setJoinHoverTableId] = useState<string | null>(null);
  const [, setControllerRegistryRevision] = useState(0);
  const selectedLegacyTableIdSet = new Set(
    (selectedLegacyTableIds ?? [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );

  useEffect(() => {
    const onRegistryChange = () => {
      setControllerRegistryRevision((revision) => revision + 1);
    };
    document.addEventListener(
      HOSTLY_V2_TABLE_CONTROLLER_REGISTRY_CHANGE,
      onRegistryChange,
    );
    return () => {
      document.removeEventListener(
        HOSTLY_V2_TABLE_CONTROLLER_REGISTRY_CHANGE,
        onRegistryChange,
      );
    };
  }, []);

  useEffect(() => {
    const onJoinHover = (event: Event) => {
      const detail = (event as CustomEvent<HostlyMapJoinDragHoverDetail>).detail;
      setJoinHoverTableId(detail?.hoverTableId?.trim() || null);
    };
    const onJoinEnd = () => setJoinHoverTableId(null);

    document.addEventListener(HOSTLY_MAP_JOIN_DRAG_HOVER, onJoinHover);
    document.addEventListener(HOSTLY_MAP_JOIN_DRAG_END, onJoinEnd);
    return () => {
      document.removeEventListener(HOSTLY_MAP_JOIN_DRAG_HOVER, onJoinHover);
      document.removeEventListener(HOSTLY_MAP_JOIN_DRAG_END, onJoinEnd);
    };
  }, []);

  return (
    <div className="hostly-sala-operational-layer is-readonly">
      {instances.map((instance) => {
        const instanceCatalog = getOperationalElementCatalogItem(instance.elementType);
        const size = getOperationalInstanceCanvasSize(instance);
        const geometry = projectOperationalElement(instance, {
          coordinateScale,
          size,
        });
        const visualVariant = resolveOperationalVisualVariant(
          instance.metadata,
          instance.elementType,
        );
        const state = resolveReadonlyOperationalState(
          instance,
          stateByInstanceId,
          stateByLegacyTableId,
        );
        const legacyTableId = readLegacyTableId(instance);
        const isSelected =
          legacyTableId !== "" && selectedLegacyTableIdSet.has(legacyTableId);
        const isJoinTarget =
          legacyTableId !== "" && legacyTableId === joinHoverTableId;
        const accentColor = tableOperationalAccentColor(state);
        const isInteractiveTable =
          instance.elementType === "TABLE" && legacyTableId !== "";
        const controller = isInteractiveTable
          ? getTpvV2TableController(legacyTableId)
          : null;
        const joinEnabled = controller?.joinEnabled === true;

        return (
          <div
            key={instance.id}
            className="absolute"
            style={{
              left: geometry.x,
              top: geometry.y,
            }}
          >
            <div
              className={[
                "hostly-sala-canvas-object",
                isSelected || state === "seleccionada" ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-hostly-tpv-operational-state={state ?? undefined}
              data-hostly-v2-table-instance-id={
                instance.elementType === "TABLE" ? instance.id : undefined
              }
              data-hostly-v2-legacy-table-id={legacyTableId || undefined}
              data-hostly-v2-controller={controller ? "memory" : undefined}
              data-hostly-v2-join-target={isJoinTarget ? "1" : undefined}
              data-hostly-map-table={isInteractiveTable ? legacyTableId : undefined}
              data-hostly-map-table-id={isInteractiveTable ? legacyTableId : undefined}
              data-hostly-map-join-target={isInteractiveTable ? "1" : undefined}
              data-hostly-map-join={joinEnabled ? "1" : undefined}
              style={{
                width: geometry.width,
                height: geometry.height,
                transform:
                  geometry.rotation !== 0
                    ? `rotate(${geometry.rotation}deg)`
                    : undefined,
                transformOrigin: "center center",
                zIndex: instance.elementType === "TABLE" ? 24 : 18,
                pointerEvents: isInteractiveTable ? "auto" : "none",
                outline: isJoinTarget ? "3px solid rgba(49, 95, 125, 0.42)" : undefined,
                outlineOffset: isJoinTarget ? 4 : undefined,
                borderRadius: isJoinTarget ? 14 : undefined,
                transition: "outline-color 120ms ease, outline-offset 120ms ease",
              }}
            >
              <button
                type="button"
                aria-label={
                  isInteractiveTable ? `Abrir ${instance.name}` : undefined
                }
                tabIndex={isInteractiveTable ? 0 : -1}
                disabled={!isInteractiveTable}
                onPointerDown={
                  isInteractiveTable
                    ? (event) => {
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          // Algunos navegadores no permiten captura en todos los casos.
                        }
                        forwardPointerToRegisteredController(
                          legacyTableId,
                          event,
                          "down",
                        );
                      }
                    : undefined
                }
                onPointerMove={
                  isInteractiveTable
                    ? (event) =>
                        forwardPointerToRegisteredController(
                          legacyTableId,
                          event,
                          "move",
                        )
                    : undefined
                }
                onPointerUp={
                  isInteractiveTable
                    ? (event) => {
                        forwardPointerToRegisteredController(
                          legacyTableId,
                          event,
                          "up",
                        );
                        try {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        } catch {
                          // La captura puede haberse liberado antes.
                        }
                      }
                    : undefined
                }
                onPointerCancel={
                  isInteractiveTable
                    ? (event) => {
                        forwardPointerToRegisteredController(
                          legacyTableId,
                          event,
                          "cancel",
                        );
                        try {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        } catch {
                          // La captura puede no existir.
                        }
                      }
                    : undefined
                }
                onClick={
                  isInteractiveTable
                    ? () => {
                        if (onLegacyTableClick) {
                          onLegacyTableClick(legacyTableId, instance.id);
                          return;
                        }
                        getTpvV2TableController(legacyTableId)?.onClick();
                      }
                    : undefined
                }
                className="hostly-sala-canvas-object__body"
                style={{
                  width: "100%",
                  height: "100%",
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  cursor: isInteractiveTable ? "pointer" : "default",
                  pointerEvents: isInteractiveTable ? "auto" : "none",
                  touchAction: isInteractiveTable ? "none" : undefined,
                }}
              >
                <SalaOperationalElementVisual
                  elementType={instance.elementType}
                  label={instance.name}
                  color={accentColor ?? instanceCatalog?.color ?? "#315f7d"}
                  visualVariant={visualVariant}
                  seatCount={instance.capacity}
                  canvasSize={{ width: geometry.width, height: geometry.height }}
                />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
