"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function stationFieldLabel(key: PrinterStationKey): string {
  return PRINTER_CONFIG_DEFAULT_DISPLAY_NAMES[key];
}

export default function ConfigImpresorasPage() {
  const { restaurantId: profileRestaurantId, ready: authReady, user } =
    useAuth();
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usingDefaults, setUsingDefaults] = useState(true);

  useEffect(() => {
    if (!authReady || !restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const unsub = listenPrinterConfig(
      restaurantId,
      (config, meta) => {
        setRemoteConfig(meta.exists ? config : null);
        setDraft(cloneConfig(config));
        setUsingDefaults(!meta.exists);
        setLoading(false);
      },
      (e) => {
        console.error("listenPrinterConfig", e);
        setError("No se pudo cargar la configuración de impresoras.");
        setRemoteConfig(null);
        setDraft(getDefaultPrinterConfig());
        setUsingDefaults(true);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [authReady, restaurantId]);

  const patchStation = useCallback(
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

  const handleSave = useCallback(async () => {
    if (!restaurantId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await savePrinterConfig(restaurantId, draft);
      setNotice("Configuración guardada.");
      window.setTimeout(() => setNotice(null), 2800);
    } catch (e) {
      console.error("savePrinterConfig", e);
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Revisa permisos y conexión.",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, restaurantId]);

  const handleResetDraft = useCallback(() => {
    if (remoteConfig) {
      setDraft(cloneConfig(remoteConfig));
    } else {
      setDraft(getDefaultPrinterConfig());
    }
    setError(null);
  }, [remoteConfig]);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
      <header className="mx-auto mb-6 w-full max-w-[var(--hostly-config-content-max)] sm:mb-7">
        <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">
          Operación · Configuración
        </p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          Impresoras
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Configura qué impresora recibirá cada estación. Al enviar comanda se
          encolan tickets por estación; revisa el simulador en la cola (sin
          hardware todavía).
        </p>
        <p className="mt-3 max-w-2xl rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm leading-relaxed text-amber-950">
          La configuración por Cocina/Barra/Coctelería se usa como fallback.
          Para varias barras usa{" "}
          <Link
            href="/dashboard/configuracion/estaciones"
            className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-800"
          >
            Configuración → Estaciones
          </Link>
          .
        </p>
        <p className="mt-3">
          <Link
            href="/dashboard/configuracion/impresoras/cola"
            className="text-sm font-medium text-sky-700 hover:text-sky-800"
          >
            Ver cola de impresión (simulador) →
          </Link>
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4">
        {loading ? (
          <ConfigCard>
            <p className="text-sm text-slate-600">Cargando configuración…</p>
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
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Activar impresión
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Cuando esté activo, Hostly podrá enrutar tickets por estación
                    (sin imprimir hasta conectar hardware).
                  </p>
                </div>
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
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
                  <span className="text-sm font-medium text-slate-800">
                    {draft.enabled ? "Activada" : "Desactivada"}
                  </span>
                </label>
              </div>
              {usingDefaults && remoteConfig === null ? (
                <p className="mt-3 text-xs text-slate-500">
                  Sin documento en Firestore — se muestran valores por defecto
                  hasta guardar.
                </p>
              ) : null}
            </ConfigCard>

            <div className="grid gap-4 lg:grid-cols-1">
              {PRINTER_STATION_KEYS.map((key) => {
                const station = draft.stations[key];
                return (
                  <ConfigCard key={key}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900">
                          {stationFieldLabel(key)}
                        </h2>
                        <p className="text-xs text-slate-500">
                          Estación{" "}
                          <code className="text-[10px]">{key}</code>
                        </p>
                      </div>
                      <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={station.enabled}
                          onChange={(e) =>
                            patchStation(key, { enabled: e.target.checked })
                          }
                        />
                        <span className="text-xs font-medium text-slate-700">
                          Estación activa
                        </span>
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-700">
                        Nombre impresora
                        <input
                          type="text"
                          className="hostly-surface-flat mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          placeholder="Ej. EPSON-COCINA"
                          value={station.printerName ?? ""}
                          onChange={(e) =>
                            patchStation(key, {
                              printerName: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-700">
                        Canal / identificador
                        <input
                          type="text"
                          className="hostly-surface-flat mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          placeholder="Ej. kitchen-main"
                          value={station.channel ?? ""}
                          onChange={(e) =>
                            patchStation(key, { channel: e.target.value })
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-700">
                        Nombre visible
                        <input
                          type="text"
                          className="hostly-surface-flat mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          value={station.displayName}
                          onChange={(e) =>
                            patchStation(key, { displayName: e.target.value })
                          }
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-700">
                        Copias (1–5)
                        <input
                          type="number"
                          min={1}
                          max={5}
                          className="hostly-surface-flat mt-1 w-full min-h-[44px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                          value={station.copies ?? 1}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            patchStation(key, {
                              copies: Number.isFinite(n) ? n : 1,
                            });
                          }}
                        />
                      </label>
                    </div>
                  </ConfigCard>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ConfigBtnPrimary disabled={saving || !restaurantId} onClick={() => void handleSave()}>
                {saving ? "Guardando…" : "Guardar"}
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

            <p className="text-xs text-slate-500">
              Documento:{" "}
              <code className="text-[10px]">
                restaurants/{restaurantId || "…"}/config/printers
              </code>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
