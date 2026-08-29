"use client";

import type { OperationStationDocument } from "@/lib/operacion/operation-station-types";
import { KDS_OPERATION_STATION_FILTER_ALL } from "@/lib/kds/operation-station-kds-filter";

export type OperationStationKdsFilterProps = {
  allLabel: string;
  stations: readonly OperationStationDocument[];
  selectedOperationStationId: string;
  onSelect: (stationId: string) => void;
};

export default function OperationStationKdsFilter({
  allLabel,
  stations,
  selectedOperationStationId,
  onSelect,
}: OperationStationKdsFilterProps) {
  return (
    <section
      className="hostly-kds-station-filter-section"
      aria-label="Filtrar por estación operativa"
    >
      <div
        className="hostly-kds-op-station-filters"
        role="group"
        aria-label="Estación operativa"
      >
        <button
          type="button"
          className={`hostly-kds-op-station-filter${
            selectedOperationStationId === KDS_OPERATION_STATION_FILTER_ALL
              ? " is-active"
              : ""
          }`}
          aria-pressed={
            selectedOperationStationId === KDS_OPERATION_STATION_FILTER_ALL
          }
          onClick={() => onSelect(KDS_OPERATION_STATION_FILTER_ALL)}
        >
          {allLabel}
        </button>
        {stations.map((station) => {
          const active = selectedOperationStationId === station.id;
          return (
            <button
              key={station.id}
              type="button"
              className={`hostly-kds-op-station-filter${active ? " is-active" : ""}`}
              aria-pressed={active}
              title={station.name}
              onClick={() => onSelect(station.id)}
            >
              {station.name}
            </button>
          );
        })}
      </div>
    </section>
  );
}
