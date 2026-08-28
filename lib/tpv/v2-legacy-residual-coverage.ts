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
 * Evalua solo la compatibilidad operativa que todavia necesita el TPV.
 *
 * Editor V2 es la unica fuente visual/geometrica. Por tanto, decorativos y zonas
 * legacy nunca bloquean readiness ni participan en la paridad visual. Los IDs
 * legacy se conservan temporalmente unicamente para enlazar controladores de mesa.
 *
 * Este modulo usa solo imports type-only desde Firestore para evitar inicializacion
 * Firebase/ciclos en el runtime cliente del renderer V2.
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

  // Las zonas legacy ya no forman parte del contrato visual del TPV V2.
  const residualLegacyZones = params.zones == null ? undefined : [];

  return {
    linkedOperationalIds,
    linkedOperationalElements,
    residualLegacyElements,
    residualLegacyZones,
    fullyCovered: residualLegacyElements.length === 0,
  };
}
