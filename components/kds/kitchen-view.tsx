"use client";

import { useState } from "react";
import Link from "next/link";
import OrderItemsBoard from "@/components/kds/order-items-board";
import OperationStationKdsFilter from "@/components/kds/operation-station-kds-filter";
import ServiceMetricsBar from "@/components/kds/service-metrics-bar";
import { useOperationStationKdsFilter } from "@/hooks/use-operation-station-kds-filter";

export default function KitchenView() {
  const {
    activeStationsForScope,
    selectedOperationStationId,
    setSelectedOperationStationId,
    itemFilter,
    allLabel,
  } = useOperationStationKdsFilter("kitchen");
  const [servedArchiveOpen, setServedArchiveOpen] = useState(false);
  const [servedLineCount, setServedLineCount] = useState(0);
  const [listosPanelOpen, setListosPanelOpen] = useState(false);
  const [preparedLineCount, setPreparedLineCount] = useState(0);

  return (
    <div
      className="hostly-mobile-content min-h-0"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
    >
      <div
        className="hostly-mobile-stack hostly-kds-kitchen-chrome min-h-0 !gap-1"
        style={{ flex: 1, minHeight: 0 }}
      >
        <header className="hostly-mobile-header md:hidden !pb-1">
          <div className="hostly-mobile-header-row">
            <Link href="/dashboard/operacion" className="hostly-mobile-back" aria-label="Volver a Operación">
              <span className="text-lg font-bold leading-none" aria-hidden>
                ‹
              </span>
            </Link>
            <div className="hostly-mobile-title-block">
              <h1 className="hostly-mobile-title">Cocina</h1>
            </div>
          </div>
        </header>

        <OperationStationKdsFilter
          allLabel={allLabel}
          stations={activeStationsForScope}
          selectedOperationStationId={selectedOperationStationId}
          onSelect={setSelectedOperationStationId}
        />
        <ServiceMetricsBar
          variant="kitchenCompact"
          scope="kitchen"
          selectedOperationStationId={selectedOperationStationId}
          servidosArchiveToggle={{
            count: servedLineCount,
            open: servedArchiveOpen,
            onToggle: () => setServedArchiveOpen((open) => !open),
          }}
          listosPanelToggle={{
            count: preparedLineCount,
            open: listosPanelOpen,
            onToggle: () => setListosPanelOpen((open) => !open),
          }}
        />
        <div
          className="min-h-0"
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <OrderItemsBoard
            itemFilter={itemFilter}
            ticketRailLayout
            kitchenHideServedColumn
            servedArchiveOpen={servedArchiveOpen}
            preparedPanelOpen={listosPanelOpen}
            onServedLineCountChange={setServedLineCount}
            onPreparedLineCountChange={setPreparedLineCount}
            groupSentPasses
            kdsStationKind="kitchen"
            enablePreparePassBulk={false}
            emptyMessage="No hay comandas en producción"
            sentAction={{
              label: "Listo",
              nextStatus: "prepared",
            }}
            preparedAction={{
              label: "Servir",
              nextStatus: "served",
            }}
          />
        </div>
      </div>
    </div>
  );
}
