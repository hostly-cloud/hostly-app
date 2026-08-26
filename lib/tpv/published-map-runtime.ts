import type { FloorPlan } from "@/lib/firestore/floorPlans";
import { getFloorPlans } from "@/lib/firestore/floorPlans";
import type { Table } from "@/lib/firestore/tables";
import { getTables } from "@/lib/firestore/tables";
import type { Zone as FirestoreZone } from "@/lib/firestore/zones";
import { getZones } from "@/lib/firestore/zones";
import { buildSalaEditorDocumentFromLegacy } from "@/lib/sala-editor/adapters/legacy-adapters";
import {
  buildEditorTpvReadonlyVisualContract,
  type EditorTpvReadonlyVisualContract,
} from "@/lib/sala-editor/readonly/editor-tpv-readonly-contract";
import { getEditorV2NativeDecorativeIds } from "@/lib/sala-editor/readonly/editor-v2-legacy-decorative-parity";

export type TpvPublishedMapRuntime = {
  restaurantId: string;
  contractsByFloorPlanId: ReadonlyMap<string, EditorTpvReadonlyVisualContract>;
  contractCount: number;
};

type MatchPublishedContractInput = {
  elements: readonly Table[];
  zones?: readonly { id: string; restaurantId?: string }[];
};

const runtimeByRestaurantId = new Map<string, TpvPublishedMapRuntime>();

function normalizeId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertTenantRows(
  restaurantId: string,
  rows: readonly { restaurantId?: string }[],
  label: string,
): void {
  for (const row of rows) {
    const rowRestaurantId = normalizeId(row.restaurantId);
    if (rowRestaurantId && rowRestaurantId !== restaurantId) {
      throw new Error(
        `TPV published map tenant mismatch in ${label}: expected ${restaurantId}`,
      );
    }
  }
}

function operationalFloorPlans(plans: readonly FloorPlan[]): FloorPlan[] {
  return plans.filter(
    (plan) => plan.active !== false && plan.showInTpv !== false,
  );
}

function buildPublishedRuntime(params: {
  restaurantId: string;
  floorPlans: FloorPlan[];
  tables: Table[];
  zones: FirestoreZone[];
}): TpvPublishedMapRuntime {
  const { restaurantId, floorPlans, tables, zones } = params;
  assertTenantRows(restaurantId, floorPlans, "floorPlans");
  assertTenantRows(restaurantId, tables, "tables");
  assertTenantRows(restaurantId, zones, "zones");

  const hydration = buildSalaEditorDocumentFromLegacy({
    restaurantId,
    floorPlans,
    tables,
    zones,
  });
  const contractsByFloorPlanId = new Map<
    string,
    EditorTpvReadonlyVisualContract
  >();

  if (hydration?.document) {
    for (const plan of operationalFloorPlans(floorPlans)) {
      const planId = normalizeId(plan.id);
      if (!planId) continue;
      const contract = buildEditorTpvReadonlyVisualContract(
        hydration.document,
        planId,
      );
      if (!contract || contract.restaurantId !== restaurantId) continue;
      contractsByFloorPlanId.set(planId, contract);
    }
  }

  return {
    restaurantId,
    contractsByFloorPlanId,
    contractCount: contractsByFloorPlanId.size,
  };
}

/**
 * Loads the TPV readonly map exclusively from the operational projection that
 * Editor V2 publishes to floorPlans/tables/zones. Nothing is read from the
 * editor draft store and nothing is persisted by this adapter.
 */
export async function loadTpvPublishedMapRuntime(
  restaurantId: string,
): Promise<TpvPublishedMapRuntime> {
  const rid = normalizeId(restaurantId);
  if (!rid) {
    throw new Error("loadTpvPublishedMapRuntime: restaurantId obligatorio");
  }

  const [floorPlans, tables, zones] = await Promise.all([
    getFloorPlans(rid),
    getTables(rid),
    getZones(rid),
  ]);
  const runtime = buildPublishedRuntime({
    restaurantId: rid,
    floorPlans,
    tables,
    zones,
  });
  runtimeByRestaurantId.set(rid, runtime);
  return runtime;
}

export function hasCachedTpvPublishedMapRuntime(restaurantId: string): boolean {
  const rid = normalizeId(restaurantId);
  return Boolean(rid && runtimeByRestaurantId.has(rid));
}

export function clearTpvPublishedMapRuntime(restaurantId: string): void {
  const rid = normalizeId(restaurantId);
  if (rid) runtimeByRestaurantId.delete(rid);
}

function readSingleTenantId(input: MatchPublishedContractInput): string | null {
  const ids = new Set<string>();
  for (const element of input.elements) {
    const rid = normalizeId(element.restaurantId);
    if (rid) ids.add(rid);
  }
  for (const zone of input.zones ?? []) {
    const rid = normalizeId(zone.restaurantId);
    if (rid) ids.add(rid);
  }
  return ids.size === 1 ? [...ids][0]! : null;
}

function contractCoveredIds(
  contract: EditorTpvReadonlyVisualContract,
): ReadonlySet<string> {
  const ids = new Set<string>(getEditorV2NativeDecorativeIds(contract));
  for (const instance of contract.operationalElementInstances) {
    const tableId = normalizeId(instance.metadata.legacyTableId);
    if (tableId) ids.add(tableId);
  }
  return ids;
}

/**
 * Matches the selected TPV payload to exactly one published floor plan by IDs.
 * It never guesses by display name, type or position. Ambiguity fails closed.
 */
export function matchCachedTpvPublishedReadonlyContract(
  input: MatchPublishedContractInput,
): EditorTpvReadonlyVisualContract | null {
  const restaurantId = readSingleTenantId(input);
  if (!restaurantId) return null;
  const runtime = runtimeByRestaurantId.get(restaurantId);
  if (!runtime) return null;

  const elementIds = input.elements
    .map((element) => normalizeId(element.id))
    .filter(Boolean);
  const zoneIds = (input.zones ?? [])
    .map((zone) => normalizeId(zone.id))
    .filter(Boolean);

  if (elementIds.length === 0 && zoneIds.length === 0) return null;

  const matches: EditorTpvReadonlyVisualContract[] = [];
  for (const contract of runtime.contractsByFloorPlanId.values()) {
    const coveredElementIds = contractCoveredIds(contract);
    const coveredZoneIds = new Set(
      contract.zones.map((zone) => normalizeId(zone.id)).filter(Boolean),
    );
    const coversElements = elementIds.every((id) => coveredElementIds.has(id));
    const coversZones = zoneIds.every((id) => coveredZoneIds.has(id));
    if (coversElements && coversZones) matches.push(contract);
  }

  return matches.length === 1 ? matches[0]! : null;
}
