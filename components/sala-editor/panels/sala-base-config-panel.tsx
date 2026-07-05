"use client";

import type { ChangeEvent } from "react";
import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import type { SalaEspacioBasePatch } from "@/lib/sala-editor/base/espacio-base-editor";
import {
  BASE_FLOOR_CATALOG,
  type BaseFloorCatalogKind,
  baseFloorFromCatalogKind,
} from "@/lib/sala-editor/catalog/base-floor-catalog";
import {
  SALA_ESPACIO_BASE_STATUS_LABELS,
  normalizeSalaEspacioBase,
} from "@/lib/sala-editor/types/espacio-base";

export type SalaBaseConfigPanelProps = {
  espacio: SalaEspacio;
  onUpdateBase: (patch: SalaEspacioBasePatch) => void;
};

const GRID_SIZE_PRESETS = [8, 12, 16, 20, 24] as const;

function parseDimensionInput(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 10) / 10;
}

export function SalaBaseConfigPanel({
  espacio,
  onUpdateBase,
}: SalaBaseConfigPanelProps) {
  const base = normalizeSalaEspacioBase(espacio.base);
  const statusClass =
    base.status === "lista"
      ? "is-ready"
      : base.status === "incompleta"
        ? "is-progress"
        : "is-pending";

  const handleDimensionChange =
    (field: "width" | "height") => (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = parseDimensionInput(event.target.value);
      if (nextValue == null) return;
      onUpdateBase({
        dimensions: {
          ...base.dimensions,
          [field]: nextValue,
        },
      });
    };

  const handleGridVisibleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onUpdateBase({
      grid: {
        ...base.grid,
        visible: event.target.checked,
      },
    });
  };

  const handleGridSizeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    if (!Number.isFinite(nextValue) || nextValue < 4 || nextValue > 128) return;
    onUpdateBase({
      grid: {
        ...base.grid,
        size: nextValue,
      },
    });
  };

  const handleFloorSelect = (kind: BaseFloorCatalogKind) => {
    onUpdateBase({
      floor: baseFloorFromCatalogKind(kind),
    });
  };

  return (
    <div className="hostly-sala-base-config">
      <div className="hostly-sala-base-config__head">
        <p className="hostly-sala-base-config__title">Preparar espacio</p>
        <span
          className={[
            "hostly-sala-base-config__status",
            statusClass,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {SALA_ESPACIO_BASE_STATUS_LABELS[base.status]}
        </span>
      </div>

      <section className="hostly-sala-base-config__section">
        <h3 className="hostly-sala-base-config__section-title">Dimensiones</h3>
        <p className="hostly-sala-base-config__section-hint">
          Tamaño aproximado del espacio en {base.unit}.
        </p>
        <div className="hostly-sala-base-config__dimension-row">
          <label className="hostly-sala-base-config__field">
            <span>Ancho</span>
            <input
              type="number"
              min={1}
              max={200}
              step={0.5}
              value={base.dimensions.width}
              onChange={handleDimensionChange("width")}
              className="hostly-sala-base-config__input"
            />
          </label>
          <label className="hostly-sala-base-config__field">
            <span>Alto</span>
            <input
              type="number"
              min={1}
              max={200}
              step={0.5}
              value={base.dimensions.height}
              onChange={handleDimensionChange("height")}
              className="hostly-sala-base-config__input"
            />
          </label>
        </div>
      </section>

      <section className="hostly-sala-base-config__section">
        <h3 className="hostly-sala-base-config__section-title">Cuadrícula</h3>
        <label className="hostly-sala-base-config__toggle">
          <input
            type="checkbox"
            checked={base.grid.visible}
            onChange={handleGridVisibleChange}
          />
          <span>Mostrar cuadrícula</span>
        </label>
        <label className="hostly-sala-base-config__field hostly-sala-base-config__field--grid">
          <span>Tamaño</span>
          <div className="hostly-sala-base-config__grid-size-row">
            <input
              type="number"
              min={4}
              max={128}
              step={1}
              value={base.grid.size}
              onChange={handleGridSizeChange}
              className="hostly-sala-base-config__input"
            />
            <span className="hostly-sala-base-config__unit">px</span>
          </div>
        </label>
        <div className="hostly-sala-base-config__preset-row">
          {GRID_SIZE_PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              className={[
                "hostly-sala-base-config__preset",
                base.grid.size === size ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() =>
                onUpdateBase({
                  grid: { ...base.grid, size },
                })
              }
            >
              {size}
            </button>
          ))}
        </div>
      </section>

      <section className="hostly-sala-base-config__section">
        <h3 className="hostly-sala-base-config__section-title">Suelo</h3>
        <p className="hostly-sala-base-config__section-hint">
          Apariencia visual del suelo. No afecta al servicio.
        </p>
        <div className="hostly-sala-base-config__floor-grid">
          {BASE_FLOOR_CATALOG.map((entry) => {
            const selected = base.floor.kind === entry.kind;
            return (
              <button
                key={entry.kind}
                type="button"
                aria-pressed={selected}
                className={[
                  "hostly-sala-base-config__floor",
                  selected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleFloorSelect(entry.kind)}
              >
                <span
                  className="hostly-sala-base-config__floor-swatch"
                  style={{ background: entry.background }}
                  aria-hidden
                />
                <span className="hostly-sala-base-config__floor-label">
                  {entry.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
