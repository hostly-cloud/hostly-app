import type { SalaWallSegmentId } from "@/lib/sala-editor/types/wall-segment";

export type SalaWallAttachmentId = string;

export type SalaWallAttachmentKind =
  | "door"
  | "double-door"
  | "sliding-door"
  | "window"
  | "glass"
  | "opening"
  | "arch"
  | "partition"
  | "signage"
  | "custom";

export type SalaWallAttachmentOffset = {
  /** Desplazamiento perpendicular al muro, en coordenadas lógicas del editor. */
  normal?: number;
  /** Desplazamiento paralelo al muro, en coordenadas lógicas del editor. */
  tangent?: number;
};

export type SalaWallAttachment = {
  id: SalaWallAttachmentId;
  wallId: SalaWallSegmentId;
  kind: SalaWallAttachmentKind;
  /** Posición relativa sobre el muro: 0 inicio, 1 final. */
  positionRatio: number;
  offset?: SalaWallAttachmentOffset;
  metadata?: Record<string, unknown>;
};

export type SalaWallAttachmentDraft = Omit<SalaWallAttachment, "id">;

export function createSalaWallAttachment(
  draft: SalaWallAttachmentDraft,
): SalaWallAttachment {
  return {
    id: `wall-attachment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...draft,
    positionRatio: clampWallAttachmentPosition(draft.positionRatio),
  };
}

export function clampWallAttachmentPosition(positionRatio: number): number {
  if (!Number.isFinite(positionRatio)) return 0;
  return Math.max(0, Math.min(1, positionRatio));
}

export function normalizeWallAttachment(
  attachment: SalaWallAttachment,
): SalaWallAttachment {
  return {
    ...attachment,
    positionRatio: clampWallAttachmentPosition(attachment.positionRatio),
  };
}

export function normalizeWallAttachments(
  attachments: readonly SalaWallAttachment[],
  validWallIds: ReadonlySet<SalaWallSegmentId>,
): SalaWallAttachment[] {
  return attachments
    .filter((attachment) => validWallIds.has(attachment.wallId))
    .map(normalizeWallAttachment);
}

export function removeWallAttachmentsForWall(
  attachments: readonly SalaWallAttachment[],
  wallId: SalaWallSegmentId,
): SalaWallAttachment[] {
  return attachments.filter((attachment) => attachment.wallId !== wallId);
}
