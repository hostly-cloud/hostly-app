/**
 * Variante visual ligera para instancias OSE.
 * Separa apariencia del tipo operativo (p. ej. TABLE + round).
 */

import type { OperationalElementMetadata } from "@/lib/sala-editor/ose/operational-element";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";

export type OperationalVisualVariant = "round" | "square" | "rectangular";

export const OPERATIONAL_VISUAL_VARIANT_METADATA_KEY = "visualVariant" as const;

export const DEFAULT_TABLE_VISUAL_VARIANT: OperationalVisualVariant = "rectangular";

const VALID_VARIANTS: readonly OperationalVisualVariant[] = [
  "round",
  "square",
  "rectangular",
] as const;

export function isOperationalVisualVariant(
  value: unknown,
): value is OperationalVisualVariant {
  return (
    typeof value === "string" &&
    (VALID_VARIANTS as readonly string[]).includes(value)
  );
}

export function resolveOperationalVisualVariant(
  metadata: OperationalElementMetadata | undefined,
  elementType: OperationalElementType,
): OperationalVisualVariant | null {
  const raw = metadata?.[OPERATIONAL_VISUAL_VARIANT_METADATA_KEY];
  if (isOperationalVisualVariant(raw)) return raw;
  if (elementType === "TABLE") return DEFAULT_TABLE_VISUAL_VARIANT;
  return null;
}

export function withOperationalVisualVariant(
  metadata: OperationalElementMetadata,
  visualVariant: OperationalVisualVariant,
): OperationalElementMetadata {
  return {
    ...metadata,
    [OPERATIONAL_VISUAL_VARIANT_METADATA_KEY]: visualVariant,
  };
}
