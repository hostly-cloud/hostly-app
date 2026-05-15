"use client";

import { useCallback, useState } from "react";
import OrderItemsBoard, {
  type BoardItem,
} from "@/components/kds/order-items-board";
import ServiceMetricsBar from "@/components/kds/service-metrics-bar";
import { isBarItem } from "@/lib/kds/bar-classification";

export default function KitchenView() {
  const filter = useCallback((item: BoardItem) => !isBarItem(item), []);
  const [servedArchiveOpen, setServedArchiveOpen] = useState(false);
  const [servedLineCount, setServedLineCount] = useState(0);

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
      <ServiceMetricsBar
        scope="kitchen"
        servidosArchiveToggle={{
          count: servedLineCount,
          open: servedArchiveOpen,
          onToggle: () => setServedArchiveOpen((open) => !open),
        }}
      />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <OrderItemsBoard
          itemFilter={filter}
          ticketRailLayout
          kitchenHideServedColumn
          servedArchiveOpen={servedArchiveOpen}
          onServedLineCountChange={setServedLineCount}
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
    </div>
  );
}
