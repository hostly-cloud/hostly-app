"use client";

import { ConfigCartaEditToggleActions } from "@/components/carta/config-carta-row-actions";
import { HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import {
  OPERATION_STATION_TYPE_LABELS,
  type OperationStationDocument,
} from "@/lib/operacion/operation-station-types";

function StationStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activa" : "Inactiva"}>
      {active ? "Activa" : "Inactiva"}
    </HostlyStatusBadge>
  );
}

export type ProductionStationsDataViewProps = {
  items: OperationStationDocument[];
  loading: boolean;
  onEdit: (item: OperationStationDocument) => void;
  onToggleActive: (item: OperationStationDocument) => void;
  onCreateNew?: () => void;
};

export function ProductionStationsDataView({
  items,
  loading,
  onEdit,
  onToggleActive,
  onCreateNew,
}: ProductionStationsDataViewProps) {
  const stationStyles = `
    @media (max-width: 767px) {
      .hostly-production-station-list-wrap {
        min-width: 0;
      }
      .hostly-production-station-list {
        display: grid;
        gap: 5px;
        margin: 0;
        padding: 6px 8px 8px;
      }
      .hostly-production-station-card {
        min-width: 0;
        border-radius: 10px;
        box-shadow: none;
      }
      .hostly-production-station-card__main {
        min-width: 0;
        padding: 9px 10px;
      }
      .hostly-production-station-card__name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 13px;
        font-weight: 760;
      }
      .hostly-production-station-card__summary {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 9.5px;
      }
      .hostly-production-station-card__aside {
        gap: 5px;
        padding-right: 8px;
      }
    }
  `;

  if (loading) {
    return (
      <div className="hostly-production-station-list-wrap">
        <div className="hostly-carta-config-list-loading">Cargando…</div>
        <style>{stationStyles}</style>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="hostly-production-station-list-wrap">
        <div className="hostly-carta-config-empty hostly-carta-config-empty--inset hostly-carta-config-empty--compact">
          <span className="hostly-carta-config-empty__icon" aria-hidden>
            ST
          </span>
          <p className="hostly-carta-config-empty__title">Sin estaciones todavía</p>
          <p className="hostly-carta-config-empty__body">
            Crea tantas estaciones como tenga el restaurante: Barra principal, Barra piscina, Cocina fría,
            Pizza, Josper, Postres o Coctelería.
          </p>
          {onCreateNew ? (
            <div className="hostly-carta-config-empty__actions">
              <button type="button" onClick={onCreateNew} className="hostly-button-primary hostly-button-compact">
                Nueva estación
              </button>
            </div>
          ) : null}
        </div>
        <style>{stationStyles}</style>
      </div>
    );
  }

  return (
    <div className="hostly-production-station-list-wrap">
      <ul className="hostly-production-station-list" role="list">
        {items.map((station) => {
          const summary = [
            OPERATION_STATION_TYPE_LABELS[station.type],
            `Orden ${station.sortOrder}`,
          ].join(" · ");

          return (
            <li key={station.id}>
              <div className="hostly-production-station-card">
                <button
                  type="button"
                  className="hostly-production-station-card__main"
                  onClick={() => onEdit(station)}
                >
                  <span className="hostly-production-station-card__title-row">
                    <span
                      className="hostly-production-station-card__swatch"
                      style={{ backgroundColor: station.color ?? "#7eb8d4" }}
                      aria-hidden
                    />
                    <span className="hostly-production-station-card__name">{station.name}</span>
                  </span>
                  <span className="hostly-production-station-card__summary">{summary}</span>
                </button>
                <div className="hostly-production-station-card__aside">
                  <StationStatusBadge active={station.active} />
                  <ConfigCartaEditToggleActions
                    isActive={station.active}
                    editTitle="Editar estación"
                    toggleTitle={station.active ? "Desactivar estación" : "Activar estación"}
                    onEdit={() => onEdit(station)}
                    onToggle={() => onToggleActive(station)}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <style>{stationStyles}</style>
    </div>
  );
}
