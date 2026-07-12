"use client";

import { useMemo } from "react";
import type { OperationalElementInstance } from "@/lib/sala-editor/ose/operational-element-instance";
import { getOperationalElementCatalogItem } from "@/lib/sala-editor/ose/operational-element-catalog";
import { getOperationalInstanceCanvasSize } from "@/lib/sala-editor/canvas/operational-instance-layout";
import type { FloorPlan } from "@/lib/firestore/floorPlans";
import type { Table } from "@/lib/firestore/tables";
import {
  extractSingleTableNumber,
  readLegacyTableIdFromMetadata,
  resolveSafeLegacyTableAutoLink,
} from "@/lib/sala-editor/linking/legacy-table-linking";

export type SalaOperationalElementInstanceInspectorProps = {
  instance: OperationalElementInstance;
  legacyTables?: Table[];
  legacyFloorPlans?: FloorPlan[];
  linkedLegacyTableIds?: string[];
  onLinkLegacyTable?: (legacyTableId: string | null) => void;
};

function formatLegacyTableCandidate(table: Table, floorPlansById: Map<string, FloorPlan>): string {
  const number = extractSingleTableNumber(table.name);
  const capacity = table.seats > 0 ? `${table.seats} pax` : "sin capacidad";
  const floorPlanName =
    table.floorPlanId && floorPlansById.get(table.floorPlanId)
      ? floorPlansById.get(table.floorPlanId)!.name
      : table.floorPlanId
        ? `Plano ${table.floorPlanId}`
        : "Plano principal";
  return [number ? `Nº ${number}` : null, capacity, floorPlanName]
    .filter(Boolean)
    .join(" · ");
}

export function SalaOperationalElementInstanceInspector({
  instance,
  legacyTables = [],
  legacyFloorPlans = [],
  linkedLegacyTableIds = [],
  onLinkLegacyTable,
}: SalaOperationalElementInstanceInspectorProps) {
  const catalogItem = getOperationalElementCatalogItem(instance.elementType);
  const size = getOperationalInstanceCanvasSize(instance);
  const currentLegacyTableId = readLegacyTableIdFromMetadata(instance.metadata);
  const floorPlansById = useMemo(
    () => new Map(legacyFloorPlans.map((plan) => [plan.id, plan])),
    [legacyFloorPlans],
  );
  const linkedIds = useMemo(
    () => new Set(linkedLegacyTableIds.filter((id) => id !== currentLegacyTableId)),
    [currentLegacyTableId, linkedLegacyTableIds],
  );
  const linkedTable = currentLegacyTableId
    ? legacyTables.find((table) => table.id === currentLegacyTableId) ?? null
    : null;
  const suggestedLegacyTableId = useMemo(
    () =>
      resolveSafeLegacyTableAutoLink({
        instance,
        legacyTables,
        usedLegacyTableIds: linkedIds,
        restaurantId: instance.metadata.restaurantId
          ? String(instance.metadata.restaurantId)
          : legacyTables[0]?.restaurantId ?? "",
      }).legacyTableId,
    [instance, legacyTables, linkedIds],
  );
  const canLink = instance.elementType === "TABLE" && onLinkLegacyTable;

  return (
    <div className="hostly-sala-editor-inspector">
      {instance.elementType === "TABLE" ? (
        <section className="hostly-sala-editor-inspector__section">
          <h4 className="hostly-sala-editor-inspector__section-title">Enlace TPV</h4>
          <div className="hostly-sala-editor-inspector__card hostly-sala-linking-card">
            <span
              className={[
                "hostly-sala-linking-status",
                currentLegacyTableId ? "is-linked" : "is-unlinked",
              ].join(" ")}
            >
              {currentLegacyTableId
                ? `Enlazada con ${linkedTable?.name ?? currentLegacyTableId}`
                : "No enlazada"}
            </span>
            <p className="hostly-sala-linking-card__hint">
              El enlace solo guarda <code>metadata.legacyTableId</code>. No cambia
              pedidos, pagos, reservas ni ocupación.
            </p>
            {canLink ? (
              <div className="hostly-sala-linking-card__controls">
                <label className="hostly-sala-editor-inspector__field">
                  <span className="hostly-sala-editor-inspector__field-label">
                    Enlazar con mesa existente
                  </span>
                  <select
                    value={currentLegacyTableId}
                    className="hostly-sala-editor-inspector__input"
                    onChange={(event) => {
                      const next = event.target.value.trim();
                      onLinkLegacyTable(next || null);
                    }}
                  >
                    <option value="">Sin enlace</option>
                    {legacyTables.map((table) => {
                      const usedByOther = linkedIds.has(table.id);
                      return (
                        <option
                          key={table.id}
                          value={table.id}
                          disabled={usedByOther}
                        >
                          {table.name} · {formatLegacyTableCandidate(table, floorPlansById)}
                          {usedByOther ? " · ya enlazada" : ""}
                        </option>
                      );
                    })}
                  </select>
                </label>
                {suggestedLegacyTableId && !currentLegacyTableId ? (
                  <button
                    type="button"
                    className="hostly-sala-linking-card__suggestion"
                    onClick={() => onLinkLegacyTable(suggestedLegacyTableId)}
                  >
                    Sugerencia segura:{" "}
                    {legacyTables.find((table) => table.id === suggestedLegacyTableId)?.name ??
                      suggestedLegacyTableId}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      <section className="hostly-sala-editor-inspector__section">
        <h4 className="hostly-sala-editor-inspector__section-title">Avanzado</h4>
        <dl className="hostly-sala-editor-inspector__card grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
          <div className="col-span-2">
            <dt className="font-bold text-slate-600">Nombre</dt>
            <dd className="font-semibold text-slate-800">{instance.name}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Tipo</dt>
            <dd className="font-semibold text-slate-800">
              {catalogItem?.label ?? instance.elementType}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Capacidad</dt>
            <dd className="font-semibold text-slate-800">
              {instance.capacity > 0 ? `${instance.capacity} pax` : "—"}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">X</dt>
            <dd className="font-mono font-semibold text-slate-600">
              {Math.round(instance.position.x)}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Y</dt>
            <dd className="font-mono font-semibold text-slate-600">
              {Math.round(instance.position.y)}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Ancho</dt>
            <dd className="font-mono font-semibold text-slate-600">{size.width}px</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Alto</dt>
            <dd className="font-mono font-semibold text-slate-600">{size.height}px</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-600">Rotación</dt>
            <dd className="font-mono font-semibold text-slate-600">{instance.rotation}°</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
