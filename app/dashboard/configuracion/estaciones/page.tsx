"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
} from "../_components/config-carta-workbench";
import { ConfigModulePageHeader } from "../_components/config-module-page-header";
import { ProductionStationsDataView } from "@/components/produccion/production-stations-data-view";
import {
  createOperationStation,
  disableOperationStation,
  enableOperationStation,
  listenOperationStations,
  updateOperationStation,
} from "@/lib/firestore/operation-stations";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  DEFAULT_PRODUCTION_STATION_COLOR,
  PRODUCTION_STATION_COLOR_PRESETS,
  normalizeProductionStationColor,
} from "@/lib/produccion/production-station-types";
import {
  OPERATION_STATION_TYPES,
  OPERATION_STATION_TYPE_LABELS,
  type OperationStationDocument,
  type OperationStationType,
} from "@/lib/operacion/operation-station-types";

const inputClass = "hostly-input hostly-carta-config-field-input";

type StationFormDraft = {
  name: string;
  type: OperationStationType;
  color: string;
  active: boolean;
  sortOrder: number;
};

const DEFAULT_DRAFT: StationFormDraft = {
  name: "",
  type: "kitchen",
  color: DEFAULT_PRODUCTION_STATION_COLOR,
  active: true,
  sortOrder: 0,
};

function stationToDraft(station: OperationStationDocument): StationFormDraft {
  return {
    name: station.name,
    type: station.type,
    color: station.color ?? DEFAULT_PRODUCTION_STATION_COLOR,
    active: station.active,
    sortOrder: station.sortOrder,
  };
}

function formatStationError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "DUPLICATE_STATION_NAME") {
      return "Ya existe una estación con ese nombre.";
    }
    return error.message;
  }
  return "No se pudo guardar la estación.";
}

export default function ConfigEstacionesPage() {
  const { restaurantId: profileRestaurantId, ready: authReady } = useAuth();
  const restaurantId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );

  const [items, setItems] = useState<OperationStationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<OperationStationDocument | null>(null);
  const [draft, setDraft] = useState<StationFormDraft>(DEFAULT_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setLoading(false);
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);

    const unsub = listenOperationStations(
      restaurantId,
      (list) => {
        setItems(list);
        setLoading(false);
      },
      () => {
        setError("No se pudieron cargar las estaciones operativas.");
        setItems([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authReady, restaurantId]);

  function nextSortOrder(): number {
    if (items.length === 0) return 0;
    return Math.max(...items.map((station) => station.sortOrder)) + 10;
  }

  function openNew() {
    setEditing(null);
    setDraft({ ...DEFAULT_DRAFT, sortOrder: nextSortOrder() });
    setPanelOpen(true);
    setError(null);
  }

  function openEdit(station: OperationStationDocument) {
    setEditing(station);
    setDraft(stationToDraft(station));
    setPanelOpen(true);
    setError(null);
  }

  const savePanel = useCallback(async () => {
    if (!restaurantId) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Indica un nombre para la estación.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      if (editing) {
        await updateOperationStation(restaurantId, editing.id, {
          name,
          type: draft.type,
          color: draft.color,
          active: draft.active,
          sortOrder: draft.sortOrder,
        });
      } else {
        await createOperationStation(restaurantId, {
          name,
          type: draft.type,
          color: draft.color,
          active: draft.active,
          sortOrder: draft.sortOrder,
        });
      }
      setPanelOpen(false);
      setNotice("Estación operativa guardada.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(formatStationError(e));
    } finally {
      setSaving(false);
    }
  }, [draft, editing, restaurantId]);

  const toggleActive = useCallback(
    async (station: OperationStationDocument) => {
      if (!restaurantId) return;
      setError(null);
      try {
        if (station.active) {
          await disableOperationStation(restaurantId, station.id);
        } else {
          await enableOperationStation(restaurantId, station.id);
        }
        if (editing?.id === station.id) {
          setDraft((prev) => ({ ...prev, active: !station.active }));
          setEditing({ ...station, active: !station.active });
        }
      } catch (e) {
        setError(formatStationError(e));
      }
    },
    [editing, restaurantId],
  );

  const activeCount = items.filter((s) => s.active).length;
  const typeCounts = useMemo(
    () => ({
      kitchen: items.filter((s) => s.active && s.type === "kitchen").length,
      bar: items.filter((s) => s.active && s.type === "bar").length,
      cocktail: items.filter((s) => s.active && s.type === "cocktail").length,
    }),
    [items],
  );

  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col">
      <ConfigModulePageHeader
        actions={
          <ConfigBtnPrimary type="button" disabled={!authReady || !restaurantId} onClick={openNew}>
            Nueva estación
          </ConfigBtnPrimary>
        }
      />

      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4">
        <ConfigCard compact className="hostly-carta-config-card--muted hostly-carta-familia-concept">
          <p className="hostly-carta-config-section-body">
            Crea todos los puntos reales de producción del restaurante. Puedes tener varias estaciones del mismo tipo:
            <strong> Barra 1, Barra 2, Barra terraza, Cocina fría, Pizza, Josper, Postres</strong>…
          </p>
          <p className="hostly-carta-config-form-hint hostly-carta-familia-concept__hint">
            Estas estaciones alimentan los selectores reales de Cocina, Barra y Coctelería y pueden asignarse a productos.
          </p>
        </ConfigCard>

        {!restaurantId ? (
          <div className="hostly-carta-config-alert hostly-carta-config-alert--warning">
            Selecciona un restaurante para gestionar estaciones.
          </div>
        ) : null}

        {error ? (
          <div className="hostly-carta-config-alert hostly-carta-config-alert--error" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <p className="hostly-carta-config-alert hostly-carta-config-alert--success" role="status">
            {notice}
          </p>
        ) : null}

        {restaurantId && !loading ? (
          <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense" aria-label="Resumen de estaciones">
            <div className="hostly-carta-config-kpi-pill">
              <span className="hostly-carta-config-kpi-pill__label">Activas</span>
              <span className="hostly-carta-config-kpi-pill__value">{activeCount}</span>
            </div>
            <div className="hostly-carta-config-kpi-pill">
              <span className="hostly-carta-config-kpi-pill__label">Cocinas</span>
              <span className="hostly-carta-config-kpi-pill__value">{typeCounts.kitchen}</span>
            </div>
            <div className="hostly-carta-config-kpi-pill">
              <span className="hostly-carta-config-kpi-pill__label">Barras</span>
              <span className="hostly-carta-config-kpi-pill__value">{typeCounts.bar}</span>
            </div>
            <div className="hostly-carta-config-kpi-pill">
              <span className="hostly-carta-config-kpi-pill__label">Coctelería</span>
              <span className="hostly-carta-config-kpi-pill__value">{typeCounts.cocktail}</span>
            </div>
          </div>
        ) : null}

        <ConfigCard flush>
          <ProductionStationsDataView
            items={items}
            loading={loading}
            onEdit={openEdit}
            onToggleActive={(s) => void toggleActive(s)}
            onCreateNew={openNew}
          />
        </ConfigCard>
      </div>

      {panelOpen ? (
        <div className="hostly-carta-config-drawer-backdrop" role="dialog" aria-modal="true">
          <ConfigCard className="hostly-carta-config-drawer hostly-production-station-drawer">
            <h2 className="hostly-carta-config-drawer__title">
              {editing ? "Editar estación" : "Nueva estación"}
            </h2>
            <div className="hostly-carta-config-form hostly-carta-config-drawer__body">
              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Nombre</span>
                <input
                  className={inputClass}
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Barra piscina, Cocina fría, Josper…"
                  disabled={saving}
                />
              </label>

              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Tipo operativo</span>
                <select
                  className={inputClass}
                  value={draft.type}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      type: e.target.value as OperationStationType,
                    }))
                  }
                >
                  {OPERATION_STATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {OPERATION_STATION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <p className="hostly-carta-config-form-hint">
                  Pizza, Josper, fría o postres son estaciones de tipo Cocina. Barra terraza o piscina son de tipo Barra.
                </p>
              </label>

              <div className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Color</span>
                <div className="hostly-production-station-color-picker" role="radiogroup" aria-label="Color de estación">
                  {PRODUCTION_STATION_COLOR_PRESETS.map((preset) => {
                    const selected =
                      normalizeProductionStationColor(draft.color).toLowerCase() ===
                      preset.value.toLowerCase();
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={preset.label}
                        title={preset.label}
                        disabled={saving}
                        className={`hostly-production-station-color-picker__btn${selected ? " is-selected" : ""}`}
                        style={{ backgroundColor: preset.value }}
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, color: preset.value }))
                        }
                      />
                    );
                  })}
                </div>
                <p className="hostly-carta-config-form-hint">
                  El color identifica la estación rápidamente en los filtros de producción.
                </p>
              </div>

              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Orden operativo</span>
                <input
                  className={inputClass}
                  type="number"
                  step={10}
                  value={draft.sortOrder}
                  disabled={saving}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setDraft((prev) => ({
                      ...prev,
                      sortOrder: Number.isFinite(value) ? Math.floor(value) : 0,
                    }));
                  }}
                />
                <p className="hostly-carta-config-form-hint">Menor número = aparece antes.</p>
              </label>

              <label className="hostly-carta-config-form-checkbox">
                <input
                  type="checkbox"
                  checked={draft.active}
                  disabled={saving}
                  onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.checked }))}
                />
                <span className="hostly-carta-config-form-label">Estación activa</span>
              </label>
            </div>
            <div className="hostly-carta-config-drawer__footer">
              <ConfigBtnPrimary type="button" disabled={saving} onClick={() => void savePanel()}>
                {saving ? "Guardando…" : "Guardar estación"}
              </ConfigBtnPrimary>
              {editing ? (
                <ConfigBtnSecondary
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleActive(editing)}
                >
                  {editing.active ? "Desactivar" : "Activar"}
                </ConfigBtnSecondary>
              ) : null}
              <ConfigBtnSecondary type="button" disabled={saving} onClick={() => setPanelOpen(false)}>
                Cancelar
              </ConfigBtnSecondary>
            </div>
          </ConfigCard>
        </div>
      ) : null}

      <style>{`
        @media (max-width: 767px) {
          .hostly-production-station-drawer {
            width: 100vw !important;
            max-width: none !important;
            height: 100dvh !important;
            max-height: 100dvh !important;
            border-radius: 0 !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }
          .hostly-production-station-drawer .hostly-carta-config-drawer__title {
            padding-top: max(12px, env(safe-area-inset-top, 0px)) !important;
          }
          .hostly-production-station-drawer .hostly-carta-config-drawer__body {
            flex: 1 1 auto !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            padding: 8px 10px !important;
          }
          .hostly-production-station-drawer .hostly-carta-config-form-field {
            min-width: 0 !important;
          }
          .hostly-production-station-drawer .hostly-carta-config-field-input {
            min-height: 42px !important;
            font-size: 13px !important;
          }
          .hostly-production-station-drawer .hostly-carta-config-drawer__footer {
            padding-bottom: max(10px, env(safe-area-inset-bottom, 0px)) !important;
          }
          .hostly-production-station-drawer .hostly-carta-config-drawer__footer button {
            min-height: 44px !important;
          }
          .hostly-production-station-color-picker {
            display: flex !important;
            overflow-x: auto !important;
            flex-wrap: nowrap !important;
            gap: 8px !important;
            padding-bottom: 3px !important;
          }
          .hostly-production-station-color-picker__btn {
            flex: 0 0 38px !important;
            width: 38px !important;
            height: 38px !important;
          }
        }
      `}</style>
    </div>
  );
}
