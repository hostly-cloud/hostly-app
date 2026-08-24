import type { Table } from "@/lib/firestore/tables";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import {
  getEditorV2NativeDecorativeIds,
  isLegacyDecorativeCoveredByEditorV2,
} from "@/lib/sala-editor/readonly/editor-v2-legacy-decorative-parity";

export type TpvV2LegacyResidualCoverage<TZone extends { id: string }> = {
  linkedOperationalIds: ReadonlySet<string>;
  linkedOperationalElements: Table[];
  residualLegacyElements: Table[];
  residualLegacyZones: TZone[] | undefined;
  fullyCovered: boolean;
};

function linkedOperationalIdsFromContract(
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

/**
 * Evalua de forma conservadora cuanto contenido historico sigue siendo necesario
 * despues de aplicar paridad exacta Editor V2.
 *
 * Nunca considera cubierto un objeto por nombre, tipo aproximado o posicion.
 */
export function evaluateTpvV2LegacyResidualCoverage<
  TZone extends { id: string },
>(params: {
  contract: EditorTpvReadonlyVisualContract;
  elements: Table[];
  zones?: TZone[];
}): TpvV2LegacyResidualCoverage<TZone> {
  const nativeDecorativeIds = new Set(
    getEditorV2NativeDecorativeIds(params.contract),
  );
  const linkedOperationalIds = linkedOperationalIdsFromContract(params.contract);
  const nativeZoneIds = new Set(
    params.contract.zones
      .map((zone) => String(zone.id ?? "").trim())
      .filter(Boolean),
  );

  const linkedOperationalElements: Table[] = [];
  const residualLegacyElements: Table[] = [];

  for (const element of params.elements) {
    if (
      nativeDecorativeIds.size > 0 &&
      isLegacyDecorativeCoveredByEditorV2(element, nativeDecorativeIds)
    ) {
      continue;
    }

    const elementId = String(element.id ?? "").trim();
    if (elementId && linkedOperationalIds.has(elementId)) {
      linkedOperationalElements.push(element);
      continue;
    }

    residualLegacyElements.push(element);
  }

  const residualLegacyZones =
    params.zones == null
      ? undefined
      : nativeZoneIds.size === 0
        ? params.zones
        : params.zones.filter(
            (zone) => !nativeZoneIds.has(String(zone.id ?? "").trim()),
          );

  return {
    linkedOperationalIds,
    linkedOperationalElements,
    residualLegacyElements,
    residualLegacyZones,
    fullyCovered:
      residualLegacyElements.length === 0 &&
      (residualLegacyZones?.length ?? 0) === 0,
  };
}
