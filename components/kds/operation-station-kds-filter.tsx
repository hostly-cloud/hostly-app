"use client";

import type { CSSProperties } from "react";
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
  const selectedStation = stations.find(
    (station) => station.id === selectedOperationStationId,
  );

  return (
    <section
      className="hostly-kds-station-strip hostly-mobile-section !px-[var(--hostly-mobile-pad-x)] !py-1 md:!py-1.5"
      aria-label="Filtrar por estación operativa"
    >
      <div className="hostly-kds-station-strip__meta" aria-hidden>
        <span>{stations.length} {stations.length === 1 ? "estación" : "estaciones"}</span>
        {selectedStation ? <strong>{selectedStation.name}</strong> : null}
      </div>
      <div
        className="hostly-kds-op-station-filters"
        role="group"
        aria-label="Estación operativa"
      >
        <button
          type="button"
          className={`hostly-kds-op-station-filter hostly-kds-op-station-filter--all${
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
          const stationColor = station.color ?? "#3d7a9a";
          return (
            <button
              key={station.id}
              type="button"
              className={`hostly-kds-op-station-filter${active ? " is-active" : ""}`}
              aria-pressed={active}
              title={station.name}
              style={
                {
                  "--hostly-kds-station-color": stationColor,
                } as CSSProperties
              }
              onClick={() => onSelect(station.id)}
            >
              <span className="hostly-kds-op-station-filter__dot" aria-hidden />
              <span className="hostly-kds-op-station-filter__label">{station.name}</span>
            </button>
          );
        })}
      </div>
      <style jsx>{`
        .hostly-kds-station-strip {
          min-width: 0;
          flex-shrink: 0;
        }
        .hostly-kds-station-strip__meta {
          display: none;
        }
        .hostly-kds-op-station-filters {
          display: flex;
          flex-wrap: nowrap;
          gap: 5px;
          align-items: center;
          min-width: 0;
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          overscroll-behavior-x: contain;
          scroll-snap-type: x proximity;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
          padding: 1px 1px 3px;
        }
        .hostly-kds-op-station-filter {
          --hostly-kds-station-color: #3d7a9a;
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          scroll-snap-align: start;
          border: 1px solid rgba(77, 107, 128, 0.18);
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 10.5px;
          font-weight: 760;
          letter-spacing: 0.005em;
          line-height: 1.15;
          background: rgba(255, 255, 255, 0.95);
          color: #526b7d;
          cursor: pointer;
          min-height: 34px;
          max-width: min(220px, 62vw);
          white-space: nowrap;
          touch-action: manipulation;
          box-shadow: none;
          transition:
            background 0.12s ease,
            border-color 0.12s ease,
            color 0.12s ease,
            transform 0.12s ease;
        }
        .hostly-kds-op-station-filter__dot {
          flex: 0 0 7px;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: var(--hostly-kds-station-color);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--hostly-kds-station-color) 18%, transparent);
        }
        .hostly-kds-op-station-filter__label {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .hostly-kds-op-station-filter:hover {
          border-color: color-mix(in srgb, var(--hostly-kds-station-color) 42%, #d7e0e7);
          color: #2d5f7c;
        }
        .hostly-kds-op-station-filter:active {
          transform: scale(0.985);
        }
        .hostly-kds-op-station-filter.is-active {
          background: color-mix(in srgb, var(--hostly-kds-station-color) 13%, white);
          border-color: color-mix(in srgb, var(--hostly-kds-station-color) 55%, #d7e0e7);
          color: #17384d;
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hostly-kds-station-color) 10%, transparent);
        }
        .hostly-kds-op-station-filter.is-active .hostly-kds-op-station-filter__dot {
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--hostly-kds-station-color) 22%, transparent);
        }
        .hostly-kds-op-station-filter--all {
          --hostly-kds-station-color: #3d7a9a;
        }
        @media (max-width: 767px) {
          .hostly-kds-op-station-filters {
            scrollbar-width: none;
            padding-bottom: 2px;
          }
          .hostly-kds-op-station-filters::-webkit-scrollbar {
            display: none;
          }
          .hostly-kds-op-station-filter {
            min-height: 36px;
            padding: 5px 10px;
            max-width: min(190px, 58vw);
            font-size: 10.5px;
          }
        }
        @media (min-width: 1024px) {
          .hostly-kds-station-strip {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .hostly-kds-station-strip__meta {
            flex: 0 0 auto;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 190px;
            font-size: 9px;
            font-weight: 650;
            color: #8a9baa;
            white-space: nowrap;
          }
          .hostly-kds-station-strip__meta strong {
            max-width: 116px;
            overflow: hidden;
            text-overflow: ellipsis;
            color: #526b7d;
          }
        }
      `}</style>
    </section>
  );
}
