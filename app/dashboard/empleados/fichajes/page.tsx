"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  HostlyAlert,
  HostlyButton,
  HostlyCard,
  HostlyInput,
  HostlySelect,
} from "@/components/ui/hostly";
import type { ClockAction } from "@/lib/employees/types";
import {
  requestClockingAdminState,
  requestClockingChallenge,
  requestClockingConfigSave,
  requestClockingNetworkCapture,
  requestClockingNetworkClear,
  requestEmployeeClockPin,
  requestTerminalClock,
  type ClockingAdminState,
  type ClockingChallenge,
} from "@/lib/employees/request-secure-clocking";

const ACTION_LABELS: Record<ClockAction, string> = {
  clock_in: "Entrada",
  break_start: "Iniciar descanso",
  break_end: "Terminar descanso",
  clock_out: "Salida",
};

function allowedActions(status: string): ClockAction[] {
  if (status === "not_started") return ["clock_in"];
  if (status === "on_break") return ["break_end", "clock_out"];
  return ["break_start", "clock_out"];
}

function statusLabel(status: string) {
  if (status === "working") return "Trabajando";
  if (status === "on_break") return "En descanso";
  if (status === "completed") return "Jornada finalizada";
  return "Sin entrada";
}

function errorLabel(error: unknown) {
  const code = error instanceof Error ? error.message : "CLOCKING_OPERATION_FAILED";
  const labels: Record<string, string> = {
    USERS_MANAGE_REQUIRED: "No tienes permiso para gestionar el terminal de fichaje.",
    CLOCK_LOCATION_NOT_CONFIGURED: "Configura primero la ubicación del restaurante.",
    NETWORK_IP_UNAVAILABLE: "No hemos podido identificar la red actual.",
    EMPLOYEE_PIN_NOT_CONFIGURED: "Ese empleado todavía no tiene un PIN de fichaje.",
    INVALID_EMPLOYEE_PIN: "PIN incorrecto.",
    EMPLOYEE_PIN_TEMPORARILY_LOCKED: "PIN bloqueado temporalmente tras varios intentos fallidos.",
    TIME_ENTRY_ALREADY_OPEN: "El empleado ya tiene una jornada abierta.",
    TIME_ENTRY_NOT_OPEN: "El empleado no tiene una jornada abierta.",
    BREAK_ALREADY_STARTED: "El descanso ya está iniciado.",
    BREAK_NOT_STARTED: "No hay un descanso iniciado.",
  };
  return labels[code] || "No se ha podido completar la operación.";
}

function currentPosition() {
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

export default function EmployeeClockingTerminalPage() {
  const [state, setState] = useState<ClockingAdminState | null>(null);
  const [challenge, setChallenge] = useState<ClockingChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [pinEmployeeId, setPinEmployeeId] = useState("");
  const [newPin, setNewPin] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("120");
  const [accuracy, setAccuracy] = useState("180");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await requestClockingAdminState();
      setState(next);
      setLatitude(next.config.latitude?.toString() ?? "");
      setLongitude(next.config.longitude?.toString() ?? "");
      setRadius(String(next.config.radiusMeters));
      setAccuracy(String(next.config.maxAccuracyMeters));
      if (!employeeId && next.employees[0]) setEmployeeId(next.employees[0].id);
      if (!pinEmployeeId && next.employees[0]) setPinEmployeeId(next.employees[0].id);
    } catch (nextError) {
      setError(errorLabel(nextError));
    } finally {
      setLoading(false);
    }
  }, [employeeId, pinEmployeeId]);

  const refreshChallenge = useCallback(async () => {
    try {
      setChallenge(await requestClockingChallenge());
    } catch {
      setChallenge(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!state?.config.locationConfigured || !state.config.enabled) return;
    void refreshChallenge();
    const timer = window.setInterval(() => void refreshChallenge(), 20_000);
    return () => window.clearInterval(timer);
  }, [refreshChallenge, state?.config.enabled, state?.config.locationConfigured]);

  const selectedEmployee = useMemo(
    () => state?.employees.find((employee) => employee.id === employeeId) ?? null,
    [employeeId, state],
  );

  async function run(task: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(success);
      await load();
      await refreshChallenge();
    } catch (nextError) {
      setError(errorLabel(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function useCurrentRestaurantLocation() {
    setBusy(true);
    setError("");
    try {
      const position = await currentPosition();
      setLatitude(position.coords.latitude.toFixed(6));
      setLongitude(position.coords.longitude.toFixed(6));
      setMessage("Ubicación detectada. Guarda la configuración para activarla.");
    } catch {
      setError("No se ha podido obtener la ubicación actual. Revisa los permisos del navegador.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !state) {
    return <div className="p-6 text-sm text-slate-600">Cargando terminal de fichaje…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">RRHH · Control horario</p>
          <h1 className="text-2xl font-semibold text-slate-950">Terminal de fichaje</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            QR rotatorio para móvil con geolocalización y fichaje alternativo mediante PIN en este dispositivo.
          </p>
        </div>
        <Link href="/dashboard/empleados/operaciones" className="text-sm font-medium text-sky-700 hover:underline">
          Volver a RRHH operativo
        </Link>
      </header>

      {error ? <HostlyAlert tone="danger">{error}</HostlyAlert> : null}
      {message ? <HostlyAlert tone="success">{message}</HostlyAlert> : null}

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <HostlyCard className="space-y-5 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">QR del restaurante</h2>
            <p className="text-sm text-slate-600">Cambia automáticamente y no sirve fuera de la zona configurada.</p>
          </div>
          <div className="flex min-h-[390px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-4">
            {challenge ? (
              <Image
                src={`/api/employees/clocking/qr?token=${encodeURIComponent(challenge.token)}`}
                width={360}
                height={360}
                priority
                unoptimized
                alt="QR temporal para fichar en Hostly"
                className="h-auto w-full max-w-[360px]"
              />
            ) : (
              <div className="max-w-sm text-center text-sm text-slate-500">
                Configura la ubicación del restaurante para activar el QR de fichaje.
              </div>
            )}
          </div>
          <p className="text-center text-xs text-slate-500">QR renovado cada 30 segundos · se acepta solo una ventana temporal muy corta</p>
        </HostlyCard>

        <HostlyCard className="space-y-5 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Fichar en este terminal</h2>
            <p className="text-sm text-slate-600">Alternativa para quien no tenga móvil, batería o ubicación disponible.</p>
          </div>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            Empleado
            <HostlySelect value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Selecciona empleado</option>
              {state?.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.displayName} · {statusLabel(employee.clockStatus)}
                </option>
              ))}
            </HostlySelect>
          </label>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            PIN personal
            <HostlyInput
              value={pin}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder="4–6 dígitos"
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          {selectedEmployee ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-950">{selectedEmployee.displayName}</span>
                <span className="text-slate-600">{statusLabel(selectedEmployee.clockStatus)}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {selectedEmployee.pinConfigured ? "PIN configurado" : "PIN pendiente de configurar"}
              </p>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {selectedEmployee
              ? allowedActions(selectedEmployee.clockStatus).map((clockAction) => (
                  <HostlyButton
                    key={clockAction}
                    variant={clockAction === "clock_out" ? "secondary" : "primary"}
                    size="touch"
                    disabled={busy || !pin || !selectedEmployee.pinConfigured}
                    onClick={() =>
                      void run(
                        () =>
                          requestTerminalClock({
                            employeeId: selectedEmployee.id,
                            pin,
                            clockAction,
                          }),
                        `${ACTION_LABELS[clockAction]} registrada para ${selectedEmployee.displayName}.`,
                      ).then(() => setPin(""))
                    }
                  >
                    {ACTION_LABELS[clockAction]}
                  </HostlyButton>
                ))
              : null}
          </div>
        </HostlyCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <HostlyCard className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Seguridad por ubicación y red</h2>
            <p className="text-sm text-slate-600">
              El móvil debe estar dentro del radio. La red actual se usa como señal adicional, nunca como único bloqueo.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">Latitud<HostlyInput value={latitude} onChange={(event) => setLatitude(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700">Longitud<HostlyInput value={longitude} onChange={(event) => setLongitude(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700">Radio permitido (m)<HostlyInput type="number" min={30} max={500} value={radius} onChange={(event) => setRadius(event.target.value)} /></label>
            <label className="space-y-1 text-sm font-medium text-slate-700">Precisión máxima GPS (m)<HostlyInput type="number" min={30} max={500} value={accuracy} onChange={(event) => setAccuracy(event.target.value)} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <HostlyButton variant="secondary" disabled={busy} onClick={() => void useCurrentRestaurantLocation()}>
              Usar ubicación actual
            </HostlyButton>
            <HostlyButton
              variant="primary"
              disabled={busy || !latitude || !longitude}
              onClick={() =>
                void run(
                  () =>
                    requestClockingConfigSave({
                      latitude: Number(latitude),
                      longitude: Number(longitude),
                      radiusMeters: Number(radius),
                      maxAccuracyMeters: Number(accuracy),
                      enabled: true,
                    }),
                  "Configuración de fichaje guardada.",
                )
              }
            >
              Guardar configuración
            </HostlyButton>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-950">Red del restaurante</p>
            <p className="mt-1 text-xs text-slate-500">
              {state?.config.networkConfigured
                ? "Hay una red de confianza registrada. Hostly guarda solo su hash."
                : "No hay red de confianza registrada todavía."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <HostlyButton variant="secondary" disabled={busy} onClick={() => void run(requestClockingNetworkCapture, "Red actual registrada como señal de confianza.")}>Registrar red actual</HostlyButton>
              {state?.config.networkConfigured ? (
                <HostlyButton variant="ghost" disabled={busy} onClick={() => void run(requestClockingNetworkClear, "Red de confianza eliminada.")}>Eliminar red</HostlyButton>
              ) : null}
            </div>
          </div>
        </HostlyCard>

        <HostlyCard className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">PIN de empleados</h2>
            <p className="text-sm text-slate-600">El PIN nunca se guarda en texto plano y se bloquea temporalmente tras cinco intentos fallidos.</p>
          </div>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            Empleado
            <HostlySelect value={pinEmployeeId} onChange={(event) => setPinEmployeeId(event.target.value)}>
              <option value="">Selecciona empleado</option>
              {state?.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.displayName}</option>
              ))}
            </HostlySelect>
          </label>
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            Nuevo PIN
            <HostlyInput
              value={newPin}
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              placeholder="4–6 dígitos"
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
          <HostlyButton
            variant="primary"
            disabled={busy || !pinEmployeeId || newPin.length < 4}
            onClick={() =>
              void run(
                () => requestEmployeeClockPin(pinEmployeeId, newPin),
                "PIN actualizado correctamente.",
              ).then(() => setNewPin(""))
            }
          >
            Guardar PIN
          </HostlyButton>
        </HostlyCard>
      </div>
    </div>
  );
}
