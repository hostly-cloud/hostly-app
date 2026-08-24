import {
  createDefaultFloorPlanIfNeeded,
  entityBelongsToFloorPlan,
  floorPlanCanvasOrDefaults,
  getFloorPlans,
  pickCanonicalFloorPlan,
} from "@/lib/firestore/floorPlans";
import { getTables } from "@/lib/firestore/tables";
import { getZones } from "@/lib/firestore/zones";
import { buildSalaEditorDocumentFromLegacy } from "@/lib/sala-editor/adapters/legacy-adapters";
import {
  loadSalaEditorDraft,
  saveSalaEditorDraft,
} from "@/lib/sala-editor/persistence/sala-editor-draft-store";
import { buildFloorPlanWorkingDraftFromAssistant } from "./build-floor-plan-working-draft";
import {
  clearRoomsAssistantDraft,
  readRoomsAssistantDraft,
} from "./draft";

export type RoomsAssistantV2HandoffStatus =
  | "seeded"
  | "existing-v2-draft"
  | "missing-assistant-draft"
  | "target-plan-has-content"
  | "missing-floor-plan"
  | "empty-assistant-seed";

export type RoomsAssistantV2HandoffResult = {
  status: RoomsAssistantV2HandoffStatus;
  targetFloorPlanId?: string;
  addedElements?: number;
  addedZones?: number;
};

/**
 * Consume el borrador local del Asistente de Salas y lo convierte al documento
 * canonico de Editor V2 sin pasar por el editor de mapas historico.
 *
 * Reglas de seguridad:
 * - nunca sobrescribe un draft V2 existente;
 * - no duplica contenido sobre el plano canonico si ese plano ya contiene
 *   mesas/decorativos o zonas legacy;
 * - preserva el resto de planos legacy al hidratar el documento V2;
 * - crea el floorPlan por defecto solo cuando el restaurante aun no tiene uno,
 *   reproduciendo el requisito previo que antes resolvia el editor antiguo.
 */
export async function seedSalaEditorV2DraftFromRoomsAssistant(params: {
  restaurantId: string;
  updatedBy?: string | null;
}): Promise<RoomsAssistantV2HandoffResult> {
  const restaurantId = params.restaurantId.trim();
  if (!restaurantId) {
    return { status: "missing-floor-plan" };
  }

  const existingDraft = await loadSalaEditorDraft(restaurantId);
  if (existingDraft) {
    return { status: "existing-v2-draft" };
  }

  const assistantDraft = readRoomsAssistantDraft();
  if (!assistantDraft) {
    return { status: "missing-assistant-draft" };
  }

  let floorPlans = await getFloorPlans(restaurantId);
  if (floorPlans.length === 0) {
    await createDefaultFloorPlanIfNeeded(restaurantId);
    floorPlans = await getFloorPlans(restaurantId);
  }

  const targetPlan = pickCanonicalFloorPlan(floorPlans);
  if (!targetPlan) {
    return { status: "missing-floor-plan" };
  }

  const [legacyTables, legacyZones] = await Promise.all([
    getTables(restaurantId),
    getZones(restaurantId),
  ]);

  const targetHasContent =
    legacyTables.some(
      (element) =>
        element.isActive !== false &&
        entityBelongsToFloorPlan(element, targetPlan.id, floorPlans),
    ) ||
    legacyZones.some((zone) =>
      entityBelongsToFloorPlan(zone, targetPlan.id, floorPlans),
    );

  if (targetHasContent) {
    return {
      status: "target-plan-has-content",
      targetFloorPlanId: targetPlan.id,
    };
  }

  const workingDraft = buildFloorPlanWorkingDraftFromAssistant({
    draft: assistantDraft,
    restaurantId,
    floorPlanId: targetPlan.id,
    canvas: floorPlanCanvasOrDefaults(targetPlan),
    existingZones: legacyZones,
  });

  if (!workingDraft) {
    return {
      status: "empty-assistant-seed",
      targetFloorPlanId: targetPlan.id,
    };
  }

  const hydration = buildSalaEditorDocumentFromLegacy({
    restaurantId,
    floorPlans,
    tables: [...legacyTables, ...workingDraft.elements],
    zones: [...legacyZones, ...workingDraft.zones],
  });

  if (!hydration) {
    return {
      status: "empty-assistant-seed",
      targetFloorPlanId: targetPlan.id,
    };
  }

  await saveSalaEditorDraft(restaurantId, hydration.document, {
    updatedBy: params.updatedBy,
  });
  clearRoomsAssistantDraft();

  return {
    status: "seeded",
    targetFloorPlanId: targetPlan.id,
    addedElements: workingDraft.elements.length,
    addedZones: workingDraft.zones.length,
  };
}
