"use client";

import { isValidElement, type ReactNode } from "react";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import {
  getEditorV2NativeDecorativeIds,
  isLegacyDecorativeCoveredByEditorV2,
} from "@/lib/sala-editor/readonly/editor-v2-legacy-decorative-parity";
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
    !Array.isArray(contract.walls) ||
    !Array.isArray(contract.wallAttachments) ||
    !Array.isArray(contract.structuralElements) ||
    !Array.isArray(contract.landscapeElements)
  ) {
    return null;
  }

  return candidate as EditorTpvReadonlyVisualContract;
}

/**
 * Fachada de compatibilidad.
 *
 * - Editor y consumidores legacy siguen usando, byte a byte, la implementación
 *   histórica preservada en `legacy-editable-floor-map.tsx`.
 * - En readonly con underlay Editor V2, los decorativos legacy con paridad
 *   exacta se eliminan antes de entrar al renderer histórico.
 * - Cualquier decorativo sin paridad demostrada se conserva.
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
  if (nativeDecorativeIds.size === 0) {
    return <LegacyEditableFloorMap {...props} />;
  }

  const filteredElements = props.elements.filter(
    (element) =>
      !isLegacyDecorativeCoveredByEditorV2(element, nativeDecorativeIds),
  );

  return <LegacyEditableFloorMap {...props} elements={filteredElements} />;
}
