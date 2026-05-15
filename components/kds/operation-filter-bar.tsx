"use client";

import type { CSSProperties } from "react";
import { useOperationFilter } from "@/components/kds/operation-filter-context";

const barStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid var(--hostly-line)",
  background: "rgba(255, 255, 255, 0.72)",
  color: "#315f7d",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "#cbd5f5",
};

const selectStyle: CSSProperties = {
  appearance: "none",
  padding: "4px 28px 4px 10px",
  borderRadius: 8,
  border: "1px solid var(--hostly-line)",
  background:
    "rgba(255, 255, 255, 0.82) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23315f7d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\") no-repeat right 8px center",
  color: "#1f2933",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  cursor: "pointer",
  minWidth: 140,
};

export default function OperationFilterBar() {
  const {
    waiterFilter,
    setWaiterFilter,
    waiters,
    currentUserId,
    zoneFilter,
    setZoneFilter,
    zones,
  } = useOperationFilter();
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div style={barStyle}>
        <span style={labelStyle}>Camarero</span>
        <select
          value={waiterFilter}
          onChange={(e) => setWaiterFilter(e.target.value)}
          style={selectStyle}
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
      </div>
      <div style={barStyle}>
        <span style={labelStyle}>Zona</span>
        <select
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
          style={selectStyle}
          aria-label="Filtrar por zona"
        >
          <option value="all">Todas las zonas</option>
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
      </div>
    </div>
  );
}
