"use client";

import { useCallback } from "react";
import Link from "next/link";
import OrderItemsBoard, {
  type BoardItem,
} from "@/components/kds/order-items-board";
import ServiceMetricsBar from "@/components/kds/service-metrics-bar";
import { isBarItem } from "@/lib/kds/bar-classification";

export default function BarView() {
  const filter = useCallback((item: BoardItem) => isBarItem(item), []);
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
              <h1 className="hostly-mobile-title">Barra</h1>
              <p className="hostly-mobile-subtitle">Bebidas y salida rápida al servicio</p>
            </div>
          </div>
        </header>
        <p className="hostly-mobile-text-caption hostly-mobile-section hidden !py-0 md:!mb-0 md:!mt-0 md:!block">
          Barra · mismos tickets que cocina, filtrado bebidas
        </p>

        <ServiceMetricsBar scope="bar" />
        <div className="min-h-0" style={{ flex: 1, minHeight: 0 }}>
          <OrderItemsBoard
            itemFilter={filter}
            groupSentPasses
            passTypeLabelOverride="Bebidas"
            emptyMessage="No hay comandas en barra"
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
      </div>
    </div>
  );
}
