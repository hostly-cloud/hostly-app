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
    <div
      className="hostly-mobile-filter-bar max-w-full !flex-wrap items-center gap-2 border-b-0 !py-2 !pt-0"
    >
      <span className="hostly-mobile-text-caption shrink-0">Filtros</span>
      <label className="flex min-w-0 items-center gap-1.5">
        <span className="hostly-mobile-text-caption shrink-0">Camarero</span>
        <select
          value={waiterFilter}
          onChange={(e) => setWaiterFilter(e.target.value)}
          className="hostly-select !min-h-9 !max-w-[200px] !py-2 !pl-3 !pr-9 !text-[13px]"
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
      <label className="flex min-w-0 items-center gap-1.5">
        <span className="hostly-mobile-text-caption shrink-0">Zona</span>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          className="hostly-select !min-h-9 !max-w-[200px] !py-2 !pl-3 !pr-9 !text-[13px]"
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
