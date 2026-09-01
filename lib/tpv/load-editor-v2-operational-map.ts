import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import { loadSalaEditorDraftSource } from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { loadSalaEditorPublished } from "@/lib/sala-editor/persistence/sala-editor-published-store";

export type TpvEditorV2OperationalMapSource =
  | "published"
  | "draft-migration";

export type TpvEditorV2OperationalMap = {
  source: TpvEditorV2OperationalMapSource;
  document: SalaEditorDocument;
  publishedAt: number | null;
  sourceDraftUpdatedAt: number | null;
};

type OperationalMapLoaders = {
  loadPublished: typeof loadSalaEditorPublished;
  loadDraft: typeof loadSalaEditorDraftSource;
};

const defaultOperationalMapLoaders: OperationalMapLoaders = {
  loadPublished: loadSalaEditorPublished,
  loadDraft: loadSalaEditorDraftSource,
};

const OPERATIONAL_MAP_CACHE_TTL_MS = 30_000;
type OperationalMapLoadResult = TpvEditorV2OperationalMap | null;
type OperationalMapCacheEntry = {
  expiresAt: number;
  promise: Promise<OperationalMapLoadResult>;
};

const defaultOperationalMapCache = new Map<string, OperationalMapCacheEntry>();

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Repairs compatibility identities without importing draft geometry or visual
 * changes into the published TPV map. Older published snapshots can predate
 * the persistence of links that were written back to the draft after publish.
 */
export function restorePublishedOperationalIdentityLinks(
  published: SalaEditorDocument,
  draft: SalaEditorDocument | null,
): SalaEditorDocument {
  if (!draft) return published;

  const draftSpacesById = new Map(draft.espacios.map((space) => [space.id, space]));
  const draftInstancesById = new Map(
    draft.operationalElementInstances.map((instance) => [instance.id, instance]),
  );
  let changed = false;

  const espacios = published.espacios.map((space) => {
    if (stringOrEmpty(space.legacyFloorPlanId)) return space;
    const legacyFloorPlanId = stringOrEmpty(
      draftSpacesById.get(space.id)?.legacyFloorPlanId,
    );
    if (!legacyFloorPlanId) return space;
    changed = true;
    return { ...space, legacyFloorPlanId };
  });

  const operationalElementInstances = published.operationalElementInstances.map(
    (instance) => {
      if (stringOrEmpty(instance.metadata.legacyTableId)) return instance;
      const draftInstance = draftInstancesById.get(instance.id);
      const legacyTableId = stringOrEmpty(draftInstance?.metadata.legacyTableId);
      if (!legacyTableId) return instance;
      changed = true;
      return {
        ...instance,
        metadata: { ...instance.metadata, legacyTableId },
      };
    },
  );

  return changed
    ? { ...published, espacios, operationalElementInstances }
    : published;
}

/**
 * Temporary migration loader for the TPV Editor V2 map.
 *
 * `published` is authoritative as soon as it exists. Draft contributes only
 * missing compatibility IDs for instances already present in published; its
 * geometry and visual content are never imported. Without a published snapshot,
 * draft remains the temporary migration fallback. Published read/validation
 * errors are deliberately not swallowed.
 */
async function loadTpvEditorV2OperationalMapUncached(
  restaurantId: string,
  loaders: OperationalMapLoaders,
): Promise<TpvEditorV2OperationalMap | null> {
  const draftPending = loaders.loadDraft(restaurantId).then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ status: "rejected" as const, reason }),
  );
  const published = await loaders.loadPublished(restaurantId);
  const draftResult = await draftPending;
  if (published) {
    const draft = draftResult.status === "fulfilled" ? draftResult.value : null;
    return {
      source: "published",
      document: restorePublishedOperationalIdentityLinks(
        published.document,
        draft?.document ?? null,
      ),
      publishedAt: published.publishedAt,
      sourceDraftUpdatedAt: published.sourceDraftUpdatedAt ?? null,
    };
  }

  if (draftResult.status === "rejected") {
    throw draftResult.reason;
  }

  const draft = draftResult.value;
  if (!draft) return null;

  return {
    source: "draft-migration",
    document: draft.document,
    publishedAt: null,
    sourceDraftUpdatedAt: draft.updatedAt,
  };
}

export function loadTpvEditorV2OperationalMap(
  restaurantId: string,
  loaders: OperationalMapLoaders = defaultOperationalMapLoaders,
): Promise<TpvEditorV2OperationalMap | null> {
  const rid = String(restaurantId ?? "").trim();
  if (loaders !== defaultOperationalMapLoaders) {
    return loadTpvEditorV2OperationalMapUncached(rid, loaders);
  }

  const now = Date.now();
  const cached = defaultOperationalMapCache.get(rid);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = loadTpvEditorV2OperationalMapUncached(rid, loaders).catch(
    (error) => {
      if (defaultOperationalMapCache.get(rid)?.promise === promise) {
        defaultOperationalMapCache.delete(rid);
      }
      throw error;
    },
  );
  defaultOperationalMapCache.set(rid, {
    expiresAt: now + OPERATIONAL_MAP_CACHE_TTL_MS,
    promise,
  });
  return promise;
}

/** Starts the read-only V2 map load before the operator gate opens the TPV. */
export function preloadTpvEditorV2OperationalMap(
  restaurantId: string,
): Promise<TpvEditorV2OperationalMap | null> {
  return loadTpvEditorV2OperationalMap(restaurantId);
}
