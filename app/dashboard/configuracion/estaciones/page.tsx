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
  createProductionStation,
  listenProductionStations,
  setProductionStationActive,
  updateProductionStation,
} from "@/lib/firestore/production-stations";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  DEFAULT_PRODUCTION_STATION_COLOR,
  PRODUCTION_STATION_COLOR_PRESETS,
  PRODUCTION_STATION_TYPES,
  PRODUCTION_STATION_TYPE_LABELS,
  normalizeProductionStationColor,
  type ProductionStationDocument,
  type ProductionStationType,
} from "@/lib/produccion/production-station-types";

const inputClass = "hostly-input hostly-carta-config-field-input";

type StationFormDraft = {
  name: string;
  type: ProductionStationType;
  color: string;
  active: boolean;
};

const DEFAULT_DRAFT: StationFormDraft = {
  name: "",
  type: "cocina",
  color: DEFAULT_PRODUCTION_STATION_COLOR,
  active: true,
};

function stationToDraft(station: ProductionStationDocument): StationFormDraft {
  return {
    name: station.name,
    type: station.type,
    color: station.color,
    active: station.active,
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

  const [items, setItems] = useState<ProductionStationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionStationDocument | null>(null);
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

    const unsub = listenProductionStations(
      restaurantId,
      (list) => {
        setItems(list);
        setLoading(false);
      },
      () => {
        setError("No se pudieron cargar las estaciones.");
        setItems([]);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authReady, restaurantId]);

  function openNew() {
    setEditing(null);
    setDraft({ ...DEFAULT_DRAFT });
    setPanelOpen(true);
    setError(null);
  }

  function openEdit(station: ProductionStationDocument) {
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
        await updateProductionStation(restaurantId, editing.id, {
          name,
          type: draft.type,
          color: draft.color,
          active: draft.active,
        });
      } else {
        await createProductionStation(restaurantId, {
          name,
          type: draft.type,
          color: draft.color,
          active: draft.active,
        });
      }
      setPanelOpen(false);
      setNotice("Estación guardada.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(formatStationError(e));
    } finally {
      setSaving(false);
    }
  }, [draft, editing, restaurantId]);

  const toggleActive = useCallback(
    async (station: ProductionStationDocument) => {
      if (!restaurantId) return;
      setError(null);
      try {
        await setProductionStationActive(restaurantId, station.id, !station.active);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <ConfigModulePageHeader
        eyebrow="Producción"
        title="Estaciones"
        description="Define dónde se prepara cada producto: cocina, barra, coctelería u otras zonas."
      />

      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4">
        <ConfigCard compact className="hostly-carta-config-card--muted hostly-carta-familia-concept">
          <p className="hostly-carta-config-section-body">
            Las estaciones son los puntos de producción del restaurante. Más adelante los productos y
            familias podrán asignarse a una estación concreta.
          </p>
          <p className="hostly-carta-config-form-hint hostly-carta-familia-concept__hint">
            Esta configuración aún no afecta al TPV ni a las pantallas de cocina.
          </p>
        </ConfigCard>

        <div className="hostly-carta-config-actions-row">
          <ConfigBtnPrimary type="button" disabled={!authReady || !restaurantId} onClick={openNew}>
            Nueva estación
          </ConfigBtnPrimary>
        </div>

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
          <div className="hostly-carta-config-kpi-strip hostly-carta-config-kpi-strip--dense">
            <div className="hostly-carta-config-kpi-pill">
              <span className="hostly-carta-config-kpi-pill__label">Estaciones activas</span>
              <span className="hostly-carta-config-kpi-pill__value">{activeCount}</span>
            </div>
            <div className="hostly-carta-config-kpi-pill">
              <span className="hostly-carta-config-kpi-pill__label">Total</span>
              <span className="hostly-carta-config-kpi-pill__value">{items.length}</span>
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
                  placeholder="Cocina, Barra Piscina, Pizzería…"
                  disabled={saving}
                />
              </label>

              <label className="hostly-carta-config-form-field">
                <span className="hostly-carta-config-form-label">Tipo</span>
                <select
                  className={inputClass}
                  value={draft.type}
                  disabled={saving}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      type: e.target.value as ProductionStationType,
                    }))
                  }
                >
                  {PRODUCTION_STATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {PRODUCTION_STATION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
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
                  Se usará en listados y pantallas de producción.
                </p>
              </div>

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
    </div>
  );
}
