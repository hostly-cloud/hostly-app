import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import { cloneMetadataWithoutOperationalRuntimeLinks } from "@/lib/sala-editor/metadata/operational-runtime-metadata";

type IdMaps = {
  spaces: Map<string, string>;
  surfaces: Map<string, string>;
  zones: Map<string, string>;
  walls: Map<string, string>;
  wallAttachments: Map<string, string>;
  structuralElements: Map<string, string>;
  landscapeElements: Map<string, string>;
  operationalElements: Map<string, string>;
  operationalElementInstances: Map<string, string>;
};

function createLocalDuplicateId(prefix: string, usedIds: Set<string>): string {
  let id = "";
  do {
    id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("es");
}

function copyBaseName(name: string): string {
  const trimmed = name.trim() || "Espacio";
  return trimmed.replace(/\s+\(copia(?:\s+\d+)?\)$/i, "");
}

export function nextSalaEspacioCopyName(
  sourceName: string,
  existingNames: readonly string[],
): string {
  const baseName = copyBaseName(sourceName);
  const used = new Set(existingNames.map(normalizeName));
  const first = `${baseName} (copia)`;
  if (!used.has(normalizeName(first))) return first;

  let index = 2;
  while (used.has(normalizeName(`${baseName} (copia ${index})`))) {
    index += 1;
  }
  return `${baseName} (copia ${index})`;
}

function resolveMappedId(value: string, maps: IdMaps): string {
  return (
    maps.spaces.get(value) ??
    maps.surfaces.get(value) ??
    maps.zones.get(value) ??
    maps.walls.get(value) ??
    maps.wallAttachments.get(value) ??
    maps.structuralElements.get(value) ??
    maps.landscapeElements.get(value) ??
    maps.operationalElements.get(value) ??
    maps.operationalElementInstances.get(value) ??
    value
  );
}

function cloneMetadata<T>(value: T, maps: IdMaps): T {
  return cloneMetadataWithoutOperationalRuntimeLinks(value, {
    mapString: (entry) => resolveMappedId(entry, maps),
  });
}

function mapNullableId(value: string | null | undefined, map: Map<string, string>): string | null {
  if (!value) return null;
  return map.get(value) ?? value;
}

function collectUsedIds(document: SalaEditorDocument): Set<string> {
  return new Set([
    ...document.espacios.map((item) => item.id),
    ...document.surfaceObjects.map((item) => item.id),
    ...document.zones.map((item) => item.id),
    ...document.walls.map((item) => item.id),
    ...document.wallAttachments.map((item) => item.id),
    ...document.structuralElements.map((item) => item.id),
    ...document.landscapeElements.map((item) => item.id),
    ...document.operationalElements.map((item) => item.id),
    ...document.operationalElementInstances.map((item) => item.id),
  ]);
}

export function duplicateSalaEditorSpace(
  document: SalaEditorDocument,
  sourceSpaceId: string,
): SalaEditorDocument | null {
  const sourceSpace = document.espacios.find((space) => space.id === sourceSpaceId);
  if (!sourceSpace) return null;

  const now = Date.now();
  const usedIds = collectUsedIds(document);
  const nextSpaceId = createLocalDuplicateId("local", usedIds);
  const maps: IdMaps = {
    spaces: new Map([[sourceSpace.id, nextSpaceId]]),
    surfaces: new Map(),
    zones: new Map(),
    walls: new Map(),
    wallAttachments: new Map(),
    structuralElements: new Map(),
    landscapeElements: new Map(),
    operationalElements: new Map(),
    operationalElementInstances: new Map(),
  };

  for (const surface of document.surfaceObjects) {
    if (surface.espacioId === sourceSpace.id) {
      maps.surfaces.set(surface.id, createLocalDuplicateId("surface", usedIds));
    }
  }
  for (const zone of document.zones) {
    if (zone.espacioId === sourceSpace.id) {
      maps.zones.set(zone.id, createLocalDuplicateId("zone", usedIds));
    }
  }
  for (const wall of document.walls) {
    if (wall.espacioId === sourceSpace.id) {
      maps.walls.set(wall.id, createLocalDuplicateId("wall", usedIds));
    }
  }
  for (const attachment of document.wallAttachments) {
    if (maps.walls.has(attachment.wallId)) {
      maps.wallAttachments.set(
        attachment.id,
        createLocalDuplicateId("wall-attachment", usedIds),
      );
    }
  }
  for (const element of document.structuralElements) {
    if (element.espacioId === sourceSpace.id) {
      maps.structuralElements.set(
        element.id,
        createLocalDuplicateId("struct", usedIds),
      );
    }
  }
  for (const element of document.landscapeElements) {
    if (element.espacioId === sourceSpace.id) {
      maps.landscapeElements.set(
        element.id,
        createLocalDuplicateId("landscape", usedIds),
      );
    }
  }
  for (const element of document.operationalElements) {
    if (element.espacioId === sourceSpace.id) {
      maps.operationalElements.set(
        element.id,
        createLocalDuplicateId("operational", usedIds),
      );
    }
  }
  for (const instance of document.operationalElementInstances) {
    if (instance.spaceId === sourceSpace.id) {
      maps.operationalElementInstances.set(
        instance.id,
        createLocalDuplicateId("op-inst", usedIds),
      );
    }
  }

  const sourceIndex = document.espacios.findIndex((space) => space.id === sourceSpace.id);
  const nextSpace: SalaEspacio = {
    ...sourceSpace,
    id: nextSpaceId,
    name: nextSalaEspacioCopyName(
      sourceSpace.name,
      document.espacios.map((space) => space.name),
    ),
    sortOrder: Math.max(...document.espacios.map((space) => space.sortOrder), 0) + 10,
    legacyFloorPlanId: undefined,
    legacyZoneId: undefined,
    createdAt: now,
    updatedAt: now,
    ...(sourceSpace.base ? { base: cloneMetadata(sourceSpace.base, maps) } : {}),
  };

  const espacios = [...document.espacios];
  espacios.splice(sourceIndex + 1, 0, nextSpace);

  return {
    ...document,
    espacios,
    surfaceObjects: [
      ...document.surfaceObjects,
      ...document.surfaceObjects
        .filter((surface) => surface.espacioId === sourceSpace.id)
        .map((surface) => ({
          ...surface,
          id: maps.surfaces.get(surface.id)!,
          espacioId: nextSpaceId,
        })),
    ],
    zones: [
      ...document.zones,
      ...document.zones
        .filter((zone) => zone.espacioId === sourceSpace.id)
        .map((zone) => ({
          ...zone,
          id: maps.zones.get(zone.id)!,
          espacioId: nextSpaceId,
          metadata: zone.metadata ? cloneMetadata(zone.metadata, maps) : undefined,
          createdAt: now,
          updatedAt: now,
        })),
    ],
    walls: [
      ...document.walls,
      ...document.walls
        .filter((wall) => wall.espacioId === sourceSpace.id)
        .map((wall) => ({
          ...wall,
          id: maps.walls.get(wall.id)!,
          espacioId: nextSpaceId,
          metadata: wall.metadata ? cloneMetadata(wall.metadata, maps) : undefined,
        })),
    ],
    wallAttachments: [
      ...document.wallAttachments,
      ...document.wallAttachments
        .filter((attachment) => maps.walls.has(attachment.wallId))
        .map((attachment) => ({
          ...attachment,
          id: maps.wallAttachments.get(attachment.id)!,
          wallId: maps.walls.get(attachment.wallId)!,
          metadata: attachment.metadata
            ? cloneMetadata(attachment.metadata, maps)
            : undefined,
        })),
    ],
    structuralElements: [
      ...document.structuralElements,
      ...document.structuralElements
        .filter((element) => element.espacioId === sourceSpace.id)
        .map((element) => ({
          ...element,
          id: maps.structuralElements.get(element.id)!,
          espacioId: nextSpaceId,
          config: element.config ? { ...element.config } : undefined,
          metadata: element.metadata ? cloneMetadata(element.metadata, maps) : undefined,
          createdAt: now,
          updatedAt: now,
        })),
    ],
    landscapeElements: [
      ...document.landscapeElements,
      ...document.landscapeElements
        .filter((element) => element.espacioId === sourceSpace.id)
        .map((element) => ({
          ...element,
          id: maps.landscapeElements.get(element.id)!,
          espacioId: nextSpaceId,
          metadata: element.metadata ? cloneMetadata(element.metadata, maps) : undefined,
          createdAt: now,
          updatedAt: now,
        })),
    ],
    operationalElements: [
      ...document.operationalElements,
      ...document.operationalElements
        .filter((element) => element.espacioId === sourceSpace.id)
        .map((element) => ({
          ...element,
          id: maps.operationalElements.get(element.id)!,
          espacioId: nextSpaceId,
          config: element.config ? { ...element.config } : undefined,
          legacyTableId: undefined,
          createdAt: now,
          updatedAt: now,
        })),
    ],
    operationalElementInstances: [
      ...document.operationalElementInstances,
      ...document.operationalElementInstances
        .filter((instance) => instance.spaceId === sourceSpace.id)
        .map((instance) => ({
          ...instance,
          id: maps.operationalElementInstances.get(instance.id)!,
          spaceId: nextSpaceId,
          zoneId: mapNullableId(instance.zoneId, maps.zones),
          position: { ...instance.position },
          metadata: cloneMetadata(instance.metadata, maps),
          state: instance.state,
        })),
    ],
    navigation: {
      ...document.navigation,
      selectedEspacioId: nextSpaceId,
      phase: "espacios",
    },
    updatedAt: now,
  };
}
