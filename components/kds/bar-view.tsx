"use client";

import { useCallback } from "react";
import OrderItemsBoard, {
  type BoardItem,
} from "@/components/kds/order-items-board";
import ServiceMetricsBar from "@/components/kds/service-metrics-bar";
import { isBarItem } from "@/lib/kds/bar-classification";

export default function BarView() {
  const filter = useCallback((item: BoardItem) => isBarItem(item), []);
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
      <ServiceMetricsBar scope="bar" />
      <OrderItemsBoard
        itemFilter={filter}
        emptyMessage="No hay pedidos en barra"
        sentAction={{
          label: "Preparado",
          nextStatus: "prepared",
        }}
        preparedAction={{
          label: "Entregado",
          nextStatus: "served",
        }}
      />
    </div>
  );
}
