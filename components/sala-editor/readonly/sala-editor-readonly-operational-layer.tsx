"use client";

import type {
  PointerEvent as ReactPointerEvent,
} from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { getOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { projectOperationalElement } from "@/lib/sala-editor/geometry/v2-geometry-projection";
import { resolveOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaOperationalElementVisual } from "@/components/sala-editor/panels/sala-operational-element-visual";
import { tableOperationalAccentColor } from "@/lib/map/table-operational-visual-tokens";

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

const LEGACY_INTERACTION_SELECTOR =
  '[data-hostly-map-interaction-only="1"][data-hostly-map-table-id]';

function readLegacyTableId(instance: OperationalElementInstance): string {
  const raw = instance.metadata.legacyTableId;
  return typeof raw === "string" ? raw.trim() : "";
}

function findLegacyInteractionElement(legacyTableId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const targetId = legacyTableId.trim();
  if (!targetId) return null;

  const candidates = document.querySelectorAll<HTMLElement>(
    LEGACY_INTERACTION_SELECTOR,
  );
  for (const candidate of candidates) {
    if (candidate.dataset.hostlyMapTableId?.trim() === targetId) {
      return candidate;
    }
  }
  return null;
}

function forwardPointerEventToLegacyController(
  legacyTableId: string,
  event: ReactPointerEvent<HTMLButtonElement>,
) {
  const target = findLegacyInteractionElement(legacyTableId);
  if (!target || typeof window === "undefined" || typeof window.PointerEvent !== "function") {
    return;
  }

  const forwarded = new window.PointerEvent(event.type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    isPrimary: event.isPrimary,
    width: event.width,
    height: event.height,
    pressure: event.pressure,
    tangentialPressure: event.tangentialPressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: event.button,
    buttons: event.buttons,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  });

  const accepted = target.dispatchEvent(forwarded);
  if (!accepted && event.cancelable) {
    event.preventDefault();
  }
}

function activateLegacyTableController(legacyTableId: string) {
  findLegacyInteractionElement(legacyTableId)?.click();
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
  const selectedLegacyTableIdSet = new Set(
    (selectedLegacyTableIds ?? [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );

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
        const accentColor = tableOperationalAccentColor(state);
        const isInteractiveTable =
          instance.elementType === "TABLE" && legacyTableId !== "";

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
              data-hostly-map-table={isInteractiveTable ? legacyTableId : undefined}
              data-hostly-map-table-id={isInteractiveTable ? legacyTableId : undefined}
              data-hostly-map-join-target={isInteractiveTable ? "1" : undefined}
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
                          // Algunos navegadores no permiten captura en eventos sintéticos.
                        }
                        forwardPointerEventToLegacyController(legacyTableId, event);
                      }
                    : undefined
                }
                onPointerMove={
                  isInteractiveTable
                    ? (event) =>
                        forwardPointerEventToLegacyController(legacyTableId, event)
                    : undefined
                }
                onPointerUp={
                  isInteractiveTable
                    ? (event) => {
                        forwardPointerEventToLegacyController(legacyTableId, event);
                        try {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        } catch {
                          // La captura puede haberse liberado por pointercancel.
                        }
                      }
                    : undefined
                }
                onPointerCancel={
                  isInteractiveTable
                    ? (event) => {
                        forwardPointerEventToLegacyController(legacyTableId, event);
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
                        activateLegacyTableController(legacyTableId);
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
