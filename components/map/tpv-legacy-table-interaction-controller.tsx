"use client";

import type { ElementMapCardProps } from "./legacy-element-map-card";
import { TpvV2TableOperationController } from "./tpv-v2-table-operation-controller";

/**
 * Adaptador transitorio mientras CartaPageContent sigue construyendo
 * ElementMapCardProps. La logica operativa real vive ya en el controlador V2.
 */
export function TpvLegacyTableInteractionController({
  table,
  tableId,
  onTableClick,
  mapJoinDragEnabled = false,
  onMapTableJoinDrop,
  mapJoinClusterMainId,
  mapTileWidth,
  mapTileHeight,
  isMapGroupedPrimary = false,
  onRequestSeparateGroupedTables,
}: ElementMapCardProps) {
  return (
    <TpvV2TableOperationController
      tableId={tableId}
      tableLabel={table.name || tableId}
      onOpenTable={onTableClick}
      joinEnabled={mapJoinDragEnabled}
      onJoinDrop={onMapTableJoinDrop}
      joinClusterMainId={mapJoinClusterMainId}
      previewWidth={mapTileWidth}
      previewHeight={mapTileHeight}
      groupedPrimary={isMapGroupedPrimary}
      onSeparateGroup={onRequestSeparateGroupedTables}
    />
  );
}
