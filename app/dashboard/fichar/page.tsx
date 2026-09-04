"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HostlyAlert, HostlyButton, HostlyCard } from "@/components/ui/hostly";
import type { ClockAction } from "@/lib/employees/types";
import {
  requestClockingSelfState,
  requestQrClock,
  type ClockingSelfState,
} from "@/lib/employees/request-secure-clocking";

const ACTION_LABELS: Record<ClockAction, string> = {
  clock_in: "Fichar entrada",
  break_start: "Iniciar descanso",
  break_end: "Terminar descanso",
  clock_out: "Fichar salida",
};

const STATUS_LABELS = {
  not_started: "Todavía no has fichado hoy",
  working: "Estás trabajando",
  on_break: "Estás en descanso",
  completed: "Jornada finalizada",
} as const;

function errorLabel(error: unknown) {
  const code = error instanceof Error ? error.message : "CLOCKING_OPERATION_FAILED";
  const labels: Record<string, string> = {
    UNAUTHORIZED: "Inicia sesión con tu cuenta de Hostly para fichar.",
    CLOCK_LOCATION_NOT_CONFIGURED: "El restaurante todavía no ha configurado la ubicación de fichaje.",
    INVALID_GEOLOCATION: "No hemos podido leer una ubicación válida.",
    LOCATION_ACCURACY_TOO_LOW: "La ubicación del móvil no es suficientemente precisa. Activa la ubicación precisa e inténtalo otra vez.",
    OUTSIDE_RESTAURANT_GEOFENCE: "Estás fuera de la zona permitida del restaurante.",
    INVALID_CLOCKING_QR: "Este QR no es válido.",
    CLOCKING_QR_EXPIRED: "Este QR ha caducado. Escanea el QR actual del restaurante.",
    TIME_ENTRY_ALREADY_OPEN: "Ya tienes una jornada abierta.",
    TIME_ENTRY_NOT_OPEN: "No hay una jornada abierta para esta acción.",
    BREAK_ALREADY_STARTED: "El descanso ya está iniciado.",
    BREAK_NOT_STARTED: "No hay ningún descanso iniciado.",
    CLOCKING_DISABLED: "El fichaje está desactivado temporalmente.",
  };
  return labels[code] || "No se ha podido completar el fichaje. Inténtalo de nuevo.";
}

function getCurrentPosition() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("INVALID_GEOLOCATION"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });
}

function isGeolocationError(value: unknown): value is GeolocationPositionError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code?: unknown }).code === "number"
  );
}

export default function EmployeeClockingPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState<ClockingSelfState | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState<ClockAction | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setState(await requestClockingSelfState());
    } catch (nextError) {
      setError(errorLabel(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canUseQr = Boolean(token && state?.config.enabled && state.config.locationConfigured);
  const actionList = useMemo(() => state?.allowedActions ?? [], [state]);

  async function handleClock(clockAction: ClockAction) {
    if (!token) {
      setError("Escanea el QR actual del restaurante para fichar desde el móvil.");
      return;
    }
    setWorkingAction(clockAction);
    setMessage("");
    setError("");
    try {
      const position = await getCurrentPosition();
      const nextState = await requestQrClock({
        token,
        clockAction,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
      setState(nextState);
      setMessage(`${ACTION_LABELS[clockAction]} registrado correctamente.`);
    } catch (nextError) {
      if (isGeolocationError(nextError)) {
        setError("Necesitamos permiso de ubicación para verificar que estás en el restaurante.");
      } else {
        setError(errorLabel(nextError));
      }
    } finally {
      setWorkingAction(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 md:p-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Personal · Fichaje</p>
        <h1 className="text-2xl font-semibold text-slate-950">Fichar jornada</h1>
        <p className="text-sm text-slate-600">
          Hostly comprueba tu ubicación únicamente cuando pulsas una acción de fichaje.
        </p>
      </header>

      {error ? <HostlyAlert tone="danger">{error}</HostlyAlert> : null}
      {message ? <HostlyAlert tone="success">{message}</HostlyAlert> : null}

      <HostlyCard className="space-y-5 p-5 md:p-6">
        {loading ? (
          <p className="text-sm text-slate-600">Comprobando tu jornada…</p>
        ) : state ? (
          <>
            <div>
              <p className="text-sm text-slate-500">Empleado</p>
              <p className="text-lg font-semibold text-slate-950">{state.displayName}</p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <p className="text-sm font-medium text-sky-950">{STATUS_LABELS[state.status]}</p>
              <p className="mt-1 text-xs text-sky-700">
                {state.config.locationConfigured
                  ? "Ubicación del restaurante configurada"
                  : "Ubicación pendiente de configurar por el restaurante"}
                {state.config.networkConfigured ? " · Red de confianza configurada" : ""}
              </p>
            </div>
            {!token ? (
              <HostlyAlert tone="info">
                Para fichar desde tu móvil, escanea el QR que aparece en el terminal del restaurante.
              </HostlyAlert>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              {actionList.map((clockAction) => (
                <HostlyButton
                  key={clockAction}
                  variant={clockAction === "clock_out" ? "secondary" : "primary"}
                  size="touch"
                  disabled={!canUseQr || workingAction !== null}
                  onClick={() => void handleClock(clockAction)}
                >
                  {workingAction === clockAction ? "Verificando…" : ACTION_LABELS[clockAction]}
                </HostlyButton>
              ))}
            </div>
          </>
        ) : null}
      </HostlyCard>

      <p className="text-xs leading-5 text-slate-500">
        Hostly no realiza seguimiento continuo. Solo guarda la verificación necesaria en el momento de entrada,
        descanso, regreso o salida.
      </p>
    </div>
  );
}
