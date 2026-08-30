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

const STATION_PRESENTATION: Record<
  PrinterStationKey,
  { eyebrow: string; description: string }
> = {
  kitchen: {
    eyebrow: "Producción caliente",
    description: "Comandas de cocina y pase",
  },
  bar: {
    eyebrow: "Bebidas",
    description: "Tickets de barra y cafetería",
  },
  cocktail: {
    eyebrow: "Coctelería",
    description: "Comandas del punto de cócteles",
  },
};

function PrinterStationGlyph({ station }: { station: PrinterStationKey }) {
  if (station === "kitchen") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden>
        <path d="M10 31h28v6H10zM15 27c0-7 4-12 9-12s9 5 9 12" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" />
        <path d="M24 11v4M12 24H8m32 0h-4" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    );
  }
  if (station === "bar") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden>
        <path d="M13 12h22l-4 12a7.5 7.5 0 0 1-14 0L13 12Z" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" />
        <path d="M24 30v7m-6 0h12" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M12 14h24L25 27v9h5M18 36h12" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 19h14" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      <circle cx="34" cy="11" r="3" fill="currentColor" opacity=".55" />
    </svg>
  );
}

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

  const activeStationCount = PRINTER_STATION_KEYS.filter(
    (key) => draft.stations[key].enabled,
  ).length;
  const configuredStationCount = PRINTER_STATION_KEYS.filter((key) => {
    const station = draft.stations[key];
    return Boolean(station.printerName?.trim() || station.channel?.trim());
  }).length;

  return (
    <div className="hostly-config-page-body hostly-printer-control flex min-h-0 flex-1 flex-col">
      <div className="hostly-printer-control__inner mx-auto flex w-full max-w-[var(--hostly-config-content-max)] flex-col gap-4 pb-6">
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
            <section
              className={`hostly-printer-control__hero${draft.enabled ? " is-enabled" : ""}`}
              aria-label="Estado de impresión"
            >
              <div className="hostly-printer-control__hero-icon" aria-hidden>
                <svg viewBox="0 0 56 56" fill="none">
                  <path d="M17 19V9h22v10M17 39v8h22v-8" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                  <path d="M12 20h32a5 5 0 0 1 5 5v13H7V25a5 5 0 0 1 5-5Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
                  <path d="M18 31h20M40 26h2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </div>
              <div className="hostly-printer-control__hero-copy">
                <span className="hostly-printer-control__eyebrow">Salida de tickets</span>
                <h3>{draft.enabled ? "Impresión preparada" : "Impresión en pausa"}</h3>
                <p>Hostly enrutará cada comanda al destino configurado cuando se conecte el hardware.</p>
              </div>
              <div className="hostly-printer-control__hero-toggle">
                <HostlyFormToggle
                  label={draft.enabled ? "Sistema activo" : "Sistema inactivo"}
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                />
              </div>
              <div className="hostly-printer-control__metrics" aria-label="Resumen de impresión">
                <div>
                  <strong>{activeStationCount}</strong>
                  <span>estaciones activas</span>
                </div>
                <div>
                  <strong>{configuredStationCount}</strong>
                  <span>destinos enlazados</span>
                </div>
                <div>
                  <strong>{usingDefaults && remoteConfig === null ? "Demo" : "Guardado"}</strong>
                  <span>origen de configuración</span>
                </div>
              </div>
              <div className="hostly-printer-control__fallback-note">
                <span>Respaldo operativo</span>
                Cocina, Barra y Coctelería actúan como destinos generales. Para varias barras usa{" "}
                <Link href="/dashboard/configuracion/estaciones">Estaciones</Link>.
              </div>
            </section>

            <div className="hostly-printer-control__station-grid">
              {PRINTER_STATION_KEYS.map((key) => {
                const station = draft.stations[key];
                const presentation = STATION_PRESENTATION[key];
                return (
                  <HostlySurface
                    key={key}
                    variant="flat"
                    className={`hostly-printer-station-card hostly-printer-station-card--${key}${station.enabled ? " is-enabled" : ""}`}
                  >
                    <header className="hostly-printer-station-card__header">
                      <div className="hostly-printer-station-card__glyph">
                        <PrinterStationGlyph station={key} />
                      </div>
                      <div className="hostly-printer-station-card__heading">
                        <span>{presentation.eyebrow}</span>
                        <h3>{stationFieldLabel(key)}</h3>
                        <p>{presentation.description}</p>
                      </div>
                      <HostlyFormToggle
                        label={station.enabled ? "Activa" : "Inactiva"}
                        checked={station.enabled}
                        onChange={(e) => patchStation(key, { enabled: e.target.checked })}
                      />
                    </header>

                    <div className="hostly-printer-station-card__fields">
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

            <div className="hostly-printer-control__savebar sticky bottom-0 z-10 flex flex-wrap items-center gap-3">
              <p>Los cambios no afectan a otras cuentas ni restaurantes.</p>
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
