import type { Table } from "@/lib/firestore/tables";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";

export type LegacyTableAutoLinkUpdate = {
  instanceId: string;
  legacyTableId: string;
};

export type LegacyTableAutoLinkReason =
  | "LINKED"
  | "SIN_COINCIDENCIA_NUMERO"
  | "SIN_COINCIDENCIA_NOMBRE"
  | "NUMERO_DUPLICADO"
  | "NOMBRE_DUPLICADO"
  | "LEGACY_OCUPADA"
  | "LEGACY_YA_ENLAZADA"
  | "LEGACY_NO_EXISTE"
  | "RESTAURANT_DISTINTO"
  | "SIN_NUMERO"
  | "SIN_NOMBRE"
  | "OTRA_CAUSA";

export type LegacyTableAutoLinkCandidateDebug = {
  id: string;
  name: string;
  number: string | null;
  restaurantId: string;
  status: string;
  isActive: boolean;
  alreadyLinked: boolean;
  discarded: boolean;
  discardReason: Exclude<LegacyTableAutoLinkReason, "LINKED"> | null;
};

export type LegacyTableAutoLinkDebugEntry = {
  instanceId: string;
  instanceName: string;
  instanceNumber: string | null;
  result: "linked" | "manual_review";
  reason: LegacyTableAutoLinkReason;
  legacyTableId: string | null;
  candidatesFound: number;
  candidates: LegacyTableAutoLinkCandidateDebug[];
};

export type LegacyTableAutoLinkResult = {
  analyzedCount: number;
  updates: LegacyTableAutoLinkUpdate[];
  manualReviewCount: number;
  conflictCount: number;
  reasonCounts: Partial<Record<LegacyTableAutoLinkReason, number>>;
  debug: LegacyTableAutoLinkDebugEntry[];
};

export function readLegacyTableIdFromMetadata(
  metadata: Record<string, unknown>,
): string {
  return typeof metadata.legacyTableId === "string"
    ? metadata.legacyTableId.trim()
    : "";
}

export function normalizeLegacyTableLinkText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractSingleTableNumber(value: string): string | null {
  const matches = value.match(/\d+/g) ?? [];
  return matches.length === 1 ? matches[0] ?? null : null;
}

function legacyTableNumber(table: Table): string | null {
  return extractSingleTableNumber(table.name);
}

function candidateDebug(
  table: Table,
  usedLegacyTableIds: Set<string>,
  restaurantId: string,
  primaryDiscardReason: Exclude<LegacyTableAutoLinkReason, "LINKED"> | null,
): LegacyTableAutoLinkCandidateDebug {
  const alreadyLinked = usedLegacyTableIds.has(table.id);
  const wrongRestaurant = table.restaurantId !== restaurantId;
  const inactive = table.isActive === false;
  const discardReason =
    primaryDiscardReason ??
    (wrongRestaurant
      ? "RESTAURANT_DISTINTO"
      : inactive
        ? "LEGACY_NO_EXISTE"
        : alreadyLinked
          ? "LEGACY_YA_ENLAZADA"
          : null);

  return {
    id: table.id,
    name: table.name,
    number: legacyTableNumber(table),
    restaurantId: table.restaurantId,
    status: table.status,
    isActive: table.isActive !== false,
    alreadyLinked,
    discarded: discardReason !== null,
    discardReason,
  };
}

function reasonForNoCompatibleCandidate(params: {
  rawMatches: Table[];
  sameRestaurantMatches: Table[];
  activeMatches: Table[];
  availableMatches: Table[];
  duplicateReason: Exclude<LegacyTableAutoLinkReason, "LINKED">;
  noMatchReason: Exclude<LegacyTableAutoLinkReason, "LINKED">;
}): Exclude<LegacyTableAutoLinkReason, "LINKED"> {
  const {
    rawMatches,
    sameRestaurantMatches,
    activeMatches,
    availableMatches,
    duplicateReason,
    noMatchReason,
  } = params;

  if (rawMatches.length === 0) return noMatchReason;
  if (sameRestaurantMatches.length === 0) return "RESTAURANT_DISTINTO";
  if (activeMatches.length === 0) return "LEGACY_NO_EXISTE";
  if (availableMatches.length === 0) return "LEGACY_YA_ENLAZADA";
  if (availableMatches.length > 1) return duplicateReason;
  return "OTRA_CAUSA";
}

export function resolveSafeLegacyTableAutoLink(params: {
  instance: OperationalElementInstance;
  legacyTables: Table[];
  usedLegacyTableIds: Set<string>;
  restaurantId: string;
}): {
  legacyTableId: string | null;
  conflict: boolean;
  reason: LegacyTableAutoLinkReason;
  debug: LegacyTableAutoLinkDebugEntry;
} {
  const { instance, usedLegacyTableIds, restaurantId } = params;
  if (instance.elementType !== "TABLE") {
    return {
      legacyTableId: null,
      conflict: false,
      reason: "OTRA_CAUSA",
      debug: {
        instanceId: instance.id,
        instanceName: instance.name,
        instanceNumber: null,
        result: "manual_review",
        reason: "OTRA_CAUSA",
        legacyTableId: null,
        candidatesFound: 0,
        candidates: [],
      },
    };
  }

  const number = extractSingleTableNumber(instance.name);
  if (number) {
    const rawMatches = params.legacyTables.filter(
      (table) => legacyTableNumber(table) === number,
    );
    const sameRestaurantMatches = rawMatches.filter(
      (table) => table.restaurantId === restaurantId,
    );
    const activeMatches = sameRestaurantMatches.filter(
      (table) => table.isActive !== false,
    );
    const availableMatches = activeMatches.filter(
      (table) => !usedLegacyTableIds.has(table.id),
    );
    if (availableMatches.length === 1) {
      const match = availableMatches[0]!;
      return {
        legacyTableId: match.id,
        conflict: false,
        reason: "LINKED",
        debug: {
          instanceId: instance.id,
          instanceName: instance.name,
          instanceNumber: number,
          result: "linked",
          reason: "LINKED",
          legacyTableId: match.id,
          candidatesFound: rawMatches.length,
          candidates: rawMatches.map((table) =>
            candidateDebug(table, usedLegacyTableIds, restaurantId, null),
          ),
        },
      };
    }

    const reason = reasonForNoCompatibleCandidate({
      rawMatches,
      sameRestaurantMatches,
      activeMatches,
      availableMatches,
      duplicateReason: "NUMERO_DUPLICADO",
      noMatchReason: "SIN_COINCIDENCIA_NUMERO",
    });
    return {
      legacyTableId: null,
      conflict: reason === "NUMERO_DUPLICADO",
      reason,
      debug: {
        instanceId: instance.id,
        instanceName: instance.name,
        instanceNumber: number,
        result: "manual_review",
        reason,
        legacyTableId: null,
        candidatesFound: rawMatches.length,
        candidates: rawMatches.map((table) =>
          candidateDebug(table, usedLegacyTableIds, restaurantId, reason),
        ),
      },
    };
  }

  const normalizedName = normalizeLegacyTableLinkText(instance.name);
  if (!normalizedName) {
    return {
      legacyTableId: null,
      conflict: false,
      reason: "SIN_NOMBRE",
      debug: {
        instanceId: instance.id,
        instanceName: instance.name,
        instanceNumber: null,
        result: "manual_review",
        reason: "SIN_NOMBRE",
        legacyTableId: null,
        candidatesFound: 0,
        candidates: [],
      },
    };
  }

  const rawMatches = params.legacyTables.filter(
    (table) => normalizeLegacyTableLinkText(table.name) === normalizedName,
  );
  const sameRestaurantMatches = rawMatches.filter(
    (table) => table.restaurantId === restaurantId,
  );
  const activeMatches = sameRestaurantMatches.filter(
    (table) => table.isActive !== false,
  );
  const availableMatches = activeMatches.filter(
    (table) => !usedLegacyTableIds.has(table.id),
  );
  if (availableMatches.length === 1) {
    const match = availableMatches[0]!;
    return {
      legacyTableId: match.id,
      conflict: false,
      reason: "LINKED",
      debug: {
        instanceId: instance.id,
        instanceName: instance.name,
        instanceNumber: null,
        result: "linked",
        reason: "LINKED",
        legacyTableId: match.id,
        candidatesFound: rawMatches.length,
        candidates: rawMatches.map((table) =>
          candidateDebug(table, usedLegacyTableIds, restaurantId, null),
        ),
      },
    };
  }

  const reason = reasonForNoCompatibleCandidate({
    rawMatches,
    sameRestaurantMatches,
    activeMatches,
    availableMatches,
    duplicateReason: "NOMBRE_DUPLICADO",
    noMatchReason: "SIN_COINCIDENCIA_NOMBRE",
  });
  return {
    legacyTableId: null,
    conflict: reason === "NOMBRE_DUPLICADO",
    reason,
    debug: {
      instanceId: instance.id,
      instanceName: instance.name,
      instanceNumber: null,
      result: "manual_review",
      reason,
      legacyTableId: null,
      candidatesFound: rawMatches.length,
      candidates: rawMatches.map((table) =>
        candidateDebug(table, usedLegacyTableIds, restaurantId, reason),
      ),
    },
  };
}

export function computeSafeLegacyTableAutoLinks(params: {
  instances: OperationalElementInstance[];
  legacyTables: Table[];
  restaurantId: string;
  targetInstanceIds?: Set<string>;
}): LegacyTableAutoLinkResult {
  const usedLegacyTableIds = new Set(
    params.instances
      .map((instance) => readLegacyTableIdFromMetadata(instance.metadata))
      .filter((legacyTableId) => legacyTableId !== ""),
  );
  const updates: LegacyTableAutoLinkUpdate[] = [];
  const debug: LegacyTableAutoLinkDebugEntry[] = [];
  const reasonCounts: Partial<Record<LegacyTableAutoLinkReason, number>> = {};
  let analyzedCount = 0;
  let manualReviewCount = 0;
  let conflictCount = 0;

  for (const instance of params.instances) {
    if (instance.elementType !== "TABLE") continue;
    if (params.targetInstanceIds && !params.targetInstanceIds.has(instance.id)) {
      continue;
    }
    if (readLegacyTableIdFromMetadata(instance.metadata)) continue;
    analyzedCount += 1;

    const result = resolveSafeLegacyTableAutoLink({
      instance,
      legacyTables: params.legacyTables,
      usedLegacyTableIds,
      restaurantId: params.restaurantId,
    });
    debug.push(result.debug);
    reasonCounts[result.reason] = (reasonCounts[result.reason] ?? 0) + 1;

    if (result.legacyTableId) {
      usedLegacyTableIds.add(result.legacyTableId);
      updates.push({ instanceId: instance.id, legacyTableId: result.legacyTableId });
    } else if (result.conflict) {
      conflictCount += 1;
    } else {
      manualReviewCount += 1;
    }
  }

  return { analyzedCount, updates, manualReviewCount, conflictCount, reasonCounts, debug };
}
