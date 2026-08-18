/**
 * Adaptadores puros entre modelo legacy (FloorPlan, Zone, PlanElementType)
 * y el contrato canónico del editor de sala.
 *
 * Solo lectura / transformación en memoria. No Firestore.
 */

import type { FloorPlan } from "@/lib/firestore/floorPlans";
import {
  floorPlanCanvasOrDefaults,
  getFloorPlans,
  legacyUnscopedFloorPlanAnchorId,
} from "@/lib/firestore/floorPlans";
import {
  getTables,
  isDecorativePlanElementType,
  type PlanElementType,
  type Table,
  type TableMapStatus,
} from "@/lib/firestore/tables";
import type { Zone } from "@/lib/firestore/zones";
import { getZones } from "@/lib/firestore/zones";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import {
  createEmptySalaEditorDocument,
  SALA_EDITOR_DOCUMENT_VERSION,
} from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import {
  DEFAULT_SALA_ESPACIO_COLOR,
  sortSalaEspacios,
} from "@/lib/sala-editor/types/espacio";
import {
  createDefaultSalaEspacioBase,
  createSalaEspacioBaseFromCanvasSize,
} from "@/lib/sala-editor/types/espacio-base";
import { normalizeSalaEditorDocument } from "@/lib/sala-editor/normalize/normalize-sala-editor-document";
import type {
  SalaStructuralElement,
  SalaStructuralElementKind,
} from "@/lib/sala-editor/types/elementos-estructurales";
import type { SalaOperationalElementKind } from "@/lib/sala-editor/types/elementos-operativos";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";
import type { OperationalElementState, OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { withOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import {
  DEFAULT_ZONE_SIZE,
  type Zone as SalaEditorZone,
} from "@/lib/sala-editor/zones/zone";

const LEGACY_FALLBACK_SPACE_ID = "legacy-main-floor";

export type LegacySalaEditorHydrationWarning = {
  code:
    | "legacy_empty"
    | "legacy_missing_floor_plans"
    | "legacy_orphan_floor_plan"
    | "legacy_inactive_element_skipped"
    | "legacy_unmapped_element";
  message: string;
  legacyId?: string;
  legacyType?: string;
};

export type LegacySalaEditorHydrationResult = {
  document: SalaEditorDocument;
  warnings: LegacySalaEditorHydrationWarning[];
  counts: {
    floorPlans: number;
    zones: number;
    operationalElements: number;
    structuralElements: number;
    walls: number;
    skipped: number;
  };
};

/** Plano legacy → espacio de primer nivel (restaurante multi-plano). */
export function legacyFloorPlanToSalaEspacio(plan: FloorPlan): SalaEspacio {
  return {
    id: plan.id,
    restaurantId: plan.restaurantId,
    name: plan.name,
    tipo: "personalizado",
    color: DEFAULT_SALA_ESPACIO_COLOR,
    sortOrder: plan.sortOrder ?? 0,
    visible: plan.showInTpv !== false,
    active: plan.active !== false,
    legacyFloorPlanId: plan.id,
    base: createSalaEspacioBaseFromCanvasSize(floorPlanCanvasOrDefaults(plan)),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

/** Zona legacy → espacio dentro de un plano (subdivisión visual). */
export function legacyZoneToSalaEspacio(
  zone: Zone,
  sortOrder: number,
): SalaEspacio {
  return {
    id: zone.id,
    restaurantId: zone.restaurantId,
    name: zone.name,
    tipo: "personalizado",
    color: zone.color?.trim() || DEFAULT_SALA_ESPACIO_COLOR,
    sortOrder,
    visible: true,
    active: true,
    legacyZoneId: zone.id,
    legacyFloorPlanId: zone.floorPlanId,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}

export type LegacyPlanElementClassification =
  | { layer: "estructura"; kind: SalaStructuralElementKind }
  | { layer: "operacion"; kind: SalaOperationalElementKind };

const LEGACY_STRUCTURAL_MAP: Partial<
  Record<PlanElementType, SalaStructuralElementKind>
> = {
  wall: "wall",
  bar: "bar",
  door: "door",
  planter: "planter",
  column: "decoration",
  pool: "decoration",
};

const LEGACY_OPERATIONAL_MAP: Partial<
  Record<PlanElementType, SalaOperationalElementKind>
> = {
  table: "table",
  sunbed: "sunbed",
  bed: "balinese-bed",
  custom: "custom",
};

/** Clasifica un `PlanElementType` legacy en capa estructural u operativa. */
export function classifyLegacyPlanElementType(
  type: PlanElementType,
): LegacyPlanElementClassification | null {
  const structural = LEGACY_STRUCTURAL_MAP[type];
  if (structural) return { layer: "estructura", kind: structural };

  const operational = LEGACY_OPERATIONAL_MAP[type];
  if (operational) return { layer: "operacion", kind: operational };

  return null;
}

export function legacyFloorPlansToSalaEspacios(
  plans: FloorPlan[],
): SalaEspacio[] {
  return plans.map(legacyFloorPlanToSalaEspacio);
}

export function legacyZonesToSalaEspacios(zones: Zone[]): SalaEspacio[] {
  return zones.map((zone, index) => legacyZoneToSalaEspacio(zone, index * 10));
}

function legacyStatusToOperationalState(
  status: TableMapStatus,
): OperationalElementState {
  if (status === "occupied") return "ocupado";
  if (status === "reserved") return "reservado";
  return "libre";
}

function legacyPlanElementTypeToOperationalType(
  type: PlanElementType,
): OperationalElementType | null {
  if (type === "table") return "TABLE";
  if (type === "sunbed") return "SUNBED";
  if (type === "bed") return "BALINESE_BED";
  if (type === "custom") return "CUSTOM";
  return null;
}

function legacyPlanElementTypeToStructuralKind(
  type: PlanElementType,
): SalaStructuralElementKind | null {
  const structural = LEGACY_STRUCTURAL_MAP[type];
  return structural ?? null;
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function legacyElementWidth(table: Table): number {
  return Math.max(1, Math.round(numberOrDefault(table.width, 116)));
}

function legacyElementHeight(table: Table): number {
  return Math.max(1, Math.round(numberOrDefault(table.height, 76)));
}

function legacyElementSpaceId(
  element: { floorPlanId?: string },
  floorPlans: FloorPlan[],
): string {
  const explicit = element.floorPlanId?.trim();
  if (explicit) return explicit;
  return legacyUnscopedFloorPlanAnchorId(floorPlans) ?? LEGACY_FALLBACK_SPACE_ID;
}

function legacyZoneToEditorZone(
  zone: Zone,
  floorPlans: FloorPlan[],
): SalaEditorZone {
  const now = Date.now();
  return {
    id: zone.id,
    espacioId: legacyElementSpaceId(zone, floorPlans),
    type: "dining",
    name: zone.name.trim() || "Zona",
    x: Math.round(numberOrDefault(zone.x, 0)),
    y: Math.round(numberOrDefault(zone.y, 0)),
    width: Math.max(48, Math.round(numberOrDefault(zone.width, DEFAULT_ZONE_SIZE.width))),
    height: Math.max(
      48,
      Math.round(numberOrDefault(zone.height, DEFAULT_ZONE_SIZE.height)),
    ),
    color: zone.color?.trim() || DEFAULT_SALA_ESPACIO_COLOR,
    locked: false,
    visible: true,
    metadata: {
      source: "legacy",
      legacyZoneId: zone.id,
      legacyFloorPlanId: zone.floorPlanId,
    },
    createdAt: numberOrDefault(zone.createdAt, now),
    updatedAt: numberOrDefault(zone.updatedAt, now),
  };
}

function buildLegacyMetadata(
  table: Table,
  zonesById: Map<string, Zone>,
  zonesByName: Map<string, Zone>,
): Record<string, unknown> {
  const zone =
    (table.zoneId ? zonesById.get(table.zoneId) : undefined) ??
    (table.zoneName ? zonesByName.get(table.zoneName) : undefined) ??
    (table.zone ? zonesByName.get(table.zone) : undefined);

  return {
    source: "legacy",
    legacyTableId: table.id,
    legacyType: table.type,
    legacyFloorPlanId: table.floorPlanId,
    legacyZoneId: table.zoneId ?? zone?.id,
    legacyZoneName: table.zoneName ?? table.zone ?? zone?.name,
    legacyStatus: table.status,
    tableShape: table.tableShape,
    locked: table.locked === true,
    isActive: table.isActive !== false,
  };
}

function legacyTableToOperationalInstance(
  table: Table,
  spaceId: string,
  zonesById: Map<string, Zone>,
  zonesByName: Map<string, Zone>,
): OperationalElementInstance | null {
  const elementType = legacyPlanElementTypeToOperationalType(table.type);
  if (!elementType) return null;

  const width = legacyElementWidth(table);
  const height = legacyElementHeight(table);
  const metadata = withOperationalInstanceCanvasSize(
    buildLegacyMetadata(table, zonesById, zonesByName),
    { width, height },
  );

  return {
    id: table.id,
    spaceId,
    zoneId: table.zoneId ?? null,
    elementType,
    name: table.name,
    position: {
      x: Math.round(numberOrDefault(table.x, 0) + width / 2),
      y: Math.round(numberOrDefault(table.y, 0) + height / 2),
    },
    rotation: 0,
    capacity: Math.max(0, Math.round(numberOrDefault(table.seats, 0))),
    visible: table.isActive !== false,
    enabled: table.isActive !== false,
    metadata,
    state: legacyStatusToOperationalState(table.status),
  };
}

function legacyTableToWallSegment(
  table: Table,
  spaceId: string,
  zonesById: Map<string, Zone>,
  zonesByName: Map<string, Zone>,
): SalaWallSegment {
  const width = legacyElementWidth(table);
  const height = legacyElementHeight(table);
  const x = Math.round(numberOrDefault(table.x, 0));
  const y = Math.round(numberOrDefault(table.y, 0));
  const midY = y + Math.round(height / 2);

  return {
    id: table.id,
    espacioId: spaceId,
    x1: x,
    y1: midY,
    x2: x + width,
    y2: midY,
    metadata: buildLegacyMetadata(table, zonesById, zonesByName),
  };
}

function legacyTableToStructuralElement(
  table: Table,
  spaceId: string,
  zonesById: Map<string, Zone>,
  zonesByName: Map<string, Zone>,
): SalaStructuralElement | null {
  const kind = legacyPlanElementTypeToStructuralKind(table.type);
  if (!kind) return null;

  return {
    id: table.id,
    espacioId: spaceId,
    kind,
    x: Math.round(numberOrDefault(table.x, 0)),
    y: Math.round(numberOrDefault(table.y, 0)),
    width: legacyElementWidth(table),
    height: legacyElementHeight(table),
    rotation: 0,
    locked: table.locked === true,
    config: {
      label: table.name,
      blocksPlacement:
        table.type === "wall" ||
        table.type === "bar" ||
        table.type === "column",
    },
    metadata: buildLegacyMetadata(table, zonesById, zonesByName),
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  };
}

function ensureSpaceForLegacyFloorPlanId(
  spaces: SalaEspacio[],
  restaurantId: string,
  floorPlanId: string,
  warnings: LegacySalaEditorHydrationWarning[],
): SalaEspacio[] {
  if (spaces.some((space) => space.id === floorPlanId)) return spaces;
  warnings.push({
    code: "legacy_orphan_floor_plan",
    message: `Elemento legacy apunta a un floorPlanId sin documento: ${floorPlanId}`,
    legacyId: floorPlanId,
  });
  return [
    ...spaces,
    {
      id: floorPlanId,
      restaurantId,
      name: `Plano ${floorPlanId}`,
      tipo: "personalizado",
      color: DEFAULT_SALA_ESPACIO_COLOR,
      sortOrder: spaces.length * 10,
      visible: true,
      active: true,
      legacyFloorPlanId: floorPlanId,
      base: createDefaultSalaEspacioBase({ status: "incompleta" }),
    },
  ];
}

export function buildSalaEditorDocumentFromLegacy(params: {
  restaurantId: string;
  floorPlans: FloorPlan[];
  tables: Table[];
  zones: Zone[];
}): LegacySalaEditorHydrationResult | null {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId) return null;

  const warnings: LegacySalaEditorHydrationWarning[] = [];
  const activeTables = params.tables.filter((table) => {
    if (table.isActive === false) {
      warnings.push({
        code: "legacy_inactive_element_skipped",
        message: `Elemento legacy inactivo omitido: ${table.name}`,
        legacyId: table.id,
        legacyType: table.type,
      });
      return false;
    }
    return true;
  });

  if (
    params.floorPlans.length === 0 &&
    activeTables.length === 0 &&
    params.zones.length === 0
  ) {
    warnings.push({
      code: "legacy_empty",
      message: "No hay datos legacy de sala para hidratar.",
    });
    return null;
  }

  let espacios = legacyFloorPlansToSalaEspacios(params.floorPlans);
  if (espacios.length === 0) {
    warnings.push({
      code: "legacy_missing_floor_plans",
      message: "No hay floorPlans legacy; se crea un mapa temporal en memoria.",
    });
    espacios = [
      {
        id: LEGACY_FALLBACK_SPACE_ID,
        restaurantId,
        name: "Sala principal",
        tipo: "sala",
        color: DEFAULT_SALA_ESPACIO_COLOR,
        sortOrder: 0,
        visible: true,
        active: true,
        base: createDefaultSalaEspacioBase(),
      },
    ];
  }

  for (const table of activeTables) {
    const spaceId = legacyElementSpaceId(table, params.floorPlans);
    espacios = ensureSpaceForLegacyFloorPlanId(
      espacios,
      restaurantId,
      spaceId,
      warnings,
    );
  }

  for (const zone of params.zones) {
    const spaceId = legacyElementSpaceId(zone, params.floorPlans);
    espacios = ensureSpaceForLegacyFloorPlanId(
      espacios,
      restaurantId,
      spaceId,
      warnings,
    );
  }

  const zonesById = new Map(params.zones.map((zone) => [zone.id, zone]));
  const zonesByName = new Map(params.zones.map((zone) => [zone.name, zone]));
  const hydratedZones = params.zones.map((zone) =>
    legacyZoneToEditorZone(zone, params.floorPlans),
  );
  const operationalElementInstances: OperationalElementInstance[] = [];
  const structuralElements: SalaStructuralElement[] = [];
  const walls: SalaWallSegment[] = [];
  let skipped = 0;

  for (const table of activeTables) {
    const spaceId = legacyElementSpaceId(table, params.floorPlans);
    if (!isDecorativePlanElementType(table.type)) {
      const instance = legacyTableToOperationalInstance(
        table,
        spaceId,
        zonesById,
        zonesByName,
      );
      if (instance) {
        operationalElementInstances.push(instance);
        continue;
      }
    }

    if (table.type === "wall") {
      walls.push(legacyTableToWallSegment(table, spaceId, zonesById, zonesByName));
      continue;
    }

    const structural = legacyTableToStructuralElement(
      table,
      spaceId,
      zonesById,
      zonesByName,
    );
    if (structural) {
      structuralElements.push(structural);
      continue;
    }

    skipped += 1;
    warnings.push({
      code: "legacy_unmapped_element",
      message: `Elemento legacy sin mapeo V2: ${table.name} (${table.type})`,
      legacyId: table.id,
      legacyType: table.type,
    });
  }

  const sortedSpaces = sortSalaEspacios(espacios);
  const selectedEspacioId = sortedSpaces[0]?.id ?? null;
  const hasLegacyEditorContent =
    hydratedZones.length > 0 ||
    structuralElements.length > 0 ||
    walls.length > 0 ||
    operationalElementInstances.length > 0;
  const document: SalaEditorDocument = normalizeSalaEditorDocument({
    ...createEmptySalaEditorDocument(restaurantId),
    version: SALA_EDITOR_DOCUMENT_VERSION,
    espacios: sortedSpaces,
    walls,
    zones: hydratedZones,
    structuralElements,
    operationalElementInstances,
    navigation: {
      phase: selectedEspacioId
        ? hasLegacyEditorContent
          ? "operacion"
          : "base"
        : "espacios",
      selectedEspacioId,
    },
    updatedAt: Date.now(),
  });

  return {
    document,
    warnings,
    counts: {
      floorPlans: params.floorPlans.length,
      zones: params.zones.length,
      operationalElements: operationalElementInstances.length,
      structuralElements: structuralElements.length,
      walls: walls.length,
      skipped,
    },
  };
}

export async function loadLegacySalaEditorDocument(
  restaurantId: string,
): Promise<LegacySalaEditorHydrationResult | null> {
  const rid = restaurantId.trim();
  if (!rid) return null;

  const [floorPlans, tables, zones] = await Promise.all([
    getFloorPlans(rid),
    getTables(rid),
    getZones(rid),
  ]);

  return buildSalaEditorDocumentFromLegacy({
    restaurantId: rid,
    floorPlans,
    tables,
    zones,
  });
}
