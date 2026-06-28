import {
  resolveFloorPlanEditorPublishUiState,
  type FloorPlanEditorPublishUiState,
} from "@/lib/map/floor-plan-editor-publish-ux";

/**
 * Estado visual unificado del editor de plano (Configuración → Espacios → Mesas).
 * Un solo origen de verdad para badge, CTA y chrome del asistente.
 */
export type FloorPlanEditorState =
  | "no_plan"
  | "assistant"
  | "local_draft"
  | "pending_publish"
  | "publishing"
  | "published"
  | "publish_error";

export type GetFloorPlanEditorStateInput = {
  selectedFloorPlanId: string | null;
  loading: boolean;
  visibleElementCount: number;
  hasUnsavedChanges: boolean;
  isPublishing: boolean;
  publishError: string | null;
  hasPublishedBaseline: boolean;
  /** Borrador del Asistente de Salas aún presente en sesión. */
  hasAssistantDraft: boolean;
  assistantBannerDismissed: boolean;
  assistantGuideDismissed: boolean;
};

export type FloorPlanEditorStateView = {
  state: FloorPlanEditorState;
  publishUiState: FloorPlanEditorPublishUiState;
  showAssistantBanner: boolean;
  showInspectorOnboarding: boolean;
  showMapEmptyState: boolean;
  showInspectorIdleHint: boolean;
};

export function getFloorPlanEditorState(
  input: GetFloorPlanEditorStateInput,
): FloorPlanEditorStateView {
  const publishUiState = resolveFloorPlanEditorPublishUiState({
    hasUnsavedChanges: input.hasUnsavedChanges,
    isPublishing: input.isPublishing,
    publishError: input.publishError,
    hasPublishedBaseline: input.hasPublishedBaseline,
  });

  const isEmptySelectedPlan =
    Boolean(input.selectedFloorPlanId) &&
    input.visibleElementCount === 0 &&
    !input.hasUnsavedChanges &&
    !input.hasAssistantDraft &&
    !input.loading;

  let state: FloorPlanEditorState;

  if (!input.selectedFloorPlanId) {
    state = "no_plan";
  } else if (publishUiState === "publishing") {
    state = "publishing";
  } else if (publishUiState === "publish_error") {
    state = "publish_error";
  } else if (publishUiState === "pending_publish") {
    state = "pending_publish";
  } else if (publishUiState === "local_draft") {
    state = input.hasAssistantDraft ? "assistant" : "local_draft";
  } else if (isEmptySelectedPlan) {
    state = "no_plan";
  } else if (publishUiState === "published") {
    state = "published";
  } else {
    state = input.hasAssistantDraft ? "assistant" : "local_draft";
  }

  const resolvedPublishUiState =
    state === "no_plan" &&
    isEmptySelectedPlan &&
    publishUiState === "published"
      ? "local_draft"
      : publishUiState;

  const showAssistantBanner =
    state === "assistant" && !input.assistantBannerDismissed;

  const showInspectorOnboarding =
    state === "assistant" && !input.assistantGuideDismissed;

  const showMapEmptyState =
    Boolean(input.selectedFloorPlanId) &&
    input.visibleElementCount === 0 &&
    state === "no_plan" &&
    !input.loading;

  const showInspectorIdleHint =
    state !== "assistant" && state !== "no_plan";

  return {
    state,
    publishUiState: resolvedPublishUiState,
    showAssistantBanner,
    showInspectorOnboarding,
    showMapEmptyState,
    showInspectorIdleHint,
  };
}
