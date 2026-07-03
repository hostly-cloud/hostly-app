/**
 * Elementos estructurales del espacio (Fase 2).
 * Geometría y configuración; aún no conectados al render legacy.
 */

import type { SalaEspacioId } from "@/lib/sala-editor/types/espacio";

export type SalaStructuralElementId = string;

/** Tipos estructurales configurables dentro de un espacio. */
export type SalaStructuralElementKind =
  | "wall"
  | "glass"
  | "door"
  | "squareColumn"
  | "roundColumn"
  | "divider"
  | "bar"
  | "stage"
  | "decoration"
  | "planter"
  | "separator";

export type SalaStructuralElementConfig = {
  /** Etiqueta visible en inspector (opcional). */
  label?: string;
  /** Opacidad 0–1 para cristales y separadores. */
  opacity?: number;
  /** Material o acabado sugerido (solo UI futura). */
  material?: string;
  /** Si el elemento bloquea colocación encima (pared, barra fija). */
  blocksPlacement?: boolean;
};

export type SalaStructuralElementMetadata = Record<string, unknown>;

/** Elemento estructural posicionado en el lienzo del espacio. */
export type SalaStructuralElement = {
  id: SalaStructuralElementId;
  espacioId: SalaEspacioId;
  kind: SalaStructuralElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  locked?: boolean;
  config?: SalaStructuralElementConfig;
  metadata?: SalaStructuralElementMetadata;
  createdAt?: number;
  updatedAt?: number;
};

export type SalaStructuralObjectKind = "squareColumn" | "roundColumn" | "divider";

export type SalaStructuralElementDraft = Omit<
  SalaStructuralElement,
  "id" | "createdAt" | "updatedAt"
>;

export const STRUCTURAL_OBJECT_DEFAULT_SIZE: Record<
  SalaStructuralObjectKind,
  { width: number; height: number }
> = {
  squareColumn: { width: 48, height: 48 },
  roundColumn: { width: 48, height: 48 },
  divider: { width: 128, height: 24 },
};

export function isSalaStructuralObjectKind(
  kind: SalaStructuralElementKind | null | undefined,
): kind is SalaStructuralObjectKind {
  return kind === "squareColumn" || kind === "roundColumn" || kind === "divider";
}

export function createSalaStructuralElement(
  draft: SalaStructuralElementDraft,
): SalaStructuralElement {
  const now = Date.now();
  return {
    id: `struct-${now}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
    ...(draft.config ? { config: { ...draft.config } } : {}),
    ...(draft.metadata ? { metadata: { ...draft.metadata } } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSalaStructuralElementKind(value: unknown): value is SalaStructuralElementKind {
  return (
    value === "wall" ||
    value === "glass" ||
    value === "door" ||
    value === "squareColumn" ||
    value === "roundColumn" ||
    value === "divider" ||
    value === "bar" ||
    value === "stage" ||
    value === "decoration" ||
    value === "planter" ||
    value === "separator"
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSalaStructuralElements(
  elements: readonly unknown[],
  validEspacioIds: ReadonlySet<string>,
): SalaStructuralElement[] {
  const normalized: SalaStructuralElement[] = [];

  for (const raw of elements) {
    if (!isPlainObject(raw)) continue;
    const entry = raw as Partial<SalaStructuralElement>;
    if (typeof entry.id !== "string" || entry.id.trim() === "") continue;
    if (typeof entry.espacioId !== "string" || !validEspacioIds.has(entry.espacioId)) {
      continue;
    }
    if (!isSalaStructuralElementKind(entry.kind)) continue;
    if (
      !isFiniteNumber(entry.x) ||
      !isFiniteNumber(entry.y) ||
      !isFiniteNumber(entry.width) ||
      !isFiniteNumber(entry.height) ||
      entry.width <= 0 ||
      entry.height <= 0
    ) {
      continue;
    }

    normalized.push({
      id: entry.id,
      espacioId: entry.espacioId,
      kind: entry.kind,
      x: entry.x,
      y: entry.y,
      width: entry.width,
      height: entry.height,
      ...(isFiniteNumber(entry.rotation) ? { rotation: entry.rotation } : {}),
      ...(entry.locked != null ? { locked: entry.locked === true } : {}),
      ...(isPlainObject(entry.config)
        ? { config: { ...entry.config } }
        : {}),
      ...(isPlainObject(entry.metadata)
        ? { metadata: { ...entry.metadata } }
        : {}),
      ...(isFiniteNumber(entry.createdAt) ? { createdAt: entry.createdAt } : {}),
      ...(isFiniteNumber(entry.updatedAt) ? { updatedAt: entry.updatedAt } : {}),
    });
  }

  return normalized;
}
