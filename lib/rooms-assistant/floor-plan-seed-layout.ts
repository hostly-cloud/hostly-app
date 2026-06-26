import { getDefaultSizeForPlanElementType } from "@/lib/firestore/tables";
import type { TableVisualShape } from "@/lib/firestore/tables";
import type { OutdoorTablesAnswer, RoomsAssistantDraft, TerraceTablesAnswer } from "./draft";
import { estimateTableCount } from "./draft";
import type { FloorPlanSeedElement, FloorPlanSeedZone } from "./floor-plan-seed-types";
import {
  SEED_LAYOUT,
  boundsFromElement,
  canPlaceElement,
  insetRect,
  snap,
  type SeedBounds,
  type SeedRect,
} from "./floor-plan-seed-geometry";

type TableSpec = {
  width: number;
  height: number;
  seats: number;
  tableShape: TableVisualShape;
};

function resolveEstimatedTableCount(draft: RoomsAssistantDraft): number {
  const generated = draft.generatedPlan?.estimatedTableCount;
  if (typeof generated === "number" && Number.isFinite(generated) && generated >= 0) {
    return generated;
  }
  return Math.max(0, estimateTableCount(draft.tables));
}

function terraceTableTarget(answer: TerraceTablesAnswer | null, hasTerrace: boolean): number {
  switch (answer) {
    case "none":
      return 0;
    case "few":
      return 2;
    case "half":
      return 4;
    case "most":
      return 6;
    default:
      return hasTerrace ? 4 : 0;
  }
}

function outdoorTableTarget(answer: OutdoorTablesAnswer | null, hasOutdoor: boolean): number {
  switch (answer) {
    case "none":
      return 0;
    case "few":
      return 2;
    case "some":
      return 4;
    case "many":
      return 6;
    default:
      return hasOutdoor ? 3 : 0;
  }
}

function tableSpecForSeats(seats: number): TableSpec {
  if (seats <= 2) {
    return { width: 62, height: 62, seats: 2, tableShape: "round" };
  }
  if (seats >= 6) {
    return { width: 120, height: 68, seats: 6, tableShape: "square" };
  }
  return { width: 76, height: 76, seats: 4, tableShape: "square" };
}

function seatsForDistribution(
  draft: RoomsAssistantDraft,
  index: number,
  clusterIndex: number,
): number {
  const dist = draft.tables.sizeDistribution;
  if (dist === "mostly-2") return 2;
  if (dist === "mostly-4") return 4;
  if (dist === "mostly-large") return 6;
  if (dist === "balanced") {
    const pattern = [2, 4, 4, 6];
    return pattern[(index + clusterIndex) % pattern.length] ?? 4;
  }
  return index % 2 === 0 ? 4 : 2;
}

function barWidthForDraft(draft: RoomsAssistantDraft, maxWidth: number): number {
  const seating = draft.tables.barSeating;
  const base =
    seating === "large"
      ? 360
      : seating === "medium"
        ? 280
        : seating === "small"
          ? 200
          : 260;
  return snap(Math.min(base, maxWidth - 48));
}

function markOccupied(
  occupied: SeedBounds[],
  x: number,
  y: number,
  width: number,
  height: number,
  extraClearance = 0,
): void {
  const pad = SEED_LAYOUT.serviceClearance + extraClearance;
  occupied.push({
    x: x - pad,
    y: y - pad,
    width: width + pad * 2,
    height: height + pad * 2,
  });
}

function pushElement(
  elements: FloorPlanSeedElement[],
  occupied: SeedBounds[],
  element: FloorPlanSeedElement,
): boolean {
  const w = element.width ?? getDefaultSizeForPlanElementType(element.type).width;
  const h = element.height ?? getDefaultSizeForPlanElementType(element.type).height;
  const bounds = boundsFromElement(element.x, element.y, w, h);
  if (!canPlaceElement(bounds, occupied, SEED_LAYOUT.tableGap)) {
    return false;
  }
  elements.push({ ...element, width: w, height: h });
  markOccupied(occupied, element.x, element.y, w, h);
  return true;
}

/** Agrupa mesas en parejas y filas cortas con pasillos entre bloques. */
function placeGroupedTables(
  dining: SeedRect,
  count: number,
  draft: RoomsAssistantDraft,
  zoneKey: FloorPlanSeedElement["zoneKey"],
  occupied: SeedBounds[],
  elements: FloorPlanSeedElement[],
  nameOffset = 0,
): number {
  if (count <= 0) return nameOffset;

  let placed = 0;
  let clusterIndex = 0;
  let cursorY = dining.y;
  const maxY = dining.y + dining.h;

  while (placed < count && cursorY + 68 <= maxY) {
    const remaining = count - placed;

    if (remaining >= 2 && clusterIndex % 2 === 0) {
      const seats = seatsForDistribution(draft, placed, clusterIndex);
      const spec = tableSpecForSeats(seats);
      const pairWidth = spec.width * 2 + SEED_LAYOUT.tableGap;
      const startX = snap(dining.x + (dining.w - pairWidth) / 2);

      for (let i = 0; i < 2; i++) {
        const placedNow = pushElement(elements, occupied, {
          type: "table",
          x: startX + i * (spec.width + SEED_LAYOUT.tableGap),
          y: cursorY,
          width: spec.width,
          height: spec.height,
          tableShape: i === 0 ? spec.tableShape : "round",
          seats: spec.seats,
          name: `Mesa ${nameOffset + placed + 1}`,
          zoneKey,
        });
        if (placedNow) placed += 1;
      }
      cursorY += spec.height + SEED_LAYOUT.clusterGap;
      clusterIndex += 1;
      continue;
    }

    if (remaining >= 3) {
      const rowTables = Math.min(4, remaining);
      const seats = seatsForDistribution(draft, placed, clusterIndex);
      const spec = tableSpecForSeats(seats);
      const rowWidth =
        spec.width * rowTables + SEED_LAYOUT.tableGap * (rowTables - 1);
      let rowX = snap(dining.x + (dining.w - rowWidth) / 2);

      for (let i = 0; i < rowTables; i++) {
        const placedNow = pushElement(elements, occupied, {
          type: "table",
          x: rowX,
          y: cursorY,
          width: spec.width,
          height: spec.height,
          tableShape: i === 1 ? "round" : spec.tableShape,
          seats: spec.seats,
          name: `Mesa ${nameOffset + placed + 1}`,
          zoneKey,
        });
        if (placedNow) placed += 1;
        rowX += spec.width + SEED_LAYOUT.tableGap;
      }
      cursorY += spec.height + SEED_LAYOUT.aisle;
      clusterIndex += 1;
      continue;
    }

    const seats = seatsForDistribution(draft, placed, clusterIndex);
    const spec = tableSpecForSeats(seats);
    const placedNow = pushElement(elements, occupied, {
      type: "table",
      x: snap(dining.x + (dining.w - spec.width) / 2),
      y: cursorY,
      width: spec.width,
      height: spec.height,
      tableShape: spec.tableShape,
      seats: spec.seats,
      name: `Mesa ${nameOffset + placed + 1}`,
      zoneKey,
    });
    if (placedNow) placed += 1;
    cursorY += spec.height + SEED_LAYOUT.clusterGap;
    clusterIndex += 1;
  }

  return nameOffset + placed;
}

function placeZoneGridTables(
  zone: SeedRect,
  count: number,
  zoneKey: FloorPlanSeedElement["zoneKey"],
  occupied: SeedBounds[],
  elements: FloorPlanSeedElement[],
  nameOffset: number,
): number {
  if (count <= 0) return nameOffset;

  const inner = insetRect(zone, SEED_LAYOUT.zonePadding);
  const spec = tableSpecForSeats(4);
  const cols = count <= 2 ? count : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const gridW = cols * spec.width + (cols - 1) * SEED_LAYOUT.tableGap;
  const gridH = rows * spec.height + (rows - 1) * SEED_LAYOUT.aisle;
  const startX = snap(inner.x + (inner.w - gridW) / 2);
  const startY = snap(inner.y + (inner.h - gridH) / 2);

  let placed = 0;
  for (let row = 0; row < rows && placed < count; row++) {
    for (let col = 0; col < cols && placed < count; col++) {
      const x = startX + col * (spec.width + SEED_LAYOUT.tableGap);
      const y = startY + row * (spec.height + SEED_LAYOUT.aisle);
      const placedNow = pushElement(elements, occupied, {
        type: "table",
        x,
        y,
        width: spec.width,
        height: spec.height,
        tableShape: col === 0 ? "square" : "round",
        seats: 4,
        name: `Mesa ${nameOffset + placed + 1}`,
        zoneKey,
      });
      if (placedNow) placed += 1;
    }
  }
  return nameOffset + placed;
}

export type LayoutInput = {
  draft: RoomsAssistantDraft;
  hasBar: boolean;
  hasKitchen: boolean;
  hasReception: boolean;
  hasTerrace: boolean;
  hasOutdoor: boolean;
};

export function buildLayoutFromDraft(input: LayoutInput): {
  zones: FloorPlanSeedZone[];
  elements: FloorPlanSeedElement[];
} {
  const { draft, hasBar, hasKitchen, hasReception, hasTerrace, hasOutdoor } =
    input;

  const mainZoneRect: SeedRect = { x: 72, y: 64, w: 608, h: 432 };
  const terraceCount = hasTerrace
    ? terraceTableTarget(draft.tables.terraceTables, hasTerrace)
    : 0;
  const outdoorCount = hasOutdoor
    ? outdoorTableTarget(draft.tables.outdoorTables, hasOutdoor)
    : 0;
  const totalEstimate = resolveEstimatedTableCount(draft);
  const mainTableTarget = Math.max(
    0,
    Math.min(14, totalEstimate - terraceCount - outdoorCount),
  );

  const zones: FloorPlanSeedZone[] = [
    {
      key: "main",
      name: "Sala Principal",
      ...mainZoneRect,
    },
  ];

  let terraceRect: SeedRect | null = null;
  if (hasTerrace) {
    terraceRect = {
      x: mainZoneRect.x + mainZoneRect.w + SEED_LAYOUT.zoneGap,
      y: mainZoneRect.y + 40,
      w: 172,
      h: Math.max(280, mainZoneRect.h - 72),
    };
    zones.push({
      key: "terrace",
      name: "Terraza",
      ...terraceRect,
    });
  }

  let outdoorRect: SeedRect | null = null;
  if (hasOutdoor && outdoorCount > 0) {
    if (terraceRect) {
      outdoorRect = {
        x: terraceRect.x,
        y: terraceRect.y + terraceRect.h + SEED_LAYOUT.zoneGap,
        w: terraceRect.w,
        h: 168,
      };
    } else {
      outdoorRect = {
        x: mainZoneRect.x + mainZoneRect.w + SEED_LAYOUT.zoneGap,
        y: mainZoneRect.y + 40,
        w: 172,
        h: Math.max(280, mainZoneRect.h - 72),
      };
    }
    zones.push({
      key: "outdoor",
      name: "Zona Exterior",
      ...outdoorRect,
    });
  }

  const elements: FloorPlanSeedElement[] = [];
  const occupied: SeedBounds[] = [];

  const inner = insetRect(mainZoneRect, SEED_LAYOUT.zonePadding);
  const doorSize = getDefaultSizeForPlanElementType("door");
  const barSize = getDefaultSizeForPlanElementType("bar");

  let diningTop = inner.y;
  const diningBottom = inner.y + inner.h - SEED_LAYOUT.entranceStrip;

  if (hasBar) {
    const barW = barWidthForDraft(draft, inner.w);
    const barX = snap(inner.x + (inner.w - barW) / 2);
    const barY = inner.y + 8;
    pushElement(elements, occupied, {
      type: "bar",
      x: barX,
      y: barY,
      width: barW,
      height: barSize.height,
      name: "Barra",
      zoneKey: "main",
    });
    diningTop = barY + barSize.height + SEED_LAYOUT.barClearance;
  }

  if (hasReception) {
    const receptionX = snap(inner.x + inner.w * 0.12);
    const receptionY = snap(inner.y + inner.h - doorSize.height - 12);
    pushElement(elements, occupied, {
      type: "door",
      x: receptionX,
      y: receptionY,
      width: doorSize.width,
      height: doorSize.height,
      name: "Recepción",
      zoneKey: "main",
    });
    markOccupied(
      occupied,
      receptionX,
      receptionY,
      doorSize.width,
      doorSize.height,
      SEED_LAYOUT.aisle / 2,
    );
  }

  if (hasKitchen) {
    const kitchenX = snap(inner.x + inner.w - doorSize.width - 36);
    const kitchenY = snap(inner.y + 24);
    pushElement(elements, occupied, {
      type: "door",
      x: kitchenX,
      y: kitchenY,
      width: doorSize.width,
      height: doorSize.height,
      name: "Cocina",
      zoneKey: "main",
    });
    markOccupied(
      occupied,
      kitchenX,
      kitchenY,
      doorSize.width,
      doorSize.height,
      SEED_LAYOUT.aisle / 2,
    );
  }

  const dining: SeedRect = {
    x: inner.x + SEED_LAYOUT.aisle / 2,
    y: diningTop,
    w: inner.w - SEED_LAYOUT.aisle,
    h: Math.max(120, diningBottom - diningTop),
  };

  let tableNameOffset = 0;
  tableNameOffset = placeGroupedTables(
    dining,
    mainTableTarget,
    draft,
    "main",
    occupied,
    elements,
    tableNameOffset,
  );

  if (terraceRect && terraceCount > 0) {
    tableNameOffset = placeZoneGridTables(
      terraceRect,
      terraceCount,
      "terrace",
      occupied,
      elements,
      tableNameOffset,
    );
  }

  if (outdoorRect && outdoorCount > 0) {
    placeZoneGridTables(
      outdoorRect,
      outdoorCount,
      "outdoor",
      occupied,
      elements,
      tableNameOffset,
    );
  }

  return { zones, elements };
}
