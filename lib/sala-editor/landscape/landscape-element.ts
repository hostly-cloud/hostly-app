export type LandscapeElementId = string;

export type LandscapeElementKind =
  | "rectangularPlanter"
  | "roundPlanter"
  | "palm"
  | "olive"
  | "tree"
  | "shrub"
  | "hedge"
  | "flowers"
  | "rock"
  | "fountain";

export type ResizableLandscapeElementKind = LandscapeElementKind;

export type LandscapeElement = {
  id: LandscapeElementId;
  espacioId: string;
  kind: LandscapeElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  locked: boolean;
  visible: boolean;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type LandscapeElementDraft = Omit<LandscapeElement, "id" | "createdAt" | "updatedAt">;

export const LANDSCAPE_ELEMENT_DEFAULT_SIZE: Record<LandscapeElementKind, { width: number; height: number }> = {
  rectangularPlanter: { width: 152, height: 50 },
  roundPlanter: { width: 76, height: 76 },
  palm: { width: 88, height: 88 },
  olive: { width: 88, height: 84 },
  tree: { width: 96, height: 96 },
  shrub: { width: 76, height: 64 },
  hedge: { width: 156, height: 48 },
  flowers: { width: 104, height: 62 },
  rock: { width: 82, height: 64 },
  fountain: { width: 92, height: 92 },
};

const LANDSCAPE_ELEMENT_KINDS: readonly LandscapeElementKind[] = [
  "rectangularPlanter",
  "roundPlanter",
  "palm",
  "olive",
  "tree",
  "shrub",
  "hedge",
  "flowers",
  "rock",
  "fountain",
] as const;

export function isLandscapeElementKind(value: unknown): value is LandscapeElementKind {
  return typeof value === "string" && (LANDSCAPE_ELEMENT_KINDS as readonly string[]).includes(value);
}

export function isResizableLandscapeElementKind(value: LandscapeElementKind): value is ResizableLandscapeElementKind {
  return (LANDSCAPE_ELEMENT_KINDS as readonly string[]).includes(value);
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

export function createLandscapeElement(draft: LandscapeElementDraft): LandscapeElement {
  const now = Date.now();
  return {
    id: `landscape-${now}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
    metadata: draft.metadata ? { ...draft.metadata } : {},
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeLandscapeElements(elements: readonly unknown[], validEspacioIds: ReadonlySet<string>): LandscapeElement[] {
  const normalized: LandscapeElement[] = [];
  for (const raw of elements) {
    if (!isPlainObject(raw)) continue;
    const kind = raw.kind;
    const espacioId = raw.espacioId;
    const id = raw.id;
    if (typeof id !== "string" || typeof espacioId !== "string" || !validEspacioIds.has(espacioId) || !isLandscapeElementKind(kind)) continue;
    const defaultSize = LANDSCAPE_ELEMENT_DEFAULT_SIZE[kind];
    normalized.push({
      id,
      espacioId,
      kind,
      x: numberOrDefault(raw.x, 0),
      y: numberOrDefault(raw.y, 0),
      width: Math.max(12, numberOrDefault(raw.width, defaultSize.width)),
      height: Math.max(12, numberOrDefault(raw.height, defaultSize.height)),
      locked: booleanOrDefault(raw.locked, false),
      visible: booleanOrDefault(raw.visible, true),
      ...(isPlainObject(raw.metadata) ? { metadata: { ...raw.metadata } } : {}),
      createdAt: numberOrDefault(raw.createdAt, Date.now()),
      updatedAt: numberOrDefault(raw.updatedAt, Date.now()),
    });
  }
  return normalized;
}
