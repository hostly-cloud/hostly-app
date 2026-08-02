/**
 * Eventos document-level para highlight de drop target durante join drag.
 * Compartidos por ElementCard legacy y MapTableJoinSplitShell (V2).
 */

export const HOSTLY_MAP_JOIN_DRAG_HOVER = "hostly-map-join-drag-hover";
export const HOSTLY_MAP_JOIN_DRAG_END = "hostly-map-join-drag-end";

export type HostlyMapJoinDragHoverDetail = {
  hoverTableId: string | null;
  draggedTableId: string;
  draggedClusterMain: string;
};
