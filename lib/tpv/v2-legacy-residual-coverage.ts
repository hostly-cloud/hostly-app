import type { Table, PlanElementType } from "@/lib/firestore/tables";
import type { EditorTpvReadonlyVisualContract } from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";

export type TpvV2LegacyResidualCoverage<TZone extends { id: string }> = {
  linkedOperationalIds: ReadonlySet<string>;
  linkedOperationalElements: Table[];
  residualLegacyElements: Table[];
  residualLegacyZones: TZone[] | undefined;
  fullyCovered: boolean;
};

const LEGACY_DECORATIVE_TYPES: ReadonlySet<PlanElementType> = new Set([
  "wall",
  "bar",
  "column",
  "pool",
  "door",
  "planter",
]);

function isLegacyDecorativeType(type: PlanElementType): boolean {
  return LEGACY_DECORATIVE_TYPES.has(type);
}

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
 * TPV V2 readiness only cares about operational identity parity.
 *
 * Geometry, zones, walls, surfaces and decorative content belong exclusively to
 * Editor V2 and must never be validated against, hidden by, or reconstructed
 * from the historical floor-plan projection. Legacy rows are retained here only
 * as operational controllers while the table identity migration is completed.
 *
 * Important: this module deliberately avoids runtime imports from the Firestore
 * table repository. The TPV V2 renderer is client-side infrastructure and must
 * remain free of Firebase initialization/circular module side effects.
 */
export function evaluateTpvV2LegacyResidualCoverage<
  TZone extends { id: string },
>(params: {
  contract: EditorTpvReadonlyVisualContract;
  elements: Table[];
  zones?: TZone[];
}): TpvV2LegacyResidualCoverage<TZone> {
  const linkedOperationalIds = linkedOperationalIdsFromContract(params.contract);
  const linkedOperationalElements: Table[] = [];
  const residualLegacyElements: Table[] = [];

  for (const element of params.elements) {
    if (isLegacyDecorativeType(element.type)) {
      continue;
    }

    const elementId = String(element.id ?? "").trim();
    if (elementId && linkedOperationalIds.has(elementId)) {
      linkedOperationalElements.push(element);
      continue;
    }

    residualLegacyElements.push(element);
  }

  // Zones are visual geometry owned by Editor V2. Historical zone rows no
  // longer participate in V2 renderer readiness or parity decisions.
  const residualLegacyZones = params.zones == null ? undefined : [];

  return {
    linkedOperationalIds,
    linkedOperationalElements,
    residualLegacyElements,
    residualLegacyZones,
    fullyCovered: residualLegacyElements.length === 0,
  };
}
