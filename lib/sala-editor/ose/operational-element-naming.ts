/**
 * Numeración automática de instancias operativas por tipo y espacio.
 */

import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import type { OperationalElementType } from "@/lib/sala-editor/ose/operational-element";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

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
  spaceName = "",
): string {
  return suggestOperationalElementInstanceName(
    instances,
    spaceId,
    elementType,
    spaceName,
  ).name;
}

export type OperationalElementNameSuggestion = {
  name: string;
  correctedFrom: string | null;
  spaceSuffix: string | null;
};

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
}

function spaceSuffixFromName(spaceName: string): string {
  const letters = spaceName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .replace(/^(MAPA|ZONA|ESPACIO)/, "");
  return letters.charAt(0) || "Z";
}

function nextIndexInSpace(
  instances: readonly OperationalElementInstance[],
  spaceId: string,
  label: string,
): number {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedLabel}\\s+(\\d+)`, "i");
  const indexes = instances
    .filter((instance) => instance.spaceId === spaceId)
    .map((instance) => Number(pattern.exec(instance.name.trim())?.[1] ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return indexes.length > 0 ? Math.max(...indexes) + 1 : 1;
}

export function suggestOperationalElementInstanceName(
  instances: readonly OperationalElementInstance[],
  spaceId: string,
  elementType: OperationalElementType,
  spaceName = "",
): OperationalElementNameSuggestion {
  const label =
    getOperationalElementCatalogItem(elementType)?.label ?? elementType;
  const nextIndex = nextIndexInSpace(instances, spaceId, label);
  const baseName = `${label} ${nextIndex}`;
  const occupied = new Set(
    instances
      .filter((instance) => instance.elementType === elementType)
      .map((instance) => normalizeName(instance.name)),
  );
  if (!occupied.has(normalizeName(baseName))) {
    return { name: baseName, correctedFrom: null, spaceSuffix: null };
  }

  const suffix = spaceSuffixFromName(spaceName);
  let candidate = `${label} ${nextIndex}${suffix}`;
  let discriminator = 2;
  while (occupied.has(normalizeName(candidate))) {
    candidate = `${label} ${nextIndex}${suffix}${discriminator}`;
    discriminator += 1;
  }
  return { name: candidate, correctedFrom: baseName, spaceSuffix: suffix };
}

export type OperationalTableNameCorrection = {
  instanceId: string;
  spaceId: string;
  previousName: string;
  nextName: string;
};

/**
 * Conserva la primera aparición de cada nombre y corrige solo las posteriores.
 * Se usa antes de publicar borradores antiguos creados cuando la numeración era
 * local por espacio. No publica automáticamente: el usuario puede revisar o
 * deshacer los cambios antes de volver a pulsar Publicar.
 */
export function autoCorrectDuplicateOperationalTableNames(
  document: SalaEditorDocument,
): { document: SalaEditorDocument; corrections: OperationalTableNameCorrection[] } {
  const spacesById = new Map(document.espacios.map((space) => [space.id, space]));
  const occupied = new Set<string>();
  const corrections: OperationalTableNameCorrection[] = [];

  const operationalElementInstances = document.operationalElementInstances.map(
    (instance) => {
      if (instance.elementType !== "TABLE") return instance;
      const normalized = normalizeName(instance.name);
      if (!normalized || !occupied.has(normalized)) {
        if (normalized) occupied.add(normalized);
        return instance;
      }

      const suffix = spaceSuffixFromName(
        spacesById.get(instance.spaceId)?.name ?? "",
      );
      const numberMatch = /^(.*?\s)(\d+)([a-z0-9]*)$/i.exec(instance.name.trim());
      const candidateBase = numberMatch
        ? `${numberMatch[1]}${numberMatch[2]}${suffix}`
        : `${instance.name.trim()} ${suffix}`;
      let nextName = candidateBase;
      let discriminator = 2;
      while (occupied.has(normalizeName(nextName))) {
        nextName = `${candidateBase}${discriminator}`;
        discriminator += 1;
      }
      occupied.add(normalizeName(nextName));
      corrections.push({
        instanceId: instance.id,
        spaceId: instance.spaceId,
        previousName: instance.name,
        nextName,
      });
      return {
        ...instance,
        name: nextName,
        metadata: {
          ...instance.metadata,
          hostlyAutoCorrectedFrom: instance.name,
        },
      };
    },
  );

  if (corrections.length === 0) return { document, corrections };
  return {
    document: {
      ...document,
      operationalElementInstances,
      updatedAt: Date.now(),
    },
    corrections,
  };
}
