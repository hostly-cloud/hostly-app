import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";

export type SalaEditorPublicationTableLink = {
  instanceId: string;
  legacyTableIdAfter: string;
};

export type SalaEditorPublicationSpaceLink = {
  spaceId: string;
  legacyFloorPlanIdAfter: string;
};

export type SalaEditorPublicationLinks = {
  newOperationalTableLinks: readonly SalaEditorPublicationTableLink[];
  newSpaceFloorPlanLinks: readonly SalaEditorPublicationSpaceLink[];
};

export type SalaEditorPublicationLinkApplication = {
  document: SalaEditorDocument;
  linkedCount: number;
};

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Applies identity links created by the operational publication step back onto
 * the canonical Editor V2 document.
 *
 * This function is intentionally pure and Firebase-free so the exact same
 * transformation can be used by the current client publisher and by the
 * server-side publication pipeline. Visual geometry is never derived from
 * these legacy identifiers; they remain compatibility identities only.
 */
export function applySalaEditorPublicationLinks(
  sourceDocument: SalaEditorDocument,
  links: SalaEditorPublicationLinks,
  updatedAt = Date.now(),
): SalaEditorPublicationLinkApplication {
  const linksByInstanceId = new Map(
    links.newOperationalTableLinks.map((link) => [link.instanceId, link]),
  );
  const linksBySpaceId = new Map(
    links.newSpaceFloorPlanLinks.map((link) => [link.spaceId, link]),
  );

  let linkedCount = 0;
  const espacios = sourceDocument.espacios.map((space) => {
    const link = linksBySpaceId.get(space.id);
    if (!link || stringOrEmpty(space.legacyFloorPlanId)) return space;
    linkedCount += 1;
    return {
      ...space,
      legacyFloorPlanId: link.legacyFloorPlanIdAfter,
    };
  });

  const operationalElementInstances = sourceDocument.operationalElementInstances.map(
    (instance) => {
      const link = linksByInstanceId.get(instance.id);
      if (!link) return instance;
      const currentLegacyTableId = stringOrEmpty(instance.metadata.legacyTableId);
      if (currentLegacyTableId) return instance;
      linkedCount += 1;
      return {
        ...instance,
        metadata: {
          ...instance.metadata,
          legacyTableId: link.legacyTableIdAfter,
        },
      };
    },
  );

  if (linkedCount === 0) {
    return { document: sourceDocument, linkedCount: 0 };
  }

  return {
    document: {
      ...sourceDocument,
      espacios,
      operationalElementInstances,
      updatedAt,
    },
    linkedCount,
  };
}
