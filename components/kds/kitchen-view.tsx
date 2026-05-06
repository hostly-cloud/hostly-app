"use client";

import { useCallback } from "react";
import OrderItemsBoard, {
  type BoardItem,
} from "@/components/kds/order-items-board";
import ServiceMetricsBar from "@/components/kds/service-metrics-bar";
import { isBarItem } from "@/lib/kds/bar-classification";

export default function KitchenView() {
  const filter = useCallback((item: BoardItem) => !isBarItem(item), []);
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <ServiceMetricsBar scope="kitchen" />
      <OrderItemsBoard
        itemFilter={filter}
        groupSentPasses
        emptyMessage="No hay pedidos en cocina"
        sentAction={{
          label: "Marcar como preparado",
          nextStatus: "prepared",
        }}
        preparedAction={{
          label: "Marcar como servido",
          nextStatus: "served",
        }}
      />
    </div>
  );
}
