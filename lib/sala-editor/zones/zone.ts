export type ZoneId = string;

export type ZoneType =
  | "dining"
  | "terrace"
  | "garden"
  | "pool"
  | "vip"
  | "lounge"
  | "bar"
  | "beach"
  | "rooftop"
  | "privateRoom"
  | "events";

export type Zone = {
  id: ZoneId;
  espacioId: string;
  type: ZoneType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  locked: boolean;
  visible: boolean;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type ZoneDraft = Omit<Zone, "id" | "createdAt" | "updatedAt">;

export const DEFAULT_ZONE_SIZE = {
  width: 220,
  height: 150,
} as const;

const ZONE_TYPES: readonly ZoneType[] = [
  "dining",
  "terrace",
  "garden",
  "pool",
  "vip",
  "lounge",
  "bar",
  "beach",
  "rooftop",
  "privateRoom",
  "events",
] as const;

export function isZoneType(value: unknown): value is ZoneType {
  return typeof value === "string" && (ZONE_TYPES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

export function createZone(draft: ZoneDraft): Zone {
  const now = Date.now();
  return {
    id: `zone-${now}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
    metadata: draft.metadata ? { ...draft.metadata } : {},
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeZones(
  zones: readonly unknown[],
  validEspacioIds: ReadonlySet<string>,
): Zone[] {
  const normalized: Zone[] = [];

  for (const raw of zones) {
    if (!isPlainObject(raw)) continue;
    const id = raw.id;
    const espacioId = raw.espacioId;
    const type = raw.type;

    if (
      typeof id !== "string" ||
      typeof espacioId !== "string" ||
      !validEspacioIds.has(espacioId) ||
      !isZoneType(type)
    ) {
      continue;
    }

    normalized.push({
      id,
      espacioId,
      type,
      name: stringOrDefault(raw.name, "Zona"),
      x: numberOrDefault(raw.x, 0),
      y: numberOrDefault(raw.y, 0),
      width: Math.max(48, numberOrDefault(raw.width, DEFAULT_ZONE_SIZE.width)),
      height: Math.max(48, numberOrDefault(raw.height, DEFAULT_ZONE_SIZE.height)),
      color: stringOrDefault(raw.color, "#315f7d"),
      locked: booleanOrDefault(raw.locked, false),
      visible: booleanOrDefault(raw.visible, true),
      ...(isPlainObject(raw.metadata) ? { metadata: { ...raw.metadata } } : {}),
      createdAt: numberOrDefault(raw.createdAt, Date.now()),
      updatedAt: numberOrDefault(raw.updatedAt, Date.now()),
    });
  }

  return normalized;
}
