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
      className="hostly-mobile-section !px-[var(--hostly-mobile-pad-x)] !py-1.5 md:!py-1.5"
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
      <style jsx>{`
        .hostly-kds-op-station-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 2px;
        }
        .hostly-kds-op-station-filter {
          flex: 0 1 auto;
          border: 1px solid rgba(77, 107, 128, 0.2);
          border-radius: 999px;
          padding: 6px 11px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.01em;
          background: rgba(255, 255, 255, 0.92);
          color: #526b7d;
          cursor: pointer;
          min-height: 32px;
          max-width: min(200px, 48vw);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          touch-action: manipulation;
          transition:
            background 0.12s ease,
            border-color 0.12s ease,
            color 0.12s ease;
        }
        .hostly-kds-op-station-filter:hover {
          border-color: rgba(79, 159, 200, 0.45);
          color: #2d5f7c;
        }
        .hostly-kds-op-station-filter.is-active {
          background: #3d7a9a;
          border-color: #3d7a9a;
          color: #fff;
          box-shadow: 0 4px 12px rgba(61, 122, 154, 0.26);
        }
      `}</style>
    </section>
  );
}
