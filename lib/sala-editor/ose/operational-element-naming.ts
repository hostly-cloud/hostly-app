/**
 * Numeración automática de instancias operativas por tipo y espacio.
 */

import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";

export function countOperationalElementInstancesByType(
  instances: readonly OperationalElementInstance[],
  spaceId: string,
  elementType: OperationalElementType,
): number {
  return instances.filter(
    (instance) =>
      instance.spaceId === spaceId && instance.elementType === elementType,
  ).length;
}

export function nextOperationalElementInstanceName(
  instances: readonly OperationalElementInstance[],
  spaceId: string,
  elementType: OperationalElementType,
): string {
  const label =
    getOperationalElementCatalogItem(elementType)?.label ?? elementType;
  const nextIndex =
    countOperationalElementInstancesByType(instances, spaceId, elementType) + 1;
  return `${label} ${nextIndex}`;
}
