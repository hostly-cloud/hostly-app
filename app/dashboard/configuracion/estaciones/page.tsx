"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
} from "../_components/config-carta-workbench";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  createOperationStation,
  disableOperationStation,
  enableOperationStation,
  ensureDefaultOperationStations,
  listenOperationStations,
  moveOperationStationOrder,
  updateOperationStation,
} from "@/lib/firestore/operation-stations";
import {
  OPERATION_STATION_TYPE_LABELS,
  OPERATION_STATION_TYPES,
  type OperationStationDocument,
  type OperationStationInput,
  type OperationStationType,
} from "@/lib/operacion/operation-station-types";

type StationDraft = {
  name: string;
  type: OperationStationType;
  active: boolean;
  printerChannel: string;
  printerName: string;
};

function stationToDraft(station: OperationStationDocument): StationDraft {
  return {
    name: station.name,
    type: station.type,
    active: station.active,
    printerChannel: station.printerChannel ?? "",
    printerName: station.printerName ?? "",
  };
}

function formatOperationStationError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "DUPLICATE_STATION_NAME") {
      return "Ya existe una estación con ese nombre.";
    }
    return error.message;
  }
  return "No se pudo guardar la estación.";
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20";

export default function ConfigEstacionesPage() {
  const { restaurantId: profileRestaurantId, ready: authReady } = useAuth();
  const restaurantId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );

  const [stations, setStations] = useState<OperationStationDocument[]>([]);
  const [drafts, setDrafts] = useState<Record<string, StationDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ensuringDefaults, setEnsuringDefaults] = useState(false);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<OperationStationType>("bar");

  const syncDrafts = useCallback((list: OperationStationDocument[]) => {
    const next: Record<string, StationDraft> = {};
    for (const s of list) {
      next[s.id] = stationToDraft(s);
    }
    setDrafts(next);
  }, []);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setLoading(false);
      setStations([]);
      setDrafts({});
      return;
    }

    setLoading(true);
    setError(null);
    let defaultsEnsured = false;

    const unsub = listenOperationStations(
      restaurantId,
      (list) => {
        setStations(list);
        syncDrafts(list);
        setLoading(false);
        if (!defaultsEnsured && list.length === 0) {
          defaultsEnsured = true;
          setEnsuringDefaults(true);
          void ensureDefaultOperationStations(restaurantId)
            .catch((e) => {
              console.error("ensureDefaultOperationStations", e);
              setError(formatOperationStationError(e));
            })
            .finally(() => setEnsuringDefaults(false));
        }
      },
      (e) => {
        console.error("listenOperationStations", e);
        setError("No se pudo cargar las estaciones operativas.");
        setStations([]);
        setDrafts({});
        setLoading(false);
      },
    );

    return () => unsub();
  }, [authReady, restaurantId, syncDrafts]);

  const patchDraft = useCallback(
    (id: string, patch: Partial<StationDraft>) => {
      setDrafts((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, ...patch },
      }));
    },
    [],
  );

  const handleCreate = useCallback(async () => {
    if (!restaurantId) return;
    const name = newName.trim();
    if (!name) {
      setError("Indica un nombre para la estación.");
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      await createOperationStation(restaurantId, {
        name,
        type: newType,
        active: true,
      });
      setNewName("");
      setNewType("bar");
      setNotice(`Estación «${name}» creada.`);
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      setError(formatOperationStationError(e));
    } finally {
      setCreating(false);
    }
  }, [newName, newType, restaurantId]);

  const handleSave = useCallback(
    async (station: OperationStationDocument) => {
      if (!restaurantId) return;
      const draft = drafts[station.id];
      if (!draft) return;
      setSavingId(station.id);
      setError(null);
      setNotice(null);
      try {
        const input: Partial<OperationStationInput> = {
          name: draft.name.trim(),
          type: draft.type,
          active: draft.active,
          printerChannel: draft.printerChannel.trim(),
          printerName: draft.printerName.trim(),
        };
        await updateOperationStation(restaurantId, station.id, input);
        setNotice("Cambios guardados.");
        window.setTimeout(() => setNotice(null), 2800);
      } catch (e) {
        setError(formatOperationStationError(e));
      } finally {
        setSavingId(null);
      }
    },
    [drafts, restaurantId],
  );

  const handleToggleActive = useCallback(
    async (station: OperationStationDocument) => {
      if (!restaurantId) return;
      setSavingId(station.id);
      setError(null);
      try {
        if (station.active) {
          await disableOperationStation(restaurantId, station.id);
        } else {
          await enableOperationStation(restaurantId, station.id);
        }
      } catch (e) {
        setError(formatOperationStationError(e));
      } finally {
        setSavingId(null);
      }
    },
    [restaurantId],
  );

  const handleMove = useCallback(
    async (stationId: string, direction: "up" | "down") => {
      if (!restaurantId) return;
      setSavingId(stationId);
      setError(null);
      try {
        await moveOperationStationOrder(restaurantId, stationId, direction);
      } catch (e) {
        setError(formatOperationStationError(e));
      } finally {
        setSavingId(null);
      }
    },
    [restaurantId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <header className="mx-auto mb-6 w-full max-w-[var(--hostly-config-content-max)] sm:mb-7">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">
          Operación · Configuración
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          Estaciones operativas
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Define dónde se preparan productos y a qué impresora o pantalla van.
          El TPV y el KDS siguen usando la estación legacy del producto hasta la
          siguiente fase.
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4">
        {error ? (
          <p className="text-sm text-rose-700" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm text-emerald-800" role="status">
            {notice}
          </p>
        ) : null}

        <ConfigCard>
          <h2 className="text-sm font-semibold text-slate-900">Nueva estación</h2>
          <p className="mt-1 text-xs text-slate-500">
            Ej.: Barra 2, Barra terraza, Piscina, Food truck.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Nombre</span>
              <input
                className={`${inputClass} mt-1`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Barra terraza"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">Tipo</span>
              <select
                className={`${inputClass} mt-1`}
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as OperationStationType)
                }
              >
                {OPERATION_STATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {OPERATION_STATION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <ConfigBtnPrimary
              type="button"
              disabled={creating || !authReady}
              onClick={() => void handleCreate()}
            >
              {creating ? "Creando…" : "Crear estación"}
            </ConfigBtnPrimary>
          </div>
        </ConfigCard>

        {loading || ensuringDefaults ? (
          <ConfigCard>
            <p className="text-sm text-slate-600">Cargando estaciones…</p>
          </ConfigCard>
        ) : stations.length === 0 ? (
          <ConfigCard>
            <p className="text-sm text-slate-600">
              No hay estaciones. Se crearán las predeterminadas al conectar.
            </p>
          </ConfigCard>
        ) : (
          <ul className="flex flex-col gap-3">
            {stations.map((station, index) => {
              const draft = drafts[station.id] ?? stationToDraft(station);
              const busy = savingId === station.id;
              const dirty =
                draft.name !== station.name ||
                draft.type !== station.type ||
                draft.active !== station.active ||
                draft.printerChannel !== (station.printerChannel ?? "") ||
                draft.printerName !== (station.printerName ?? "");
              return (
                <li key={station.id}>
                  <ConfigCard>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 grid gap-3 sm:grid-cols-2">
                        <label className="block sm:col-span-2">
                          <span className="text-xs font-medium text-slate-600">
                            Nombre
                          </span>
                          <input
                            className={`${inputClass} mt-1`}
                            value={draft.name}
                            onChange={(e) =>
                              patchDraft(station.id, { name: e.target.value })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-slate-600">
                            Tipo
                          </span>
                          <select
                            className={`${inputClass} mt-1`}
                            value={draft.type}
                            onChange={(e) =>
                              patchDraft(station.id, {
                                type: e.target.value as OperationStationType,
                              })
                            }
                          >
                            {OPERATION_STATION_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {OPERATION_STATION_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-2 pt-6">
                          <input
                            type="checkbox"
                            checked={draft.active}
                            onChange={(e) =>
                              patchDraft(station.id, {
                                active: e.target.checked,
                              })
                            }
                          />
                          <span className="text-sm text-slate-700">Activa</span>
                        </label>
                        <div className="block sm:col-span-2">
                          <p className="text-xs font-medium text-slate-600">
                            Impresora de esta estación
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            Esta impresora se usará para los productos enviados a
                            esta estación. Si dejas canal o nombre vacíos, se
                            usará la configuración legacy de Cocina/Barra/Coctelería
                            según el tipo de producto.
                          </p>
                        </div>
                        <label className="block sm:col-span-1">
                          <span className="text-xs font-medium text-slate-600">
                            Canal / identificador
                          </span>
                          <input
                            className={`${inputClass} mt-1`}
                            value={draft.printerChannel}
                            placeholder="Ej. barra-1"
                            onChange={(e) =>
                              patchDraft(station.id, {
                                printerChannel: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="block sm:col-span-1">
                          <span className="text-xs font-medium text-slate-600">
                            Nombre impresora
                          </span>
                          <input
                            className={`${inputClass} mt-1`}
                            value={draft.printerName}
                            placeholder="Ej. EPSON-BARRA-1"
                            onChange={(e) =>
                              patchDraft(station.id, {
                                printerName: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col lg:items-stretch">
                        <div className="flex gap-1">
                          <ConfigBtnSecondary
                            type="button"
                            disabled={busy || index === 0}
                            onClick={() => void handleMove(station.id, "up")}
                          >
                            ↑
                          </ConfigBtnSecondary>
                          <ConfigBtnSecondary
                            type="button"
                            disabled={busy || index === stations.length - 1}
                            onClick={() => void handleMove(station.id, "down")}
                          >
                            ↓
                          </ConfigBtnSecondary>
                        </div>
                        <ConfigBtnPrimary
                          type="button"
                          disabled={busy || !dirty}
                          onClick={() => void handleSave(station)}
                        >
                          {busy ? "Guardando…" : "Guardar"}
                        </ConfigBtnPrimary>
                        <ConfigBtnSecondary
                          type="button"
                          disabled={busy}
                          onClick={() => void handleToggleActive(station)}
                        >
                          {station.active ? "Desactivar" : "Activar"}
                        </ConfigBtnSecondary>
                      </div>
                    </div>
                    <p className="mt-3 font-mono text-[10px] text-slate-400">
                      {station.id} · orden {station.sortOrder}
                      {!station.active ? " · inactiva" : ""}
                    </p>
                  </ConfigCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
