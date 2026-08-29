"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyAlert,
  HostlyButton,
  HostlyField,
  HostlyFormToggle,
  HostlyInput,
  HostlyLoadingState,
  HostlyPermissionState,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
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
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4 pb-6">
        <HostlySectionHeader
          title="Impresoras"
          description="Configura el destino y las copias de los tickets por estación."
        >
          <Link
            href="/dashboard/configuracion/impresoras/cola"
            className="hostly-button-secondary hostly-button-compact"
          >
            Ver cola de impresión
          </Link>
        </HostlySectionHeader>

        <HostlyAlert tone="warning" title="Configuración de respaldo">
          La configuración por Cocina/Barra/Coctelería se usa como fallback.
          Para varias barras usa{" "}
          <Link
            href="/dashboard/configuracion/estaciones"
            className="font-medium text-amber-900 underline underline-offset-2 hover:text-amber-800"
          >
            Configuración → Estaciones
          </Link>
          .
        </HostlyAlert>

        {loading ? (
          <HostlyLoadingState embedded label="Cargando configuración de impresoras…" />
        ) : null}

        {!loading && !user ? (
          <HostlyPermissionState embedded title="Sesión necesaria">
            Inicia sesión para guardar la configuración de impresoras.
          </HostlyPermissionState>
        ) : null}

        {!loading ? (
          <>
            <HostlySurface variant="ice" className="p-4 sm:p-5">
              <HostlyFormToggle
                label={draft.enabled ? "Impresión activada" : "Impresión desactivada"}
                hint="Hostly enrutará los tickets por estación cuando se conecte el hardware."
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              {usingDefaults && remoteConfig === null ? (
                <p className="hostly-muted mt-3 text-xs">Se muestran valores por defecto hasta guardar por primera vez.</p>
              ) : null}
            </HostlySurface>

            <div className="grid gap-3">
              {PRINTER_STATION_KEYS.map((key) => {
                const station = draft.stations[key];
                return (
                  <HostlySurface key={key} variant="flat" className="p-4 sm:p-5">
                    <HostlySectionHeader
                      title={stationFieldLabel(key)}
                      description={`Destino ${key}`}
                      className="mb-4 border-b border-[var(--hostly-line)] pb-3"
                    >
                      <HostlyFormToggle
                        label="Estación activa"
                        checked={station.enabled}
                        onChange={(e) => patchStation(key, { enabled: e.target.checked })}
                      />
                    </HostlySectionHeader>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <HostlyField label="Nombre impresora">
                        <HostlyInput
                          type="text"
                          placeholder="Ej. EPSON-COCINA"
                          value={station.printerName ?? ""}
                          onChange={(e) =>
                            patchStation(key, { printerName: e.target.value })
                          }
                        />
                      </HostlyField>
                      <HostlyField label="Canal / identificador">
                        <HostlyInput
                          type="text"
                          placeholder="Ej. kitchen-main"
                          value={station.channel ?? ""}
                          onChange={(e) =>
                            patchStation(key, { channel: e.target.value })
                          }
                        />
                      </HostlyField>
                      <HostlyField label="Nombre visible">
                        <HostlyInput
                          type="text"
                          value={station.displayName}
                          onChange={(e) =>
                            patchStation(key, { displayName: e.target.value })
                          }
                        />
                      </HostlyField>
                      <HostlyField label="Copias (1–5)">
                        <HostlyInput
                          type="number"
                          min={1}
                          max={5}
                          value={station.copies ?? 1}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            patchStation(key, {
                              copies: Number.isFinite(n) ? n : 1,
                            });
                          }}
                        />
                      </HostlyField>
                    </div>
                  </HostlySurface>
                );
              })}
            </div>

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-[var(--hostly-line)] bg-[var(--hostly-surface-page-soft)] py-3">
              <HostlyButton variant="primary" disabled={saving || !restaurantId} onClick={() => void handleSave()}>
                {saving ? "Guardando…" : "Guardar"}
              </HostlyButton>
              <HostlyButton variant="secondary" disabled={saving} onClick={handleResetDraft}>
                Descartar cambios
              </HostlyButton>
            </div>

            {notice ? <HostlyAlert tone="success">{notice}</HostlyAlert> : null}
            {error ? <HostlyAlert tone="danger">{error}</HostlyAlert> : null}

            <p className="hostly-muted text-xs">Configuración aislada para el restaurante activo.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
