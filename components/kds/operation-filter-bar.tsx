"use client";

import { useOperationFilter } from "@/components/kds/operation-filter-context";

export default function OperationFilterBar() {
  const {
    waiterFilter,
    setWaiterFilter,
    waiters,
    waitersLoadStatus,
    retryWaiters,
    currentUserId,
    zoneFilter,
    setZoneFilter,
    zones,
  } = useOperationFilter();
  return (
    <div className="hostly-kds-operation-filters">
      <span className="hostly-kds-operation-filters__label">Filtros</span>
      <div className="hostly-kds-operation-filters__rail">
        <label className="hostly-kds-operation-filter">
          <span className="hostly-kds-operation-filter__label">Camarero</span>
          <select
            value={waiterFilter}
            onChange={(e) => setWaiterFilter(e.target.value)}
            className="hostly-select hostly-kds-operation-filter__select"
            aria-label="Filtrar por camarero"
          >
            <option value="all">Todos</option>
            {currentUserId ? <option value="me">Mis mesas</option> : null}
            {waiters.length > 0 ? (
              <optgroup label="Camareros">
                {waiters.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <label className="hostly-kds-operation-filter">
          <span className="hostly-kds-operation-filter__label">Zona</span>
          <select
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
            className="hostly-select hostly-kds-operation-filter__select"
            aria-label="Filtrar por zona"
          >
            <option value="all">Todas</option>
            <option value="unassigned">Sin zona</option>
            {zones.length > 0 ? (
              <optgroup label="Zonas">
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
      </div>
      {waitersLoadStatus === "error" ? (
        <div
          className="hostly-carta-config-alert hostly-carta-config-alert--error flex w-full items-center justify-between gap-2"
          role="alert"
        >
          <span>No se pudo cargar el equipo</span>
          <button
            type="button"
            className="hostly-button-secondary hostly-button-compact"
            onClick={retryWaiters}
          >
            Reintentar
          </button>
        </div>
      ) : null}
    </div>
  );
}
