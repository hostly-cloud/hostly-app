"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyAlert,
  HostlyButton,
  HostlyDrawer,
  HostlyField,
  HostlyFormToggle,
  HostlyInput,
  HostlyKpiCard,
  HostlySectionHeader,
  HostlySelect,
  HostlySurface,
} from "@/components/ui/hostly";
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
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4 pb-6">
        <HostlySectionHeader
          title="Estaciones"
          description="Organiza los puntos de producción y su identificación visual."
        >
          <HostlyButton
            variant="primary"
            type="button"
            disabled={!authReady || !restaurantId}
            onClick={openNew}
          >
            Nueva estación
          </HostlyButton>
        </HostlySectionHeader>

        <HostlyAlert tone="info" title="Puntos de producción">
          Las estaciones representan cocinas, barras y otros destinos operativos.
          <span className="mt-1 block">
            Esta configuración aún no afecta al TPV ni a las pantallas de cocina.
          </span>
        </HostlyAlert>

        {!restaurantId ? (
          <HostlyAlert tone="warning">
            Selecciona un restaurante para gestionar estaciones.
          </HostlyAlert>
        ) : null}

        {error ? (
          <HostlyAlert tone="danger">{error}</HostlyAlert>
        ) : null}
        {notice ? (
          <HostlyAlert tone="success">{notice}</HostlyAlert>
        ) : null}

        {restaurantId && !loading ? (
          <div className="grid grid-cols-2 gap-3">
            <HostlyKpiCard title="Estaciones activas" value={activeCount} />
            <HostlyKpiCard title="Total" value={items.length} variant="soft" />
          </div>
        ) : null}

        <HostlySurface variant="flat" className="overflow-hidden">
          <ProductionStationsDataView
            items={items}
            loading={loading}
            onEdit={openEdit}
            onToggleActive={(s) => void toggleActive(s)}
            onCreateNew={openNew}
          />
        </HostlySurface>
      </div>

      {panelOpen ? (
        <div className="hostly-carta-config-drawer-backdrop">
          <HostlyDrawer
            className="hostly-production-station-drawer"
            title={editing ? "Editar estación" : "Nueva estación"}
            description="Define cómo se identifica este punto de producción."
            footer={
              <>
                <HostlyButton
                  variant="primary"
                  disabled={saving}
                  onClick={() => void savePanel()}
                >
                  {saving ? "Guardando…" : "Guardar estación"}
                </HostlyButton>
                {editing ? (
                  <HostlyButton
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void toggleActive(editing)}
                  >
                    {editing.active ? "Desactivar" : "Activar"}
                  </HostlyButton>
                ) : null}
                <HostlyButton
                  variant="ghost"
                  disabled={saving}
                  onClick={() => setPanelOpen(false)}
                >
                  Cancelar
                </HostlyButton>
              </>
            }
          >
            <div className="grid gap-4">
              <HostlyField label="Nombre">
                <HostlyInput
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Cocina, Barra Piscina, Pizzería…"
                  disabled={saving}
                />
              </HostlyField>

              <HostlyField label="Tipo">
                <HostlySelect
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
                </HostlySelect>
              </HostlyField>

              <div className="hostly-ds-field">
                <span className="hostly-ds-field__label hostly-type-caption">
                  Color
                </span>
                <div
                  className="hostly-production-station-color-picker"
                  role="radiogroup"
                  aria-label="Color de estación"
                >
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
                <span className="hostly-ds-field__message hostly-type-caption">
                  Se usará en listados y pantallas de producción.
                </span>
              </div>

              <HostlyFormToggle
                label="Estación activa"
                hint="Permite utilizarla como destino operativo."
                checked={draft.active}
                disabled={saving}
                onChange={(e) => setDraft((prev) => ({ ...prev, active: e.target.checked }))}
              />
            </div>
          </HostlyDrawer>
        </div>
      ) : null}
    </div>
  );
}
