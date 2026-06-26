/**
 * Contrato de salida del Asistente de Salas (Fase 1).
 * Estado local de sesión; la Fase 2 consumirá este borrador para abrir el editor visual.
 */

export type RoomsAssistantBusinessType =
  | "restaurant"
  | "bar"
  | "cafe"
  | "beach-club"
  | "hotel"
  | "rooftop"
  | "chiringuito"
  | "nightclub"
  | "other";

export type SpaceShape = "rectangular" | "square" | "l-shape" | "irregular" | "unknown";
export type WallAnswer = "yes" | "no" | "partial";
export type BinaryAnswer = "yes" | "no";

export type StructureAnswers = {
  shape: SpaceShape | null;
  walls: WallAnswer | null;
  hasBar: BinaryAnswer | null;
  connectedTerrace: BinaryAnswer | null;
};

export type FloorMaterial =
  | "tile"
  | "wood"
  | "parquet"
  | "stone"
  | "marble"
  | "concrete"
  | "microcement"
  | "decking"
  | "sand"
  | "grass"
  | "water"
  | "other";

export type FloorTone =
  | "light"
  | "medium"
  | "dark"
  | "black"
  | "white"
  | "sand"
  | "gray"
  | "custom";

export type LevelChange = "none" | "step" | "platform" | "ramp" | "multiple";

export type AmbienceStyle =
  | "elegant"
  | "modern"
  | "mediterranean"
  | "industrial"
  | "tropical"
  | "minimal"
  | "rustic"
  | "chill-out"
  | "classic"
  | "other";

export type AmbienceAnswers = {
  material: FloorMaterial | null;
  tone: FloorTone | null;
  uniformFloor: BinaryAnswer | null;
  levelChange: LevelChange | null;
  ambience: AmbienceStyle | null;
};

export type StructuralDoor = "main" | "kitchen" | "emergency" | "terrace";
export type WindowsAnswer = "none" | "few" | "many";
export type ColumnsAnswer = "none" | "one-two" | "many";
export type StructuralObstacle = "chimney" | "stage" | "planters" | "other";

export type StructuralElementsAnswers = {
  doors: StructuralDoor[];
  windows: WindowsAnswer | null;
  columns: ColumnsAnswer | null;
  stairs: BinaryAnswer | null;
  elevator: BinaryAnswer | null;
  obstacles: StructuralObstacle[];
};

export type ServiceBarAnswer = "none" | "left" | "right" | "back" | "center";
export type ServiceCashierAnswer = "undefined" | "bar" | "reception" | "independent";
export type ServiceReceptionAnswer = "none" | "entrance" | "inside";
export type ServiceWaiterStationAnswer = "none" | "kitchen" | "bar" | "center";
export type ServicePickupAnswer = "undefined" | "kitchen" | "bar" | "both";
export type ServiceWaitingZoneAnswer = "none" | "entrance" | "bar" | "outdoor";

export type ServiceElementsAnswers = {
  bar: ServiceBarAnswer | null;
  cashier: ServiceCashierAnswer | null;
  reception: ServiceReceptionAnswer | null;
  waiterStation: ServiceWaiterStationAnswer | null;
  pickup: ServicePickupAnswer | null;
  waitingZone: ServiceWaitingZoneAnswer | null;
};

export type TableCountAnswer = "up-to-15" | "15-30" | "30-50" | "50-plus";
export type TableSizeDistribution =
  | "mostly-2"
  | "mostly-4"
  | "balanced"
  | "mostly-large";
export type HighTablesAnswer = "none" | "some" | "many";
export type BarSeatingAnswer = "none" | "small" | "medium" | "large";
export type TerraceTablesAnswer = "none" | "few" | "half" | "most";
export type OutdoorTablesAnswer = "none" | "few" | "some" | "many";

export type TablesAnswers = {
  approximateCount: TableCountAnswer | null;
  sizeDistribution: TableSizeDistribution | null;
  highTables: HighTablesAnswer | null;
  barSeating: BarSeatingAnswer | null;
  terraceTables: TerraceTablesAnswer | null;
  outdoorTables: OutdoorTablesAnswer | null;
};

export type RoomsAssistantDraft = {
  version: 1;
  createdAt: string;
  businessType: RoomsAssistantBusinessType;
  spaces: string[];
  structure: StructureAnswers;
  ambience: AmbienceAnswers;
  structuralElements: StructuralElementsAnswers;
  serviceElements: ServiceElementsAnswers;
  tables: TablesAnswers;
  /** Plano generado en memoria; la Fase 2 lo traducirá a elementos del editor. */
  generatedPlan: RoomsAssistantGeneratedPlan;
};

/** Esqueleto del plano inicial; sin persistencia ni algoritmo definitivo. */
export type RoomsAssistantGeneratedPlan = {
  status: "ready";
  spaceCount: number;
  estimatedTableCount: number;
  hasBar: boolean;
  hasTerrace: boolean;
  hasOutdoor: boolean;
};

export type RoomsAssistantDraftInput = {
  businessType: RoomsAssistantBusinessType;
  spaces: string[];
  structure: StructureAnswers;
  ambience: AmbienceAnswers;
  structuralElements: StructuralElementsAnswers;
  serviceElements: ServiceElementsAnswers;
  tables: TablesAnswers;
};

const TABLE_COUNT_ESTIMATES: Record<TableCountAnswer, number> = {
  "up-to-15": 12,
  "15-30": 22,
  "30-50": 40,
  "50-plus": 60,
};

const BAR_SEATING_ESTIMATES: Record<BarSeatingAnswer, number> = {
  none: 0,
  small: 6,
  medium: 12,
  large: 20,
};

export function estimateTableCount(tables: TablesAnswers): number {
  const base = tables.approximateCount
    ? TABLE_COUNT_ESTIMATES[tables.approximateCount]
    : 20;
  const bar = tables.barSeating
    ? BAR_SEATING_ESTIMATES[tables.barSeating]
    : 0;
  return base + Math.round(bar / 2);
}

export function buildRoomsAssistantDraft(
  input: RoomsAssistantDraftInput,
): RoomsAssistantDraft {
  const outdoorSpaceIds = new Set([
    "terrace",
    "garden",
    "beach",
    "rooftop",
    "pool",
  ]);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    businessType: input.businessType,
    spaces: input.spaces,
    structure: input.structure,
    ambience: input.ambience,
    structuralElements: input.structuralElements,
    serviceElements: input.serviceElements,
    tables: input.tables,
    generatedPlan: {
      status: "ready",
      spaceCount: input.spaces.length,
      estimatedTableCount: estimateTableCount(input.tables),
      hasBar:
        input.structure.hasBar === "yes" ||
        (input.serviceElements.bar !== null &&
          input.serviceElements.bar !== "none"),
      hasTerrace: input.spaces.includes("terrace"),
      hasOutdoor: input.spaces.some((id) => outdoorSpaceIds.has(id)),
    },
  };
}

export const ROOMS_ASSISTANT_DRAFT_STORAGE_KEY = "hostly:rooms-assistant-draft";
export const ROOMS_ASSISTANT_BANNER_DISMISSED_KEY =
  "hostly:rooms-assistant-banner-dismissed";
export const ROOMS_ASSISTANT_GUIDE_DISMISSED_KEY =
  "hostly:rooms-assistant-guide-dismissed";

export function persistRoomsAssistantDraft(draft: RoomsAssistantDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      ROOMS_ASSISTANT_DRAFT_STORAGE_KEY,
      JSON.stringify(draft),
    );
  } catch {
    /* sessionStorage puede fallar en modo privado */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isValidRoomsAssistantDraft(value: unknown): value is RoomsAssistantDraft {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.createdAt !== "string") return false;
  if (typeof value.businessType !== "string") return false;
  if (!isStringArray(value.spaces)) return false;
  if (!isRecord(value.structure)) return false;
  if (!isRecord(value.ambience)) return false;
  if (!isRecord(value.structuralElements)) return false;
  if (!isRecord(value.serviceElements)) return false;
  if (!isRecord(value.tables)) return false;
  if (!isRecord(value.generatedPlan)) return false;
  if (value.generatedPlan.status !== "ready") return false;
  if (typeof value.generatedPlan.spaceCount !== "number") return false;
  if (typeof value.generatedPlan.estimatedTableCount !== "number") return false;
  if (typeof value.generatedPlan.hasBar !== "boolean") return false;
  if (typeof value.generatedPlan.hasTerrace !== "boolean") return false;
  if (typeof value.generatedPlan.hasOutdoor !== "boolean") return false;
  return true;
}

export function readRoomsAssistantDraft(): RoomsAssistantDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ROOMS_ASSISTANT_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidRoomsAssistantDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearRoomsAssistantDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ROOMS_ASSISTANT_DRAFT_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function isRoomsAssistantBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(ROOMS_ASSISTANT_BANNER_DISMISSED_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function dismissRoomsAssistantBanner(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ROOMS_ASSISTANT_BANNER_DISMISSED_KEY, "1");
  } catch {
    /* noop */
  }
}

export function isRoomsAssistantGuideDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(ROOMS_ASSISTANT_GUIDE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissRoomsAssistantGuide(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ROOMS_ASSISTANT_GUIDE_DISMISSED_KEY, "1");
  } catch {
    /* noop */
  }
}
