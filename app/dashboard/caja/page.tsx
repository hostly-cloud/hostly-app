"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  HostlyAlert,
  HostlyButton,
  HostlyCard,
  HostlyInput,
  HostlySelect,
  HostlyTextarea,
} from "@/components/ui/hostly";
import type { CashSessionView, CashWorkspaceSnapshot } from "@/lib/cash/types";
import {
  requestBlindCount,
  requestCashMovement,
  requestCashWorkspace,
  requestCloseCashSession,
  requestOpenCashSession,
  requestReopenCashCount,
} from "@/lib/cash/request-cash";

function eur(value: number | null | undefined) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value ?? 0);
}

function dateTime(ms: number | null | undefined) {
  if (!ms) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : "CASH_OPERATION_FAILED";
  const labels: Record<string, string> = {
    UNAUTHORIZED: "Inicia sesión para acceder a Caja.",
    CASH_REGISTER_ACCESS_REQUIRED: "No tienes permiso para acceder a Caja.",
    CASH_REGISTER_OPERATE_REQUIRED: "No tienes permiso para operar la caja.",
    CASH_REGISTER_SUPERVISE_REQUIRED: "Solo un responsable puede realizar esta acción.",
    CASH_SESSION_ALREADY_OPEN: "Ya hay una caja abierta.",
    CASH_SESSION_NOT_OPEN: "La caja ya no está abierta para movimientos.",
    CASH_SESSION_NOT_COUNTED: "Primero hay que realizar el arqueo ciego.",
    INVALID_OPENING_FLOAT: "El fondo inicial no es válido.",
    INVALID_CASH_MOVEMENT_AMOUNT: "El importe del movimiento no es válido.",
    CASH_MOVEMENT_REASON_REQUIRED: "Indica el motivo del movimiento de efectivo.",
    INVALID_COUNTED_CASH: "El efectivo contado no es válido.",
    DISCREPANCY_REASON_REQUIRED: "Hay un descuadre. Indica el motivo antes de cerrar.",
    REOPEN_REASON_REQUIRED: "Indica por qué se vuelve a abrir el arqueo.",
  };
  return labels[code] || "No se ha podido completar la operación de caja.";
}

function Totals({ session }: { session: CashSessionView }) {
  const totals = session.totals;
  if (!session.canSeeExpected || !totals) {
    return (
      <HostlyAlert tone="info">
        Arqueo ciego activo: el efectivo esperado permanece oculto hasta que un responsable revise el cierre.
      </HostlyAlert>
    );
  }
  const cards = [
    ["Ventas", totals.grossSales],
    ["Efectivo", totals.cashSales],
    ["Tarjeta", totals.cardSales],
    ["Vales", totals.voucherSales],
    ["Devoluciones", -totals.refunds],
    ["Efectivo esperado", totals.expectedCash],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{eur(value)}</p>
        </div>
      ))}
    </div>
  );
}

export default function CajaPage() {
  const [snapshot, setSnapshot] = useState<CashWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [openingFloat, setOpeningFloat] = useState("100");
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out">("cash_out");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await requestCashWorkspace());
    } catch (nextError) {
      setError(errorText(nextError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const active = snapshot?.activeSession ?? null;
  const differenceTone = useMemo(() => {
    if (!active || active.difference == null) return "neutral" as const;
    return Math.abs(active.difference) <= 0.01 ? "success" as const : "warning" as const;
  }, [active]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await load();
    } catch (nextError) {
      setError(errorText(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Operación · Caja</p>
          <h1 className="text-2xl font-semibold text-slate-950">Caja, turnos y arqueos</h1>
          <p className="mt-1 text-sm text-slate-600">
            Apertura, efectivo, ventas reales del TPV, arqueo ciego y cierre supervisado.
          </p>
        </div>
        <Link href="/dashboard/operacion" className="hostly-button-secondary hostly-button-compact">
          Volver a Operación
        </Link>
      </header>

      {error ? <HostlyAlert tone="danger">{error}</HostlyAlert> : null}
      {message ? <HostlyAlert tone="success">{message}</HostlyAlert> : null}

      {loading ? (
        <HostlyCard className="p-6 text-sm text-slate-600">Cargando caja…</HostlyCard>
      ) : !snapshot ? null : !active ? (
        <HostlyCard className="max-w-xl space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Abrir caja</h2>
            <p className="text-sm text-slate-600">Introduce el efectivo con el que empieza el servicio.</p>
          </div>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            Fondo inicial (€)
            <HostlyInput
              inputMode="decimal"
              value={openingFloat}
              onChange={(event) => setOpeningFloat(event.target.value)}
            />
          </label>
          <HostlyButton
            variant="primary"
            size="touch"
            disabled={busy || !snapshot.canOperate}
            onClick={() => void run(() => requestOpenCashSession(Number(openingFloat)), "Caja abierta correctamente.")}
          >
            Abrir caja
          </HostlyButton>
        </HostlyCard>
      ) : (
        <>
          <HostlyCard className="space-y-4 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm text-slate-500">{active.registerName}</p>
                <h2 className="text-xl font-semibold text-slate-950">
                  {active.status === "open" ? "Caja abierta" : active.status === "counted" ? "Arqueo enviado" : "Caja cerrada"}
                </h2>
                <p className="text-sm text-slate-600">
                  Abierta {dateTime(active.openedAtMs)} · Fondo {eur(active.openingFloat)}
                </p>
              </div>
              <HostlyButton variant="secondary" size="compact" disabled={busy} onClick={() => void load()}>
                Actualizar
              </HostlyButton>
            </div>
            <Totals session={active} />
            {active.countedCash != null ? (
              <HostlyAlert tone={differenceTone}>
                Efectivo contado: <strong>{eur(active.countedCash)}</strong>
                {active.canSeeExpected && active.difference != null
                  ? ` · Diferencia ${eur(active.difference)}`
                  : " · Pendiente de revisión por responsable"}
              </HostlyAlert>
            ) : null}
          </HostlyCard>

          {active.status === "open" ? (
            <div className="grid gap-5 lg:grid-cols-2">
              <HostlyCard className="space-y-4 p-5">
                <div>
                  <h3 className="font-semibold text-slate-950">Movimiento de efectivo</h3>
                  <p className="text-sm text-slate-600">Retiradas, cambio añadido, pagos menores u otros ajustes físicos.</p>
                </div>
                <HostlySelect value={movementType} onChange={(event) => setMovementType(event.target.value as "cash_in" | "cash_out")}>
                  <option value="cash_out">Salida de efectivo</option>
                  <option value="cash_in">Entrada de efectivo</option>
                </HostlySelect>
                <HostlyInput
                  inputMode="decimal"
                  placeholder="Importe €"
                  value={movementAmount}
                  onChange={(event) => setMovementAmount(event.target.value)}
                />
                <HostlyTextarea
                  placeholder="Motivo obligatorio"
                  value={movementReason}
                  onChange={(event) => setMovementReason(event.target.value)}
                />
                <HostlyButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        requestCashMovement({
                          sessionId: active.id,
                          type: movementType,
                          amount: Number(movementAmount),
                          reason: movementReason,
                        }),
                      "Movimiento registrado.",
                    ).then(() => {
                      setMovementAmount("");
                      setMovementReason("");
                    })
                  }
                >
                  Registrar movimiento
                </HostlyButton>
              </HostlyCard>

              <HostlyCard className="space-y-4 p-5">
                <div>
                  <h3 className="font-semibold text-slate-950">Arqueo ciego</h3>
                  <p className="text-sm text-slate-600">
                    Cuenta el efectivo físico sin ver cuánto espera Hostly. Después un responsable revisará el resultado.
                  </p>
                </div>
                <HostlyInput
                  inputMode="decimal"
                  placeholder="Efectivo contado €"
                  value={countedCash}
                  onChange={(event) => setCountedCash(event.target.value)}
                />
                <HostlyButton
                  variant="primary"
                  size="touch"
                  disabled={busy}
                  onClick={() => void run(() => requestBlindCount(active.id, Number(countedCash)), "Arqueo registrado para revisión.")}
                >
                  Enviar arqueo
                </HostlyButton>
              </HostlyCard>
            </div>
          ) : null}

          {active.status === "counted" && snapshot.canSupervise ? (
            <HostlyCard className="space-y-4 p-5">
              <div>
                <h3 className="font-semibold text-slate-950">Revisión del responsable</h3>
                <p className="text-sm text-slate-600">
                  Revisa contado frente a esperado. Si existe diferencia, Hostly exige una explicación antes de cerrar.
                </p>
              </div>
              <HostlyTextarea
                placeholder="Motivo del descuadre, si lo hay"
                value={closeReason}
                onChange={(event) => setCloseReason(event.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <HostlyButton
                  variant="primary"
                  disabled={busy}
                  onClick={() => void run(() => requestCloseCashSession(active.id, closeReason), "Caja cerrada y arqueo consolidado.")}
                >
                  Cerrar caja
                </HostlyButton>
                <HostlyInput
                  className="min-w-[240px] flex-1"
                  placeholder="Motivo para repetir arqueo"
                  value={reopenReason}
                  onChange={(event) => setReopenReason(event.target.value)}
                />
                <HostlyButton
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void run(() => requestReopenCashCount(active.id, reopenReason), "Arqueo reabierto.")}
                >
                  Repetir arqueo
                </HostlyButton>
              </div>
            </HostlyCard>
          ) : null}

          <HostlyCard className="p-5">
            <h3 className="font-semibold text-slate-950">Movimientos del turno</h3>
            <div className="mt-3 space-y-2">
              {active.movements.length ? (
                active.movements.map((movement) => (
                  <div key={movement.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{movement.type === "cash_in" ? "Entrada" : "Salida"} · {movement.reason}</p>
                      <p className="text-xs text-slate-500">{dateTime(movement.createdAtMs)}{movement.createdByEmail ? ` · ${movement.createdByEmail}` : ""}</p>
                    </div>
                    <strong className={movement.type === "cash_in" ? "text-emerald-700" : "text-rose-700"}>
                      {movement.type === "cash_in" ? "+" : "−"}{eur(movement.amount)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Sin movimientos manuales en este turno.</p>
              )}
            </div>
          </HostlyCard>
        </>
      )}

      {snapshot?.history.length ? (
        <HostlyCard className="p-5">
          <h2 className="text-lg font-semibold text-slate-950">Historial de cierres</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-4">Apertura</th>
                  <th className="pb-2 pr-4">Cierre</th>
                  <th className="pb-2 pr-4">Operador</th>
                  <th className="pb-2 pr-4">Ventas</th>
                  <th className="pb-2 pr-4">Esperado</th>
                  <th className="pb-2">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.history.map((session) => (
                  <tr key={session.id} className="border-t border-slate-100">
                    <td className="py-3 pr-4">{dateTime(session.openedAtMs)}</td>
                    <td className="py-3 pr-4">{dateTime(session.closedAtMs)}</td>
                    <td className="py-3 pr-4">{session.operatorEmail || "—"}</td>
                    <td className="py-3 pr-4">{eur(session.totals?.grossSales)}</td>
                    <td className="py-3 pr-4">{eur(session.totals?.expectedCash)}</td>
                    <td className="py-3 font-semibold">{eur(session.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HostlyCard>
      ) : null}
    </div>
  );
}
