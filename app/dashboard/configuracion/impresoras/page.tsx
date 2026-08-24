"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  ConfigBtnPrimary,
  ConfigBtnSecondary,
  ConfigCard,
} from "../_components/config-carta-workbench";
import { resolveOperationalRestaurantId } from "@/lib/hostly/restaurant-scope";
import {
  PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES,
  PRINTER_STATION_KEYS,
  type PrinterConfigDocument,
  type PrinterStationConfig,
  type PrinterStationKey,
} from "@/lib/printing/printer-config-types";
import {
  getDefaultPrinterConfig,
  listenPrinterConfig,
  savePrinterConfig,
} from "@/lib/firestore/printer-config";
import {
  listenOperationStations,
  updateOperationStation,
} from "@/lib/firestore/operation-stations";
import type {
  OperationStationDocument,
  OperationStationType,
} from "@/lib/operacion/operation-station-types";

type StationPrinterDraft = {
  printerName: string;
  printerChannel: string;
};

const PRINTABLE_OPERATION_TYPES = new Set<OperationStationType>([
  "kitchen",
  "bar",
  "cocktail",
]);

function cloneConfig(doc: PrinterConfigDocument): PrinterConfigDocument {
  return {
    enabled: doc.enabled,
    updatedAt: doc.updatedAt,
    ...(doc.updatedBy ? { updatedBy: doc.updatedBy } : {}),
    stations: {
      kitchen: { ...doc.stations.kitchen },
      bar: { ...doc.stations.bar },
      cocktail: { ...doc.stations.cocktail },
    },
  };
}

function draftFromStation(station: OperationStationDocument): StationPrinterDraft {
  return {
    printerName: station.printerName ?? "",
    printerChannel: station.printerChannel ?? "",
  };
}

function legacyKeyForOperationType(
  type: OperationStationType,
): PrinterStationKey | null {
  if (type === "kitchen") return "kitchen";
  if (type === "bar") return "bar";
  if (type === "cocktail") return "cocktail";
  return null;
}

function operationTypeLabel(type: OperationStationType): string {
  if (type === "kitchen") return "Cocina";
  if (type === "bar") return "Barra";
  if (type === "cocktail") return "Coctelería";
  if (type === "floor") return "Sala";
  return "Personalizada";
}

function stationFieldLabel(key: PrinterStationKey): string {
  return PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES[key];
}

function normalized(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export default function ConfigImpresorasPage() {
  const { restaurantId: profileRestaurantId, ready: authReady, user } = useAuth();
  const restaurantId = useMemo(
    () => resolveOperationalRestaurantId(profileRestaurantId),
    [profileRestaurantId],
  );

  const [remoteConfig, setRemoteConfig] = useState<PrinterConfigDocument | null>(
    null,
  );
  const [draft, setDraft] = useState<PrinterConfigDocument>(() =>
    getDefaultPrinterConfig(),
  );
  const [operationStations, setOperationStations] = useState<
    OperationStationDocument[]
  >([]);
  const [stationDrafts, setStationDrafts] = useState<
    Record<string, StationPrinterDraft>
  >({});
  const dirtyStationIdsRef = useRef<Set<string>>(new Set());
  const [configLoading, setConfigLoading] = useState(true);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usingDefaults, setUsingDefaults] = useState(true);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setConfigLoading(false);
      return;
    }
    setConfigLoading(true);
    setError(null);
    const unsub = listenPrinterConfig(
      restaurantId,
      (config, meta) => {
        setRemoteConfig(meta.exists ? config : null);
        setDraft(cloneConfig(config));
        setUsingDefaults(!meta.exists);
        setConfigLoading(false);
      },
      (e) => {
        console.error("listenPrinterConfig", e);
        setError("No se pudo cargar la configuración general de impresoras.");
        setRemoteConfig(null);
        setDraft(getDefaultPrinterConfig());
        setUsingDefaults(true);
        setConfigLoading(false);
      },
    );
    return () => unsub();
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setStationsLoading(false);
      setOperationStations([]);
      setStationDrafts({});
      return;
    }

    setStationsLoading(true);
    const unsub = listenOperationStations(
      restaurantId,
      (stations) => {
        setOperationStations(stations);
        setStationDrafts((previous) => {
          const next: Record<string, StationPrinterDraft> = {};
          for (const station of stations) {
            next[station.id] = dirtyStationIdsRef.current.has(station.id)
              ? previous[station.id] ?? draftFromStation(station)
              : draftFromStation(station);
          }
          return next;
        });
        setStationsLoading(false);
      },
      (e) => {
        console.error("listenOperationStations", e);
        setError("No se pudieron cargar las estaciones operativas.");
        setStationsLoading(false);
      },
    );
    return () => unsub();
  }, [authReady, restaurantId]);

  const loading = configLoading || stationsLoading;

  const printableStations = useMemo(
    () =>
      operationStations.filter((station) =>
        PRINTABLE_OPERATION_TYPES.has(station.type),
      ),
    [operationStations],
  );

  const configuredStationCount = useMemo(
    () =>
      printableStations.filter((station) => {
        const stationDraft = stationDrafts[station.id] ?? draftFromStation(station);
        return Boolean(
          normalized(stationDraft.printerName) ||
            normalized(stationDraft.printerChannel),
        );
      }).length,
    [printableStations, stationDrafts],
  );

  const patchFallbackStation = useCallback(
    (key: PrinterStationKey, patch: Partial<PrinterStationConfig>) => {
      setDraft((prev) => ({
        ...prev,
        stations: {
          ...prev.stations,
          [key]: { ...prev.stations[key], ...patch },
        },
      }));
    },
    [],
  );

  const patchOperationStation = useCallback(
    (station: OperationStationDocument, patch: Partial<StationPrinterDraft>) => {
      dirtyStationIdsRef.current.add(station.id);
      setStationDrafts((prev) => ({
        ...prev,
        [station.id]: {
          ...(prev[station.id] ?? draftFromStation(station)),
          ...patch,
        },
      }));
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!restaurantId) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const dirtyIds = [...dirtyStationIdsRef.current];
      for (const stationId of dirtyIds) {
        const station = operationStations.find((item) => item.id === stationId);
        const stationDraft = stationDrafts[stationId];
        if (!station || !stationDraft) continue;

        const nextPrinterName = normalized(stationDraft.printerName);
        const nextPrinterChannel = normalized(stationDraft.printerChannel);
        const currentPrinterName = normalized(station.printerName);
        const currentPrinterChannel = normalized(station.printerChannel);

        if (
          nextPrinterName !== currentPrinterName ||
          nextPrinterChannel !== currentPrinterChannel
        ) {
          await updateOperationStation(restaurantId, station.id, {
            printerName: nextPrinterName,
            printerChannel: nextPrinterChannel,
          });
        }
      }

      await savePrinterConfig(restaurantId, draft);
      dirtyStationIdsRef.current.clear();
      setNotice("Routing de impresoras guardado.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      console.error("save printer routing", e);
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Revisa permisos y conexión.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, operationStations, restaurantId, stationDrafts]);

  const handleResetDraft = useCallback(() => {
    dirtyStationIdsRef.current.clear();
    setDraft(
      remoteConfig ? cloneConfig(remoteConfig) : getDefaultPrinterConfig(),
    );
    setStationDrafts(
      Object.fromEntries(
        operationStations.map((station) => [
          station.id,
          draftFromStation(station),
        ]),
      ),
    );
    setError(null);
    setNotice(null);
  }, [operationStations, remoteConfig]);

  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="m-0 text-xl font-semibold tracking-[-0.025em] text-slate-950">
              Impresoras y routing
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
              Cada estación real puede tener su propia impresora o canal. Cocina fría,
              Pizza, Josper, Barra terraza o Barra piscina dejan de compartir un único
              destino genérico.
            </p>
          </div>
          <Link
            href="/dashboard/configuracion/impresoras/cola"
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-sm font-medium text-sky-800 no-underline hover:bg-sky-100"
          >
            Ver cola de impresión
          </Link>
        </div>

        {loading ? (
          <ConfigCard>
            <p className="text-sm text-slate-600">Cargando impresoras y estaciones…</p>
          </ConfigCard>
        ) : null}

        {!loading && !user ? (
          <ConfigCard>
            <p className="text-sm text-amber-900">
              Inicia sesión para guardar la configuración de impresoras.
            </p>
          </ConfigCard>
        ) : null}

        {!loading ? (
          <>
            <ConfigCard>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-slate-950">
                    Impresión operativa
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Interruptor general. El worker respeta primero el destino guardado
                    en el trabajo, después la estación concreta y por último el fallback
                    de Cocina/Barra/Coctelería.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                      {printableStations.length} estaciones
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">
                      {configuredStationCount} con destino propio
                    </span>
                  </div>
                </div>
                <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:justify-start">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={draft.enabled}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        enabled: e.target.checked,
                      }))
                    }
                  />
                  <span className="text-sm font-semibold text-slate-800">
                    {draft.enabled ? "Activada" : "Desactivada"}
                  </span>
                </label>
              </div>
              {usingDefaults && remoteConfig === null ? (
                <p className="mt-3 text-xs text-slate-500">
                  Aún no existe configuración general guardada. Hostly usa valores
                  seguros por defecto hasta el primer guardado.
                </p>
              ) : null}
            </ConfigCard>

            <section className="flex flex-col gap-3" aria-labelledby="station-printers-title">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2
                    id="station-printers-title"
                    className="m-0 text-base font-semibold text-slate-950"
                  >
                    Estaciones reales
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Un destino propio prevalece sobre el fallback de su tipo.
                  </p>
                </div>
                <Link
                  href="/dashboard/configuracion/estaciones"
                  className="text-sm font-medium text-sky-700 no-underline hover:text-sky-800 hover:underline"
                >
                  Gestionar estaciones →
                </Link>
              </div>

              {printableStations.length === 0 ? (
                <ConfigCard>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="m-0 text-sm font-semibold text-slate-900">
                        No hay estaciones de producción
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Crea al menos una Cocina, Barra o Coctelería para asignarle una
                        impresora concreta.
                      </p>
                    </div>
                    <Link
                      href="/dashboard/configuracion/estaciones"
                      className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 no-underline hover:bg-slate-50"
                    >
                      Crear estación
                    </Link>
                  </div>
                </ConfigCard>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {printableStations.map((station) => {
                    const stationDraft =
                      stationDrafts[station.id] ?? draftFromStation(station);
                    const legacyKey = legacyKeyForOperationType(station.type);
                    const fallback = legacyKey ? draft.stations[legacyKey] : null;
                    const hasExplicit = Boolean(
                      normalized(stationDraft.printerName) ||
                        normalized(stationDraft.printerChannel),
                    );
                    const hasFallback = Boolean(
                      fallback?.enabled &&
                        (normalized(fallback.printerName) ||
                          normalized(fallback.channel)),
                    );

                    return (
                      <ConfigCard key={station.id}>
                        <div className="mb-3 flex min-w-0 items-start justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span
                              className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border border-black/5"
                              style={{ backgroundColor: station.color ?? "#cbd5e1" }}
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <h3 className="m-0 truncate text-sm font-semibold text-slate-950">
                                {station.name}
                              </h3>
                              <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                                {operationTypeLabel(station.type)}
                                {station.active ? " · Activa" : " · Inactiva"}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                              hasExplicit
                                ? "bg-emerald-50 text-emerald-800"
                                : hasFallback
                                  ? "bg-sky-50 text-sky-800"
                                  : "bg-amber-50 text-amber-800"
                            }`}
                          >
                            {hasExplicit
                              ? "Destino propio"
                              : hasFallback
                                ? "Usa fallback"
                                : "Sin destino"}
                          </span>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block min-w-0 text-xs font-medium text-slate-700">
                            Nombre de impresora
                            <input
                              type="text"
                              className="hostly-surface-flat mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                              placeholder="Ej. EPSON-JOSPER"
                              value={stationDraft.printerName}
                              onChange={(e) =>
                                patchOperationStation(station, {
                                  printerName: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="block min-w-0 text-xs font-medium text-slate-700">
                            Canal / identificador
                            <input
                              type="text"
                              className="hostly-surface-flat mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                              placeholder="Ej. kitchen-josper"
                              value={stationDraft.printerChannel}
                              onChange={(e) =>
                                patchOperationStation(station, {
                                  printerChannel: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>

                        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                          {hasExplicit
                            ? "Los tickets de esta estación usarán este destino específico."
                            : hasFallback && legacyKey
                              ? `Sin destino propio: heredará el fallback de ${stationFieldLabel(legacyKey)}.`
                              : "Configura nombre, canal o el fallback del tipo para que el worker tenga destino."}
                        </p>
                      </ConfigCard>
                    );
                  })}
                </div>
              )}
            </section>

            <details className="rounded-xl border border-slate-200 bg-white">
              <summary className="min-h-[44px] cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-900 marker:hidden">
                Compatibilidad · fallback Cocina / Barra / Coctelería
                <span className="ml-2 text-xs font-normal text-slate-500">
                  para productos o restaurantes aún no configurados por estación
                </span>
              </summary>
              <div className="grid gap-3 border-t border-slate-100 p-3 lg:grid-cols-3">
                {PRINTER_STATION_KEYS.map((key) => {
                  const fallback = draft.stations[key];
                  return (
                    <div
                      key={key}
                      className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="m-0 text-sm font-semibold text-slate-900">
                          {stationFieldLabel(key)}
                        </p>
                        <label className="inline-flex min-h-[36px] cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={fallback.enabled}
                            onChange={(e) =>
                              patchFallbackStation(key, {
                                enabled: e.target.checked,
                              })
                            }
                          />
                          Fallback activo
                        </label>
                      </div>
                      <div className="grid gap-2">
                        <label className="block text-xs font-medium text-slate-700">
                          Impresora
                          <input
                            type="text"
                            className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            placeholder={`Ej. EPSON-${key.toUpperCase()}`}
                            value={fallback.printerName ?? ""}
                            onChange={(e) =>
                              patchFallbackStation(key, {
                                printerName: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-700">
                          Canal
                          <input
                            type="text"
                            className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            placeholder={`${key}-main`}
                            value={fallback.channel ?? ""}
                            onChange={(e) =>
                              patchFallbackStation(key, { channel: e.target.value })
                            }
                          />
                        </label>
                        <label className="block text-xs font-medium text-slate-700">
                          Copias (1–5)
                          <input
                            type="number"
                            min={1}
                            max={5}
                            className="mt-1 min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                            value={fallback.copies ?? 1}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              patchFallbackStation(key, {
                                copies: Number.isFinite(n) ? n : 1,
                              });
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>

            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 border-t border-slate-200/80 bg-white/95 px-1 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
              <ConfigBtnPrimary
                disabled={saving || !restaurantId}
                onClick={() => void handleSave()}
              >
                {saving ? "Guardando…" : "Guardar routing"}
              </ConfigBtnPrimary>
              <ConfigBtnSecondary disabled={saving} onClick={handleResetDraft}>
                Descartar cambios
              </ConfigBtnSecondary>
            </div>

            {notice ? (
              <p className="text-sm font-medium text-emerald-800">{notice}</p>
            ) : null}
            {error ? (
              <p className="text-sm font-medium text-red-800">{error}</p>
            ) : null}

            <p className="text-xs leading-relaxed text-slate-500">
              Routing específico: <code className="text-[10px]">restaurants/{restaurantId || "…"}/operationStations</code> · fallback compatible:{" "}
              <code className="text-[10px]">config/printers</code>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
