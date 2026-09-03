"use client";

import type { Dispatch, SetStateAction } from "react";
import type {
  ColumnasZonasPrefs,
  ZonaExportMetric,
} from "@/components/analysis/hooks/useZonasAnalytics";
import { HostlyButton } from "@/components/ui/hostly";

type OrdenZonas = "total" | "ocupacion" | "eficiencia" | "score";

type Props = {
  compactViewZonas: boolean;
  setCompactViewZonas: Dispatch<SetStateAction<boolean>>;
  ordenZonas: OrdenZonas;
  setOrdenZonas: Dispatch<SetStateAction<OrdenZonas>>;
  searchZona: string;
  setSearchZona: Dispatch<SetStateAction<string>>;
  limitZonas: number;
  setLimitZonas: Dispatch<SetStateAction<number>>;
  columnasZonas: ColumnasZonasPrefs;
  setColumnasZonas: Dispatch<SetStateAction<ColumnasZonasPrefs>>;
  vistaDefaultZonas: string;
  limpiarFiltrosVistaZonas: () => void;
  aplicarVistaDefaultZonas: () => void;
  resetZonasPrefs: () => void;
  exportarZonas: (
    zoneMetricsLimited: ZonaExportMetric[],
    columnasZonas?: ColumnasZonasPrefs | null,
  ) => void;
  zoneMetricsLimited: ZonaExportMetric[];
  copiarResumenZonas: () => void;
};

const fieldLabelClass =
  "inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.04em] text-[color:var(--hostly-ink-muted)]";
const selectClass =
  "hostly-focus-ring cursor-pointer rounded-[var(--hostly-radius-md)] border border-[var(--hostly-line)] bg-[var(--hostly-surface-card-solid)] px-2.5 py-2 text-[13px] font-bold normal-case tracking-[-0.02em] text-[color:var(--hostly-ink-strong)] outline-none";
const checkboxLabelClass =
  "inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-[color:var(--hostly-ink-muted)]";

export function ZonasToolbar({
  compactViewZonas,
  setCompactViewZonas,
  ordenZonas,
  setOrdenZonas,
  searchZona,
  setSearchZona,
  limitZonas,
  setLimitZonas,
  columnasZonas,
  setColumnasZonas,
  vistaDefaultZonas,
  limpiarFiltrosVistaZonas,
  aplicarVistaDefaultZonas,
  resetZonasPrefs,
  exportarZonas,
  zoneMetricsLimited,
  copiarResumenZonas,
}: Props) {
  const hasViewFilters = searchZona.trim().length > 0 || limitZonas > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <HostlyButton
        variant="tool"
        size="compact"
        active={compactViewZonas}
        onClick={() => setCompactViewZonas((current) => !current)}
      >
        Vista compacta
      </HostlyButton>

      <label className={fieldLabelClass}>
        Ordenar por
        <select
          value={ordenZonas}
          onChange={(event) => setOrdenZonas(event.target.value as OrdenZonas)}
          aria-label="Ordenar zonas por"
          className={selectClass}
        >
          <option value="total">Reservas</option>
          <option value="ocupacion">Ocupación</option>
          <option value="eficiencia">Eficiencia</option>
          <option value="score">Score</option>
        </select>
      </label>

      <span className="inline-flex shrink-0 items-center gap-1.5">
        <input
          type="search"
          value={searchZona}
          onChange={(event) => setSearchZona(event.target.value)}
          placeholder="Buscar zona..."
          aria-label="Buscar zona por nombre"
          className="hostly-focus-ring min-w-[140px] max-w-[220px] rounded-[var(--hostly-radius-md)] border border-[var(--hostly-line)] bg-[var(--hostly-surface-card-solid)] px-3 py-2 text-[13px] font-semibold text-[color:var(--hostly-ink-strong)] outline-none"
        />
        {searchZona.trim().length > 0 ? (
          <HostlyButton variant="tool" size="compact" onClick={() => setSearchZona("")}>
            Limpiar
          </HostlyButton>
        ) : null}
      </span>

      <label className={fieldLabelClass}>
        Mostrar
        <select
          value={String(limitZonas)}
          onChange={(event) => setLimitZonas(Number(event.target.value))}
          aria-label="Cantidad de zonas visibles en la tabla"
          className={selectClass}
        >
          <option value="0">Todas</option>
          <option value="5">Top 5</option>
          <option value="10">Top 10</option>
          <option value="20">Top 20</option>
        </select>
      </label>

      {hasViewFilters ? (
        <HostlyButton variant="tool" size="compact" onClick={limpiarFiltrosVistaZonas}>
          Limpiar filtros
        </HostlyButton>
      ) : null}

      {vistaDefaultZonas !== "Vista por defecto" ? (
        <HostlyButton variant="tool" size="compact" onClick={aplicarVistaDefaultZonas}>
          Vista por defecto
        </HostlyButton>
      ) : null}

      <div className="inline-flex flex-wrap items-center gap-2.5 py-1">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.04em] text-[color:var(--hostly-ink-muted)]">
          Columnas
        </span>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={columnasZonas.reservas}
            onChange={(event) =>
              setColumnasZonas((current) => ({ ...current, reservas: event.target.checked }))
            }
          />
          Reservas
        </label>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={columnasZonas.llegadas}
            onChange={(event) =>
              setColumnasZonas((current) => ({ ...current, llegadas: event.target.checked }))
            }
          />
          Llegadas
        </label>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={columnasZonas.noShow}
            onChange={(event) =>
              setColumnasZonas((current) => ({ ...current, noShow: event.target.checked }))
            }
          />
          No-show
        </label>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={columnasZonas.pax}
            onChange={(event) =>
              setColumnasZonas((current) => ({ ...current, pax: event.target.checked }))
            }
          />
          Pax
        </label>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={columnasZonas.ocupacion}
            onChange={(event) =>
              setColumnasZonas((current) => ({ ...current, ocupacion: event.target.checked }))
            }
          />
          Ocupación
        </label>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={columnasZonas.eficiencia}
            onChange={(event) =>
              setColumnasZonas((current) => ({ ...current, eficiencia: event.target.checked }))
            }
          />
          Eficiencia
        </label>
        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={columnasZonas.score}
            onChange={(event) =>
              setColumnasZonas((current) => ({ ...current, score: event.target.checked }))
            }
          />
          Score
        </label>
      </div>

      <HostlyButton variant="tool" size="compact" onClick={resetZonasPrefs}>
        Reset
      </HostlyButton>
      <HostlyButton
        variant="secondary"
        size="compact"
        onClick={() => exportarZonas(zoneMetricsLimited, columnasZonas)}
      >
        Exportar zonas
      </HostlyButton>
      <HostlyButton variant="secondary" size="compact" onClick={copiarResumenZonas}>
        Copiar resumen
      </HostlyButton>
    </div>
  );
}
