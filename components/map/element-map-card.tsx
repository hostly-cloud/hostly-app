"use client";

import { memo } from "react";

import {
  ElementCard as LegacyElementCard,
  type ElementMapCardProps,
} from "./legacy-element-map-card";
import { TpvV2TableOperationController } from "./tpv-v2-table-operation-controller";

export type {
  ElementMapCardProps,
  HostlyMapJoinDragHoverDetail,
} from "./legacy-element-map-card";

export const ElementCard = memo(function ElementCard(
  props: ElementMapCardProps,
) {
  if (props.interactionOnly) {
    return (
      <TpvV2TableOperationController
        tableId={props.tableId}
        tableLabel={props.table.name || props.tableId}
        onOpenTable={props.onTableClick}
        joinEnabled={props.mapJoinDragEnabled}
        onJoinDrop={props.onMapTableJoinDrop}
        joinClusterMainId={props.mapJoinClusterMainId}
        previewWidth={props.mapTileWidth}
        previewHeight={props.mapTileHeight}
        groupedPrimary={props.isMapGroupedPrimary}
        onSeparateGroup={props.onRequestSeparateGroupedTables}
      />
    );
  }

  return <LegacyElementCard {...props} />;
});
