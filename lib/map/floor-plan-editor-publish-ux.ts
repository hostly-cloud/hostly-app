import type { CSSProperties } from "react";

export type FloorPlanEditorPublishUiState =
  | "local_draft"
  | "pending_publish"
  | "publishing"
  | "published"
  | "publish_error";

export type ResolveFloorPlanEditorPublishUiInput = {
  hasUnsavedChanges: boolean;
  isPublishing: boolean;
  publishError: string | null;
  hasPublishedBaseline: boolean;
};

export function resolveFloorPlanEditorPublishUiState(
  input: ResolveFloorPlanEditorPublishUiInput,
): FloorPlanEditorPublishUiState {
  if (input.isPublishing) return "publishing";
  if (input.publishError) return "publish_error";
  if (input.hasUnsavedChanges) {
    return input.hasPublishedBaseline ? "pending_publish" : "local_draft";
  }
  return "published";
}

export const FLOOR_PLAN_PUBLISH_STATUS_LABELS: Record<
  FloorPlanEditorPublishUiState,
  string
> = {
  local_draft: "Borrador local",
  pending_publish: "Cambios sin publicar",
  publishing: "Publicando plano…",
  published: "Plano publicado",
  publish_error: "Error al publicar",
};

export function getFloorPlanPublishPrimaryButtonLabel(
  state: FloorPlanEditorPublishUiState,
): string {
  if (state === "publishing") return "Publicando…";
  if (state === "published") return "Plano publicado";
  return "Publicar plano";
}

export function isFloorPlanPublishPrimaryButtonDisabled(
  state: FloorPlanEditorPublishUiState,
): boolean {
  return state === "publishing" || state === "published";
}

const badgeBaseLight: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "1px 7px",
  borderRadius: 999,
  fontWeight: 500,
  fontSize: 10,
  letterSpacing: "0.01em",
  whiteSpace: "nowrap",
};

const badgeBaseDark: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 8px",
  borderRadius: 999,
  fontWeight: 600,
  fontSize: 11,
  whiteSpace: "nowrap",
};

export function getFloorPlanPublishStatusBadgeStyle(
  state: FloorPlanEditorPublishUiState,
  variant: "light" | "dark" = "light",
): CSSProperties {
  const base = variant === "dark" ? badgeBaseDark : badgeBaseLight;

  switch (state) {
    case "local_draft":
    case "pending_publish":
      return variant === "dark"
        ? {
            ...base,
            border: "1px solid rgba(249, 115, 22, 0.28)",
            background: "rgba(249, 115, 22, 0.1)",
            color: "#fed7aa",
          }
        : {
            ...base,
            border: "1px solid rgba(249, 115, 22, 0.35)",
            background: "rgba(249, 115, 22, 0.1)",
            color: "#c2410c",
          };
    case "publishing":
      return variant === "dark"
        ? {
            ...base,
            border: "1px solid rgba(56, 189, 248, 0.35)",
            background: "rgba(56, 189, 248, 0.14)",
            color: "#bae6fd",
          }
        : {
            ...base,
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            color: "#1d4ed8",
          };
    case "published":
      return variant === "dark"
        ? {
            ...base,
            border: "1px solid rgba(34, 197, 94, 0.32)",
            background: "rgba(34, 197, 94, 0.12)",
            color: "#bbf7d0",
          }
        : {
            ...base,
            border: "1px solid #bbf7d0",
            background: "#f0fdf4",
            color: "#15803d",
          };
    case "publish_error":
      return variant === "dark"
        ? {
            ...base,
            border: "1px solid rgba(248, 113, 113, 0.35)",
            background: "rgba(248, 113, 113, 0.12)",
            color: "#fecaca",
          }
        : {
            ...base,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
          };
  }
}
