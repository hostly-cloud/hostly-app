"use client";

import { HostlyButton } from "@/components/ui/hostly";
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
  const allActive =
    selectedOperationStationId === KDS_OPERATION_STATION_FILTER_ALL;

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
        <HostlyButton
          variant="chip"
          active={allActive}
          className={`hostly-kds-op-station-filter${allActive ? " is-active" : ""}`}
          onClick={() => onSelect(KDS_OPERATION_STATION_FILTER_ALL)}
        >
          {allLabel}
        </HostlyButton>
        {stations.map((station) => {
          const active = selectedOperationStationId === station.id;
          return (
            <HostlyButton
              key={station.id}
              variant="chip"
              active={active}
              className={`hostly-kds-op-station-filter${active ? " is-active" : ""}`}
              title={station.name}
              onClick={() => onSelect(station.id)}
            >
              {station.name}
            </HostlyButton>
          );
        })}
      </div>
    </section>
  );
}