"use client";

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
};

function readLegacyTableId(instance: OperationalElementInstance): string {
  const raw = instance.metadata.legacyTableId;
  return typeof raw === "string" ? raw.trim() : "";
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
}: SalaEditorReadonlyOperationalLayerProps) {
  const canvasViewport = useCanvasViewport();
  const coordinateScale = canvasViewport?.coordinateScale ?? 1;
  const selectedLegacyTableIdSet = new Set(
    (selectedLegacyTableIds ?? [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean),
  );

  return (
    <div className="hostly-sala-operational-layer is-readonly" aria-hidden>
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
              style={{
                width: geometry.width,
                height: geometry.height,
                transform: geometry.rotation !== 0 ? `rotate(${geometry.rotation}deg)` : undefined,
                transformOrigin: "center center",
                zIndex: instance.elementType === "TABLE" ? 24 : 18,
                pointerEvents: "none",
              }}
            >
              <div
                className="hostly-sala-canvas-object__body"
                style={{
                  cursor: "default",
                  pointerEvents: "none",
                }}
              >
                <SalaOperationalElementVisual
                  elementType={instance.elementType}
                  label={instance.name}
                  color={accentColor ?? instanceCatalog?.color ?? "#315f7d"}
                  visualVariant={visualVariant}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
