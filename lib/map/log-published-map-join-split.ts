/**
 * Diagnóstico join/split en mapa V2 published (solo desarrollo).
 */

export type PublishedMapJoinSplitAction =
  | "table-pointer-down"
  | "join-candidate"
  | "join-callback"
  | "join-blocked"
  | "group-menu-open"
  | "split-callback"
  | "split-blocked";

export type PublishedMapJoinSplitLog = {
  action: PublishedMapJoinSplitAction;
  instanceId?: string | null;
  resolvedTableId?: string | null;
  mainTableId?: string | null;
  secondaryTableId?: string | null;
  grouped?: boolean;
  hidden?: boolean;
  interactive?: boolean;
  reason?: string | null;
};

export function logPublishedMapJoinSplit(entry: PublishedMapJoinSplitLog): void {
  if (process.env.NODE_ENV === "production") return;
  if (typeof console === "undefined") return;
  console.log("[Hostly:PublishedMapJoinSplit]", entry);
}
