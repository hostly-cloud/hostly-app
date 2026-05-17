"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
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
      className="hostly-mobile-content min-h-0"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <div className="hostly-mobile-stack min-h-0 !gap-2" style={{ flex: 1, minHeight: 0 }}>
        <header className="hostly-mobile-header md:hidden">
          <div className="hostly-mobile-header-row">
            <Link href="/dashboard/operacion" className="hostly-mobile-back" aria-label="Volver a Operación">
              <span className="text-lg font-bold leading-none" aria-hidden>
                ‹
              </span>
            </Link>
            <div className="hostly-mobile-title-block">
              <h1 className="hostly-mobile-title">Cocina</h1>
              <p className="hostly-mobile-subtitle">
                Cola en vivo: pendiente → preparado → salida a sala
              </p>
            </div>
          </div>
        </header>
        <p className="hostly-mobile-text-caption hostly-mobile-section hidden !py-0 md:!mb-0 md:!mt-0 md:!block">
          Cocina · tiempos y prioridad de pases
        </p>

        <ServiceMetricsBar
          scope="kitchen"
          servidosArchiveToggle={{
            count: servedLineCount,
            open: servedArchiveOpen,
            onToggle: () => setServedArchiveOpen((open) => !open),
          }}
        />
        <div className="min-h-0" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <OrderItemsBoard
            itemFilter={filter}
            ticketRailLayout
            kitchenHideServedColumn
            servedArchiveOpen={servedArchiveOpen}
            onServedLineCountChange={setServedLineCount}
            groupSentPasses
            emptyMessage="No hay comandas pendientes"
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
    </div>
  );
}
