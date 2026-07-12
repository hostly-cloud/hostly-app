"use client";

import type { CSSProperties } from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { getOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import { projectOperationalElement } from "@/lib/sala-editor/geometry/v2-geometry-projection";
import { resolveOperationalVisualVariant } from "@/lib/sala-editor/ose/operational-visual-variant";
import { useCanvasViewport } from "@/components/sala-editor/canvas/canvas-viewport-context";
import { SalaOperationalElementVisual } from "@/components/sala-editor/panels/sala-operational-element-visual";

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

function stateChrome(
  state: SalaEditorReadonlyTpvOperationalState | null,
): Pick<CSSProperties, "boxShadow" | "filter"> {
  switch (state) {
    case "critica":
      return {
        boxShadow:
          "0 0 0 3px rgba(185, 76, 70, 0.22), 0 0 0 1px rgba(185, 76, 70, 0.68)",
      };
    case "retrasada":
      return {
        boxShadow:
          "0 0 0 3px rgba(217, 119, 6, 0.2), 0 0 0 1px rgba(217, 119, 6, 0.58)",
      };
    case "atencion":
      return {
        boxShadow:
          "0 0 0 3px rgba(184, 121, 34, 0.16), 0 0 0 1px rgba(184, 121, 34, 0.5)",
      };
    case "ocupada":
      return {
        boxShadow:
          "0 0 0 2px rgba(37, 73, 90, 0.14), 0 0 0 1px rgba(37, 73, 90, 0.42)",
      };
    case "reservada":
      return {
        boxShadow:
          "0 0 0 2px rgba(81, 66, 95, 0.13), 0 0 0 1px rgba(81, 66, 95, 0.38)",
      };
    case "libre":
    case "seleccionada":
    case null:
      return {};
  }
}

function stateAccentColor(state: SalaEditorReadonlyTpvOperationalState | null): string | null {
  switch (state) {
    case "seleccionada":
      return "#0ea5e9";
    case "critica":
      return "#b94c46";
    case "retrasada":
      return "#d97706";
    case "atencion":
      return "#b87922";
    case "ocupada":
      return "#25495a";
    case "reservada":
      return "#51425f";
    case "libre":
      return "#264f34";
    case null:
      return null;
  }
}

function stateDotColor(state: SalaEditorReadonlyTpvOperationalState | null): string | null {
  if (!state || state === "libre") return null;
  return stateAccentColor(state);
}

function selectedChrome(selected: boolean): Pick<CSSProperties, "boxShadow"> {
  if (!selected) return {};
  return {
    boxShadow:
      "0 0 0 3px rgba(14, 165, 233, 0.22), 0 0 0 1px rgba(14, 165, 233, 0.62)",
  };
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
        const accentColor = stateAccentColor(state);
        const dotColor = stateDotColor(state);

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
                ...stateChrome(state),
                ...selectedChrome(isSelected || state === "seleccionada"),
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
              {dotColor ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    right: -3,
                    top: -3,
                    width: 9,
                    height: 9,
                    borderRadius: 999,
                    background: dotColor,
                    border: "1px solid rgba(255,255,255,0.92)",
                    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.18)",
                  }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
