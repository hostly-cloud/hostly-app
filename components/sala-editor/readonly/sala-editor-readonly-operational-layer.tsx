"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
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
  getTpvV2TableControllerRegistryRevision,
  subscribeTpvV2TableControllerRegistry,
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
  stateByTableId?: Record<string, SalaEditorReadonlyTpvOperationalState>;
  selectedTableIds?: readonly string[];
  onTableClick?: (tableId: string, instanceId: string) => void;
};

const HOSTLY_MAP_JOIN_DRAG_HOVER = "hostly-map-join-drag-hover";
const HOSTLY_MAP_JOIN_DRAG_END = "hostly-map-join-drag-end";

type HostlyMapJoinDragHoverDetail = {
  hoverTableId: string | null;
  draggedTableId: string;
  draggedClusterMain: string;
};

/**
 * Compatibilidad de datos: Editor V2 conserva hoy el enlace al documento
 * operativo Firestore en metadata.legacyTableId. Desde este borde se trata
 * simplemente como tableId, independientemente del tipo visual del objeto.
 */
function readOperationalTableId(instance: OperationalElementInstance): string {
  const raw = instance.metadata.legacyTableId;
  return typeof raw === "string" ? raw.trim() : "";
}

function forwardPointerToRegisteredController(
  tableId: string,
  event: ReactPointerEvent<HTMLButtonElement>,
  phase: "down" | "move" | "up" | "cancel",
) {
  const controller = getTpvV2TableController(tableId);
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
  stateByTableId: Record<string, SalaEditorReadonlyTpvOperationalState> | undefined,
): SalaEditorReadonlyTpvOperationalState | null {
  const byInstance = stateByInstanceId?.[instance.id];
  if (byInstance) return byInstance;
  const tableId = readOperationalTableId(instance);
  if (!tableId) return null;
  return stateByTableId?.[tableId] ?? null;
}

export function SalaEditorReadonlyOperationalLayer({
  instances,
  stateByInstanceId,
  stateByTableId,
  selectedTableIds,
  onTableClick,
}: SalaEditorReadonlyOperationalLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const [joinHoverTableId, setJoinHoverTableId] = useState<string | null>(null);
  useSyncExternalStore(
    subscribeTpvV2TableControllerRegistry,
    getTpvV2TableControllerRegistryRevision,
    getTpvV2TableControllerRegistryRevision,
  );

  const selectedTableIdSet = new Set(
    (selectedTableIds ?? [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );

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
          stateByTableId,
        );
        const tableId = readOperationalTableId(instance);
        const controller = tableId !== "" ? getTpvV2TableController(tableId) : null;
        const isLinkedOperationalElement = tableId !== "" && controller != null;
        const isSelected = isLinkedOperationalElement && selectedTableIdSet.has(tableId);
        const isJoinTarget = isLinkedOperationalElement && tableId === joinHoverTableId;
        const accentColor = tableOperationalAccentColor(state);
        const joinEnabled = controller?.joinEnabled === true;

        return (
          <div
            key={instance.id}
            className="absolute"
            style={{ left: geometry.x, top: geometry.y }}
          >
            <div
              className={[
                "hostly-sala-canvas-object",
                isSelected || state === "seleccionada" ? "is-selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-hostly-tpv-operational-state={state ?? undefined}
              data-hostly-v2-operational-instance-id={
                isLinkedOperationalElement ? instance.id : undefined
              }
              data-hostly-v2-table-instance-id={
                instance.elementType === "TABLE" ? instance.id : undefined
              }
              data-hostly-v2-table-id={isLinkedOperationalElement ? tableId : undefined}
              data-hostly-v2-controller={controller ? "memory" : undefined}
              data-hostly-v2-join-target={isJoinTarget ? "1" : undefined}
              data-hostly-map-table={isLinkedOperationalElement ? tableId : undefined}
              data-hostly-map-table-id={isLinkedOperationalElement ? tableId : undefined}
              data-hostly-map-join-target={isLinkedOperationalElement ? "1" : undefined}
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
                pointerEvents: isLinkedOperationalElement ? "auto" : "none",
                outline: isJoinTarget
                  ? "3px solid rgba(49, 95, 125, 0.42)"
                  : undefined,
                outlineOffset: isJoinTarget ? 4 : undefined,
                borderRadius: isJoinTarget ? 14 : undefined,
                transition: "outline-color 120ms ease, outline-offset 120ms ease",
              }}
            >
              <button
                type="button"
                aria-label={
                  isLinkedOperationalElement
                    ? controller?.ariaLabel || `Abrir ${instance.name}`
                    : undefined
                }
                tabIndex={isLinkedOperationalElement ? 0 : -1}
                disabled={!isLinkedOperationalElement}
                onPointerDown={
                  isLinkedOperationalElement
                    ? (event) => {
                        try {
                          event.currentTarget.setPointerCapture(event.pointerId);
                        } catch {
                          // Algunos navegadores no permiten captura en todos los casos.
                        }
                        forwardPointerToRegisteredController(tableId, event, "down");
                      }
                    : undefined
                }
                onPointerMove={
                  isLinkedOperationalElement
                    ? (event) =>
                        forwardPointerToRegisteredController(tableId, event, "move")
                    : undefined
                }
                onPointerUp={
                  isLinkedOperationalElement
                    ? (event) => {
                        forwardPointerToRegisteredController(tableId, event, "up");
                        try {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        } catch {
                          // La captura puede haberse liberado antes.
                        }
                      }
                    : undefined
                }
                onPointerCancel={
                  isLinkedOperationalElement
                    ? (event) => {
                        forwardPointerToRegisteredController(tableId, event, "cancel");
                        try {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        } catch {
                          // La captura puede no existir.
                        }
                      }
                    : undefined
                }
                onClick={
                  isLinkedOperationalElement
                    ? () => {
                        if (onTableClick) {
                          onTableClick(tableId, instance.id);
                          return;
                        }
                        controller.onClick();
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
                  cursor: isLinkedOperationalElement ? "pointer" : "default",
                  pointerEvents: isLinkedOperationalElement ? "auto" : "none",
                  touchAction: isLinkedOperationalElement ? "none" : undefined,
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
