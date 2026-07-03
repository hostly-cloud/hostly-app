import { wallSegmentLength } from "@/lib/sala-editor/geometry/wall-geometry";
import type { SalaWallAttachment } from "@/lib/sala-editor/types/wall-attachment";
import {
  clampWallAttachmentPosition,
  type SalaWallAttachmentKind,
} from "@/lib/sala-editor/types/wall-attachment";
import type { SalaWallSegment } from "@/lib/sala-editor/types/wall-segment";

const WALL_ATTACHMENT_LENGTH_BY_KIND: Partial<Record<SalaWallAttachmentKind, number>> = {
  door: 90,
  glass: 120,
};

const WALL_ATTACHMENT_DEFAULT_LENGTH = 90;
const WALL_ATTACHMENT_MIN_SEPARATION = 20;
const WALL_ATTACHMENT_SNAP_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const;
const WALL_ATTACHMENT_SNAP_THRESHOLD = 0.035;

type WallAttachmentInterval = {
  start: number;
  end: number;
};

export type WallAttachmentConstraintResult = {
  positionRatio: number;
};

export function getWallAttachmentLogicalLength(
  kind: SalaWallAttachmentKind,
): number {
  return WALL_ATTACHMENT_LENGTH_BY_KIND[kind] ?? WALL_ATTACHMENT_DEFAULT_LENGTH;
}

export function snapWallAttachmentPositionRatio(positionRatio: number): number {
  const clamped = clampWallAttachmentPosition(positionRatio);
  let bestRatio = clamped;
  let bestDistance = WALL_ATTACHMENT_SNAP_THRESHOLD;

  for (const snapRatio of WALL_ATTACHMENT_SNAP_RATIOS) {
    const distance = Math.abs(clamped - snapRatio);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestRatio = snapRatio;
    }
  }

  return bestRatio;
}

function subtractInterval(
  intervals: WallAttachmentInterval[],
  forbidden: WallAttachmentInterval,
): WallAttachmentInterval[] {
  const next: WallAttachmentInterval[] = [];

  for (const interval of intervals) {
    if (forbidden.end <= interval.start || forbidden.start >= interval.end) {
      next.push(interval);
      continue;
    }

    if (forbidden.start > interval.start) {
      next.push({ start: interval.start, end: Math.min(forbidden.start, interval.end) });
    }
    if (forbidden.end < interval.end) {
      next.push({ start: Math.max(forbidden.end, interval.start), end: interval.end });
    }
  }

  return next.filter((interval) => interval.end >= interval.start);
}

function findNearestDistanceInIntervals(
  desiredDistance: number,
  intervals: readonly WallAttachmentInterval[],
): number | null {
  let bestDistance: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const interval of intervals) {
    const candidate = Math.max(interval.start, Math.min(interval.end, desiredDistance));
    const score = Math.abs(candidate - desiredDistance);
    if (score < bestScore) {
      bestScore = score;
      bestDistance = candidate;
    }
  }

  return bestDistance;
}

export function resolveConstrainedWallAttachmentPosition(params: {
  wallId: string;
  wall: Pick<SalaWallSegment, "x1" | "y1" | "x2" | "y2">;
  attachments: readonly SalaWallAttachment[];
  kind: SalaWallAttachmentKind;
  desiredPositionRatio: number;
  movingAttachmentId?: string | null;
}): WallAttachmentConstraintResult | null {
  const wallLength = wallSegmentLength(params.wall);
  const attachmentLength = getWallAttachmentLogicalLength(params.kind);
  const halfLength = attachmentLength / 2;

  if (wallLength <= 0 || attachmentLength > wallLength) {
    return null;
  }

  let availableIntervals: WallAttachmentInterval[] = [
    { start: halfLength, end: wallLength - halfLength },
  ];

  for (const attachment of params.attachments) {
    if (attachment.wallId !== params.wallId) continue;
    if (params.movingAttachmentId && attachment.id === params.movingAttachmentId) {
      continue;
    }

    const otherLength = getWallAttachmentLogicalLength(attachment.kind);
    const otherCenter = clampWallAttachmentPosition(attachment.positionRatio) * wallLength;
    const forbidden: WallAttachmentInterval = {
      start:
        otherCenter -
        otherLength / 2 -
        WALL_ATTACHMENT_MIN_SEPARATION -
        halfLength,
      end:
        otherCenter +
        otherLength / 2 +
        WALL_ATTACHMENT_MIN_SEPARATION +
        halfLength,
    };
    availableIntervals = subtractInterval(availableIntervals, forbidden);
    if (availableIntervals.length === 0) return null;
  }

  const snappedRatio = snapWallAttachmentPositionRatio(params.desiredPositionRatio);
  const desiredDistance = clampWallAttachmentPosition(snappedRatio) * wallLength;
  const constrainedDistance = findNearestDistanceInIntervals(
    desiredDistance,
    availableIntervals,
  );

  if (constrainedDistance == null) return null;

  return {
    positionRatio: clampWallAttachmentPosition(constrainedDistance / wallLength),
  };
}
