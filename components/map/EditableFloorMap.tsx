"use client";

import { Fragment, isValidElement, type ReactNode } from "react";
import { getDefaultSizeForPlanElementType } from "@/lib/firestore/tables";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import { TpvV2OperationalParityProvider } from "@/lib/tpv/v2-operational-parity-context";
import { evaluateTpvV2LegacyResidualCoverage } from "@/lib/tpv/v2-legacy-residual-coverage";
import {
  EditableFloorMap as LegacyEditableFloorMap,
  type EditableFloorMapProps,
} from "./legacy-editable-floor-map";
import { TpvV2ReadonlyViewport } from "./tpv-v2-readonly-viewport";

export * from "./legacy-editable-floor-map";

function readEditorV2ContractFromUnderlay(
  readonlyUnderlay: ReactNode,
): EditorTpvReadonlyVisualContract | null {
  if (!isValidElement(readonlyUnderlay)) return null;

  const candidate = (readonlyUnderlay.props as { contract?: unknown }).contract;
  if (typeof candidate !== "object" || candidate === null) return null;

  const contract = candidate as Partial<EditorTpvReadonlyVisualContract>;
  if (
    !Array.isArray(contract.surfaces) ||
    !Array.isArray(contract.zones) ||
    !Array.isArray(contract.walls) ||
    !Array.isArray(contract.wallAttachments) ||
    !Array.isArray(contract.structuralElements) ||
    !Array.isArray(contract.landscapeElements) ||
    !Array.isArray(contract.operationalElementInstances)
  ) {
    return null;
  }

  return candidate as EditorTpvReadonlyVisualContract;
}

function renderDetachedOperationalController(
  props: EditableFloorMapProps,
  element: EditableFloorMapProps["elements"][number],
): ReactNode {
  if (!props.renderElement) return null;

  const elementId = String(element.id ?? "").trim();
  if (!elementId) return null;
  const defaults = getDefaultSizeForPlanElementType(element.type);
  const mapTileWidth =
    typeof element.width === "number" && Number.isFinite(element.width)
      ? element.width
      : defaults.width;
  const mapTileHeight =
    typeof element.height === "number" && Number.isFinite(element.height)
      ? element.height
      : defaults.height;

  return props.renderElement({
    element,
    elementId,
    mapLayoutX:
      typeof element.x === "number" && Number.isFinite(element.x) ? element.x : 0,
    mapLayoutY:
      typeof element.y === "number" && Number.isFinite(element.y) ? element.y : 0,
    mapTileWidth,
    mapTileHeight,
  });
}

/**
 * Fachada de compatibilidad.
 *
 * Editor y consumidores sin contrato V2 siguen delegando al renderer historico.
 * Un TPV readonly con contrato V2 valido, en cambio, monta siempre el viewport
 * V2 nativo. La cobertura residual se expone como diagnostico fail-closed y ya
 * no provoca que el mapa historico vuelva a entrar en el arbol del TPV.
 */
export function EditableFloorMap(props: EditableFloorMapProps) {
  if (props.editable || !props.readonlyUnderlay) {
    return <LegacyEditableFloorMap {...props} />;
  }

  const contract = readEditorV2ContractFromUnderlay(props.readonlyUnderlay);
  if (!contract) {
    return <LegacyEditableFloorMap {...props} />;
  }

  const coverage = evaluateTpvV2LegacyResidualCoverage({
    contract,
    elements: props.elements,
    zones: props.zones,
  });

  return (
    <TpvV2OperationalParityProvider
      operationalIds={coverage.linkedOperationalIds}
    >
      {coverage.linkedOperationalElements.map((element) => (
        <Fragment key={`v2-controller-${element.id}`}>
          {renderDetachedOperationalController(props, element)}
        </Fragment>
      ))}

      <span
        hidden
        data-hostly-v2-coverage={coverage.fullyCovered ? "complete" : "incomplete"}
        data-hostly-v2-residual-elements={coverage.residualLegacyElements.length}
        data-hostly-v2-residual-zones={coverage.residualLegacyZones?.length ?? 0}
      />

      <TpvV2ReadonlyViewport
        {...props}
        className={[props.className, "hostly-v2-native-viewport"]
          .filter(Boolean)
          .join(" ")}
      />
    </TpvV2OperationalParityProvider>
  );
}
