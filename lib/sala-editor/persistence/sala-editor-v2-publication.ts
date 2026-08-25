export * from "@/lib/sala-editor/persistence/sala-editor-v2-publication-core";

import type { SalaEditorDocument } from "@/lib/sala-editor/types/editor-document";
import {
  publishSalaEditorV2Phase1ToLegacy as publishSalaEditorV2Phase1ToLegacyCore,
} from "@/lib/sala-editor/persistence/sala-editor-v2-publication-core";
import {
  commitSalaEditorV2Retirement,
  prepareSalaEditorV2Retirement,
} from "@/lib/sala-editor/persistence/sala-editor-v2-floor-plan-retirement";

/**
 * Publicador del Editor V2 con retirada segura de mapas eliminados.
 *
 * La eliminación en el editor sigue siendo local hasta que el usuario publica.
 * Al publicar, los floorPlans creados por Editor V2 que ya no existen en el
 * documento se archivan (active/showInTpv=false) en lugar de borrarse. Antes y
 * justo después de publicar se valida que sus mesas no tengan actividad.
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

  return {
    ...result,
    floorPlansRetired: retirement.floorPlansRetired,
    retiredFloorPlanIds: retirementPlan.floorPlans.map((plan) => plan.id),
    tablesRetiredWithFloorPlans: retirement.tablesRetired,
  };
}
