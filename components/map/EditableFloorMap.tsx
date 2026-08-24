"use client";

import { Fragment, isValidElement, type ReactNode } from "react";
import { getDefaultSizeForPlanElementType } from "@/lib/firestore/tables";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import {
  getEditorV2NativeDecorativeIds,
  isLegacyDecorativeCoveredByEditorV2,
} from "@/lib/sala-editor/readonly/editor-v2-legacy-decorative-parity";
import { TpvV2OperationalParityProvider } from "@/lib/tpv/v2-operational-parity-context";
import {
  EditableFloorMap as LegacyEditableFloorMap,
  type EditableFloorMapProps,
} from "./legacy-editable-floor-map";

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

function getLinkedOperationalTableIds(
  contract: EditorTpvReadonlyVisualContract,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const instance of contract.operationalElementInstances) {
    const raw = instance.metadata.legacyTableId;
    const id = typeof raw === "string" ? raw.trim() : "";
    if (id) ids.add(id);
  }
  return ids;
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
 * - Editor y consumidores legacy siguen usando, byte a byte, la implementación
 *   histórica preservada en `legacy-editable-floor-map.tsx`.
 * - En readonly con underlay Editor V2, decorativos y zonas legacy con paridad
 *   exacta se eliminan antes de entrar al renderer histórico.
 * - Los elementos operativos enlazados montan sus controladores React fuera del
 *   mapa histórico y tampoco entran en su bucle de elementos.
 * - Cualquier objeto sin paridad demostrada se conserva.
 */
export function EditableFloorMap(props: EditableFloorMapProps) {
  if (props.editable || !props.readonlyUnderlay) {
    return <LegacyEditableFloorMap {...props} />;
  }

  const contract = readEditorV2ContractFromUnderlay(props.readonlyUnderlay);
  if (!contract) {
    return <LegacyEditableFloorMap {...props} />;
  }

  const nativeDecorativeIds = new Set(getEditorV2NativeDecorativeIds(contract));
  const decorFilteredElements =
    nativeDecorativeIds.size === 0
      ? props.elements
      : props.elements.filter(
          (element) =>
            !isLegacyDecorativeCoveredByEditorV2(element, nativeDecorativeIds),
        );

  const nativeZoneIds = new Set(
    contract.zones.map((zone) => String(zone.id ?? "").trim()).filter(Boolean),
  );
  const filteredZones =
    props.zones == null || nativeZoneIds.size === 0
      ? props.zones
      : props.zones.filter((zone) => !nativeZoneIds.has(String(zone.id).trim()));
  const linkedOperationalIds = getLinkedOperationalTableIds(contract);
  const linkedOperationalElements = decorFilteredElements.filter((element) =>
    linkedOperationalIds.has(String(element.id ?? "").trim()),
  );
  const residualLegacyElements = decorFilteredElements.filter(
    (element) => !linkedOperationalIds.has(String(element.id ?? "").trim()),
  );

  return (
    <TpvV2OperationalParityProvider operationalIds={linkedOperationalIds}>
      {linkedOperationalElements.map((element) => (
        <Fragment key={`v2-controller-${element.id}`}>
          {renderDetachedOperationalController(props, element)}
        </Fragment>
      ))}
      <LegacyEditableFloorMap
        {...props}
        elements={residualLegacyElements}
        zones={filteredZones}
      />
    </TpvV2OperationalParityProvider>
  );
}
