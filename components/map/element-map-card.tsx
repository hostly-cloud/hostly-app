"use client";

import { memo } from "react";
import { useTpvV2OperationalParity } from "@/lib/tpv/v2-operational-parity-context";
import type { ElementMapCardProps } from "./element-map-card-contract";
import { TpvV2TableOperationController } from "./tpv-v2-table-operation-controller";

export type {
  ElementMapCardProps,
  HostlyMapJoinDragHoverDetail,
} from "./element-map-card-contract";

/**
 * Controlador operativo del mapa TPV V2.
 *
 * La tarjeta visual historica ya no forma parte del arbol de render. El aspecto
 * visible de la mesa pertenece a SalaEditorReadonlyMap; este componente solo
 * registra/ejecuta la interaccion operativa correspondiente.
 */
export const ElementCard = memo(function ElementCard(
  props: ElementMapCardProps,
) {
  const linkedToV2Operation = useTpvV2OperationalParity(props.tableId);

  if (!props.interactionOnly && !linkedToV2Operation) {
    return (
      <span
        hidden
        data-hostly-v2-element-controller="blocked-unlinked-element"
        data-hostly-v2-element-id={props.tableId}
      />
    );
  }

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
});
