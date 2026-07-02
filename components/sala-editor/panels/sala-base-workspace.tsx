"use client";

import type { SalaEspacio } from "@/lib/sala-editor/types/espacio";
import {
  SALA_ESPACIO_BASE_FLOOR_LABELS,
  SALA_ESPACIO_BASE_SHAPE_LABELS,
  SALA_ESPACIO_BASE_STATUS_LABELS,
  normalizeSalaEspacioBase,
} from "@/lib/sala-editor/types/espacio-base";
import { SalaEspacioCanvasFrame } from "@/components/sala-editor/panels/sala-espacio-canvas-frame";

const BASE_PREPARATION_ITEMS = [
  "Forma general",
  "Dimensiones",
  "Escala",
  "Orientación",
  "Suelo",
  "Cuadrícula",
  "Referencias visuales futuras",
] as const;

export type SalaBaseWorkspaceProps = {
  espacio: SalaEspacio;
  restaurantId: string;
};

function formatDimension(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function SalaBaseWorkspace({
  espacio,
  restaurantId,
}: SalaBaseWorkspaceProps) {
  const base = normalizeSalaEspacioBase(espacio.base);

  return (
    <SalaEspacioCanvasFrame
      espacio={espacio}
      restaurantId={restaurantId}
      hint={
        <div className="hostly-sala-espacio-frame__hero">
          <p className="hostly-sala-espacio-frame__hero-title">
            Prepara la base del mapa
          </p>
          <p className="hostly-sala-espacio-frame__hero-hint">
            Aquí se definirá la preparación física antes de dibujar paredes o mesas.
            Todavía no hay herramientas de edición avanzada.
          </p>

          <dl className="mt-4 grid gap-2 rounded-xl border border-slate-200/80 bg-white/70 p-3 text-left text-[11px] text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-500">Estado</dt>
              <dd>{SALA_ESPACIO_BASE_STATUS_LABELS[base.status]}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Forma</dt>
              <dd>{SALA_ESPACIO_BASE_SHAPE_LABELS[base.shapeType]}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Dimensiones</dt>
              <dd>
                {formatDimension(base.dimensions.width)} ×{" "}
                {formatDimension(base.dimensions.height)} {base.unit}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Escala</dt>
              <dd>{base.scale.pixelsPerUnit} px/m</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Orientación</dt>
              <dd>{base.orientation.degrees}°</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-500">Suelo</dt>
              <dd className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-slate-200"
                  style={{ backgroundColor: base.floor.color }}
                  aria-hidden
                />
                {SALA_ESPACIO_BASE_FLOOR_LABELS[base.floor.kind]}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="font-semibold text-slate-500">Cuadrícula</dt>
              <dd>
                {base.grid.visible ? "Visible" : "Oculta"} · {base.grid.size}px
              </dd>
            </div>
          </dl>

          <ul className="mt-3 grid gap-1.5 text-left text-[10px] font-semibold text-slate-500 sm:grid-cols-2">
            {BASE_PREPARATION_ITEMS.map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <span className="text-[var(--hostly-accent)]" aria-hidden>
                  •
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}
