"use client";

import { ConfigCartaEditToggleActions } from "@/components/carta/config-carta-row-actions";
import { HostlyStatusBadge } from "@/components/ui/hostly/data-table";
import { formatProductionStationListSummary } from "@/lib/produccion/production-station-types";
import type { ProductionStationDocument } from "@/lib/produccion/production-station-types";

function StationStatusBadge({ active }: { active: boolean }) {
  return (
    <HostlyStatusBadge tone={active ? "success" : "muted"} aria-label={active ? "Activa" : "Inactiva"}>
      {active ? "Activa" : "Inactiva"}
    </HostlyStatusBadge>
  );
}

export type ProductionStationsDataViewProps = {
  items: ProductionStationDocument[];
  loading: boolean;
  onEdit: (item: ProductionStationDocument) => void;
  onToggleActive: (item: ProductionStationDocument) => void;
  onCreateNew?: () => void;
};

export function ProductionStationsDataView({
  items,
  loading,
  onEdit,
  onToggleActive,
  onCreateNew,
}: ProductionStationsDataViewProps) {
  if (loading) {
    return (
      <div className="hostly-production-station-list-wrap">
        <div className="hostly-carta-config-list-loading">Cargando…</div>
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
            Crea estaciones como Cocina, Barra, Coctelería o Pizzería para organizar la producción.
          </p>
          {onCreateNew ? (
            <div className="hostly-carta-config-empty__actions">
              <button type="button" onClick={onCreateNew} className="hostly-button-primary hostly-button-compact">
                Nueva estación
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="hostly-production-station-list-wrap">
      <ul className="hostly-production-station-list" role="list">
        {items.map((station) => {
          const summary = formatProductionStationListSummary(station);

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
                      style={{ backgroundColor: station.color }}
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
    </div>
  );
}
