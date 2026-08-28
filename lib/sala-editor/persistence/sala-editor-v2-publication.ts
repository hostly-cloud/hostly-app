export * from "@/lib/sala-editor/persistence/sala-editor-v2-publication-core";

import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import {
  publishSalaEditorV2Phase1ToLegacy as publishSalaEditorV2Phase1ToLegacyCore,
} from "@/lib/sala-editor/persistence/sala-editor-v2-publication-core";
import {
  commitSalaEditorV2Retirement,
  prepareSalaEditorV2Retirement,
} from "@/lib/sala-editor/persistence/sala-editor-v2-floor-plan-retirement";
import { applySalaEditorPublicationLinks } from "@/lib/sala-editor/persistence/apply-sala-editor-publication-links";
import { publishSalaEditorSnapshotApi } from "@/lib/sala-editor/persistence/publish-sala-editor-snapshot-api";

/**
 * Publicador del Editor V2 con retirada segura y checkpoint V2 completo.
 *
 * Orden de commit:
 * 1. valida qué floorPlans podrían retirarse;
 * 2. publica la proyección operativa compatible con TPV;
 * 3. retira de forma segura mapas eliminados;
 * 4. aplica al snapshot de publicación los IDs operativos creados durante el paso 2;
 * 5. materializa exactamente ese documento como `salaEditorMaps/published` mediante
 *    un endpoint Admin autenticado.
 *
 * El snapshot publicado representa el estado exacto sobre el que se ejecutó la
 * publicación. Ediciones realizadas después de pulsar Publicar permanecen en
 * draft y no contaminan la versión ya publicada.
 */
export async function publishSalaEditorV2Phase1ToLegacy(params: {
  restaurantId: string;
  document: SalaEditorDocument;
  replaceLegacyVisualMap?: boolean;
}) {
  const retirementPlan = await prepareSalaEditorV2Retirement({
    restaurantId: params.restaurantId,
    document: params.document,
  });

  const result = await publishSalaEditorV2Phase1ToLegacyCore(params);
  const retirement = await commitSalaEditorV2Retirement({
    restaurantId: params.restaurantId,
    plan: retirementPlan,
  });

  const publicationCheckpoint = applySalaEditorPublicationLinks(
    params.document,
    result,
  );
  const publishedSnapshot = await publishSalaEditorSnapshotApi({
    document: publicationCheckpoint.document,
    sourceDraftUpdatedAt: params.document.updatedAt,
  });

  return {
    ...result,
    floorPlansRetired: retirement.floorPlansRetired,
    retiredFloorPlanIds: retirementPlan.floorPlans.map((plan) => plan.id),
    tablesRetiredWithFloorPlans: retirement.tablesRetired,
    publicationLinkedCount: publicationCheckpoint.linkedCount,
    publishedAt: publishedSnapshot.publishedAt,
    publishedSnapshotVersion: publishedSnapshot.snapshotVersion,
  };
}
