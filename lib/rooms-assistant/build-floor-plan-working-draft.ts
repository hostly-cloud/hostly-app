import { collection, doc } from "firebase/firestore";
import {
  getDefaultSizeForPlanElementType,
  isDecorativePlanElementType,
  TABLE_MAP_STATUS_FREE,
  type FloorElement,
  type PlanElementType,
} from "@/lib/firestore/tables";
import type { Zone } from "@/lib/firestore/zones";
import { db } from "@/lib/firebase/client";
import type { FloorPlanWorkingDraft } from "@/lib/map/floor-plan-publish-types";
import type { RoomsAssistantDraft } from "./draft";
import { buildFloorPlanSeedFromDraft } from "./floor-plan-seed";
import type { FloorPlanSeedZone } from "./floor-plan-seed-types";

export type BuildFloorPlanWorkingDraftFromAssistantParams = {
  draft: RoomsAssistantDraft;
  restaurantId: string;
  floorPlanId: string;
  canvas: { width: number; height: number };
  /** Zonas ya cargadas en el editor (p. ej. desde Firestore). Solo lectura; no se escribe. */
  existingZones?: Zone[];
};

function zoneHasVisualRect(z: Zone): boolean {
  return (
    typeof z.x === "number" &&
    typeof z.y === "number" &&
    typeof z.width === "number" &&
    typeof z.height === "number" &&
    Number.isFinite(z.x) &&
    Number.isFinite(z.y) &&
    Number.isFinite(z.width) &&
    Number.isFinite(z.height)
  );
}

function newLocalFirestoreId(collectionName: "zones" | "tables"): string {
  return doc(collection(db, collectionName)).id;
}

function resolveElementName(
  type: PlanElementType,
  preferred: string | undefined,
  existing: Pick<FloorElement, "type" | "name">[],
): string {
  const trimmed = typeof preferred === "string" ? preferred.trim() : "";
  if (trimmed) return trimmed;

  const baseName =
    type === "bar"
      ? "Barra"
      : type === "door"
        ? "Puerta"
        : "Mesa";
  const re = new RegExp(`^${baseName}\\s+(\\d+)$`, "i");
  let max = 0;
  for (const el of existing) {
    if (el.type !== type) continue;
    const n = typeof el.name === "string" ? el.name.trim() : "";
    const m = re.exec(n);
    if (!m) continue;
    const parsed = Number.parseInt(m[1] ?? "", 10);
    if (Number.isFinite(parsed) && parsed > max) max = parsed;
  }
  return `${baseName} ${Math.max(1, max + 1)}`;
}

/**
 * Convierte el borrador del Asistente de Salas en un `FloorPlanWorkingDraft`
 * listo para el editor. **Sin I/O Firestore** — ids locales compatibles con publish.
 */
export function buildFloorPlanWorkingDraftFromAssistant(
  params: BuildFloorPlanWorkingDraftFromAssistantParams,
): FloorPlanWorkingDraft | null {
  const restaurantId = params.restaurantId.trim();
  const floorPlanId = params.floorPlanId.trim();
  if (!restaurantId || !floorPlanId) return null;

  const seed = buildFloorPlanSeedFromDraft(params.draft, floorPlanId);
  if (seed.zones.length === 0) return null;

  const existingOnPlan = (params.existingZones ?? []).filter(
    (zone) => zone.floorPlanId === floorPlanId,
  );
  const zones: Zone[] = [...existingOnPlan];
  const zoneByKey = new Map<FloorPlanSeedZone["key"], Zone>();

  for (const zoneSpec of seed.zones) {
    const existing = zones.find(
      (zone) =>
        zoneHasVisualRect(zone) &&
        zone.name.trim().toLowerCase() === zoneSpec.name.trim().toLowerCase(),
    );
    if (existing) {
      zoneByKey.set(zoneSpec.key, existing);
      continue;
    }

    const created: Zone = {
      id: newLocalFirestoreId("zones"),
      restaurantId,
      floorPlanId,
      name: zoneSpec.name,
      x: zoneSpec.x,
      y: zoneSpec.y,
      width: zoneSpec.w,
      height: zoneSpec.h,
    };
    zones.push(created);
    zoneByKey.set(zoneSpec.key, created);
  }

  const mainZone = zoneByKey.get("main");
  if (!mainZone) return null;

  const elements: FloorElement[] = [];
  for (const piece of seed.elements) {
    const zone =
      (piece.zoneKey ? zoneByKey.get(piece.zoneKey) : undefined) ?? mainZone;
    const defSz = getDefaultSizeForPlanElementType(piece.type);
    const w = piece.width ?? defSz.width;
    const h = piece.height ?? defSz.height;
    const decorative = isDecorativePlanElementType(piece.type);
    elements.push({
      id: newLocalFirestoreId("tables"),
      restaurantId,
      floorPlanId,
      name: resolveElementName(piece.type, piece.name, elements),
      type: piece.type,
      status: TABLE_MAP_STATUS_FREE,
      zoneId: zone.id,
      zoneName: zone.name,
      zone: zone.name,
      tableShape: piece.tableShape ?? "square",
      seats: decorative ? 0 : (piece.seats ?? 4),
      x: Math.round(piece.x),
      y: Math.round(piece.y),
      width: w,
      height: h,
      isActive: true,
    });
  }

  return {
    floorPlanId,
    restaurantId,
    elements,
    zones,
    canvas: {
      width: params.canvas.width,
      height: params.canvas.height,
    },
    revision: 1,
    source: "assistant",
  };
}
