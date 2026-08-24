"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { requestCreateStaffInvite } from "@/lib/staff-invites/request-create-staff-invite";
import {
  requestPendingStaffInvites,
  requestRevokeStaffInvite,
  type ManagedStaffInvite,
} from "@/lib/staff-invites/request-manage-staff-invites";

export type StaffInvitePanelProps = {
  restaurantName?: string | null;
  actorRole?: string | null;
};

type InviteRole = "admin" | "encargado" | "operativo";

function formatExpiry(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

export default function StaffInvitePanel({
  restaurantName,
  actorRole,
}: StaffInvitePanelProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<InviteRole>("operativo");
  const [pending, setPending] = useState<ManagedStaffInvite[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canInviteAdmin = actorRole === "owner";

  const refreshPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      setPending(await requestPendingStaffInvites());
    } catch (e) {
      console.error("[employees] load pending invites", e);
      setPending([]);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (!canInviteAdmin && role === "admin") setRole("encargado");
  }, [canInviteAdmin, role]);

  const pendingCount = pending.length;
  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = normalizedEmail.includes("@") && !creating;

  const createInvite = useCallback(async () => {
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    setNotice(null);
    setLastInviteUrl(null);
    try {
      const result = await requestCreateStaffInvite({
        email: normalizedEmail,
        displayName: displayName.trim() || undefined,
        role,
        restaurantName: restaurantName?.trim() || undefined,
      });
      if (!result.ok) {
        const message =
          result.error === "INVITE_ALREADY_PENDING"
            ? "Ya existe una invitación pendiente para ese email."
            : result.error === "INVITE_ROLE_ASSIGNMENT_FORBIDDEN"
              ? "Solo el propietario puede invitar administradores."
              : result.details || "No se pudo crear la invitación.";
        setError(message);
        return;
      }
      setLastInviteUrl(result.invite.inviteUrl);
      setNotice("Invitación creada. Copia el enlace y compártelo con el empleado.");
      setEmail("");
      setDisplayName("");
      setRole("operativo");
      await refreshPending();
    } catch (e) {
      console.error("[employees] create invite", e);
      setError("No se pudo crear la invitación. Comprueba conexión y permisos.");
    } finally {
      setCreating(false);
    }
  }, [canSubmit, displayName, normalizedEmail, refreshPending, restaurantName, role]);

  const copyLink = useCallback(async () => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setNotice("Enlace copiado.");
    } catch {
      setError("No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.");
    }
  }, [lastInviteUrl]);

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      setRevokingId(inviteId);
      setError(null);
      try {
        await requestRevokeStaffInvite(inviteId);
        await refreshPending();
        setNotice("Invitación revocada.");
      } catch (e) {
        console.error("[employees] revoke invite", e);
        setError("No se pudo revocar la invitación.");
      } finally {
        setRevokingId(null);
      }
    },
    [refreshPending],
  );

  const pendingSummary = useMemo(
    () =>
      pendingCount === 1
        ? "1 invitación pendiente"
        : `${pendingCount} invitaciones pendientes`,
    [pendingCount],
  );

  return (
    <section className="rounded-[14px] border border-slate-200 bg-white" aria-label="Invitaciones de empleados">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-sm font-semibold text-slate-950">Acceso del equipo</h2>
            {pendingCount > 0 ? (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                {pendingSummary}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Invita por enlace seguro. El envío automático por email se activará cuando se conecte el proveedor de correo.
          </p>
        </div>
        <button
          type="button"
          className="min-h-[42px] shrink-0 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? "Cerrar" : "Invitar empleado"}
        </button>
      </div>

      {open ? (
        <div className="border-t border-slate-100 p-3.5 sm:p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_180px_auto] lg:items-end">
            <label className="min-w-0 text-xs font-medium text-slate-700">
              Email
              <input
                type="email"
                autoComplete="email"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="empleado@restaurante.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="min-w-0 text-xs font-medium text-slate-700">
              Nombre (opcional)
              <input
                type="text"
                autoComplete="name"
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                placeholder="Nombre y apellido"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
            <label className="min-w-0 text-xs font-medium text-slate-700">
              Rol
              <select
                className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none"
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
              >
                <option value="operativo">Operativo</option>
                <option value="encargado">Encargado</option>
                {canInviteAdmin ? <option value="admin">Administrador</option> : null}
              </select>
            </label>
            <button
              type="button"
              className="min-h-[44px] rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!canSubmit}
              onClick={() => void createInvite()}
            >
              {creating ? "Creando…" : "Crear invitación"}
            </button>
          </div>

          {lastInviteUrl ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
              <p className="m-0 text-xs font-semibold text-emerald-900">Enlace listo</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  readOnly
                  value={lastInviteUrl}
                  aria-label="Enlace de invitación"
                  className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 text-xs text-slate-700"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  className="min-h-[40px] rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-900"
                  onClick={() => void copyLink()}
                >
                  Copiar enlace
                </button>
              </div>
            </div>
          ) : null}

          {notice ? <p className="mb-0 mt-3 text-xs font-medium text-emerald-800">{notice}</p> : null}
          {error ? <p className="mb-0 mt-3 text-xs font-medium text-red-700">{error}</p> : null}

          <div className="mt-4 border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="m-0 text-xs font-semibold uppercase tracking-[0.04em] text-slate-600">Pendientes</h3>
              <button
                type="button"
                className="min-h-[36px] rounded-lg px-2 text-xs font-medium text-sky-700 hover:bg-sky-50"
                onClick={() => void refreshPending()}
              >
                Actualizar
              </button>
            </div>
            {loadingPending ? (
              <p className="m-0 text-xs text-slate-500">Cargando invitaciones…</p>
            ) : pending.length === 0 ? (
              <p className="m-0 text-xs text-slate-500">No hay invitaciones pendientes.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {pending.map((invite) => (
                  <article key={invite.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-xs font-semibold text-slate-900">
                        {invite.displayName || invite.email}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{invite.email}</p>
                      <p className="mt-1 text-[10px] font-medium text-slate-500">
                        {invite.role === "admin" ? "Administrador" : "Equipo"}
                        {formatExpiry(invite.expiresAt) ? ` · caduca ${formatExpiry(invite.expiresAt)}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="min-h-[38px] shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      disabled={revokingId === invite.id}
                      onClick={() => void revokeInvite(invite.id)}
                    >
                      {revokingId === invite.id ? "…" : "Revocar"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
