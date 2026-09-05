"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { HostlyButton } from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  requestManagedRestaurantUsers,
  requestManagedUserUpdate,
} from "@/lib/users/request-manage-users";
import ModulePageShell from "@/components/module-page-shell";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { normalizeAuthorizationRole } from "@/lib/auth/profile-authorization-policy";
import type { ManagedAssignableRole } from "@/lib/server/users/manage-restaurant-users";

type UserRow = {
  id: string;
  email?: string;
  nombre?: string;
  displayName?: string;
  role?: string | null;
  restaurantId?: string | null;
  status?: "active" | "legacy_active" | "disabled" | "review_required";
  reviewRequired?: boolean;
};

function displayNombre(row: UserRow): string {
  const n =
    (typeof row.displayName === "string" && row.displayName.trim()) ||
    (typeof row.nombre === "string" && row.nombre.trim());
  if (n) return n;
  const em = typeof row.email === "string" ? row.email.trim() : "";
  if (em.includes("@")) return em.split("@")[0] ?? "—";
  return em || "—";
}

function managedRoleValue(role: unknown): ManagedAssignableRole | "owner" | "" {
  return normalizeAuthorizationRole(role) ?? "";
}

function isManagedOwner(role: unknown): boolean {
  return managedRoleValue(role) === "owner";
}

function isManagedAdmin(role: unknown): boolean {
  return managedRoleValue(role) === "admin";
}

function userFacingError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export default function EmpleadosPageContent({
  embedInConfig = false,
}: {
  embedInConfig?: boolean;
}) {
  const { user, restaurantId, ready: authReady } = useAuth();
  const { can, role: actorRole } = useHostlyCapabilities();
  const canManageUsers = can("users.manage");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured || !restaurantId || !canManageUsers) {
      setRows([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const list = await requestManagedRestaurantUsers();
      setRows(list as UserRow[]);
    } catch (error) {
      console.error(error);
      setLoadError(
        userFacingError(
          error,
          "No se pudo cargar el equipo. Comprueba la conexión y vuelve a intentarlo.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [restaurantId, canManageUsers]);

  useEffect(() => {
    if (!authReady) return;
    void load();
  }, [authReady, load]);

  const shellTitle = embedInConfig ? undefined : "Empleados";
  const shellSubtitle = embedInConfig ? undefined : "Gestión de usuarios";
  const shellProps = {
    title: shellTitle,
    subtitle: shellSubtitle,
    maxWidth: 1180,
    compactLayout: true,
    operationalFocus: true,
    denseWorkbench: true,
    hideBackLink: embedInConfig,
    hideLogoutButton: embedInConfig,
    hideLanguageSwitcher: embedInConfig,
    shellSurface: embedInConfig ? ("configLight" as const) : ("default" as const),
    lockViewport: embedInConfig,
    lockViewportFillParent: embedInConfig,
  };

  if (!authReady) {
    return (
      <ModulePageShell {...shellProps}>
        <div className="hostly-employees-state">Cargando empleados…</div>
      </ModulePageShell>
    );
  }

  if (!canManageUsers) {
    return (
      <ModulePageShell {...shellProps}>
        <div className="hostly-employees-state">No tienes permiso para ver esta página.</div>
      </ModulePageShell>
    );
  }

  const onRemove = async (userId: string) => {
    if (!restaurantId) return;
    setRemovingId(userId);
    setActionError(null);
    try {
      const row = rows.find((candidate) => candidate.id === userId);
      await requestManagedUserUpdate({
        userId,
        status: row?.status === "disabled" ? "active" : "disabled",
      });
      await load();
    } catch (error) {
      console.error(error);
      setActionError(
        userFacingError(
          error,
          "No se pudo actualizar el acceso del empleado. Vuelve a intentarlo.",
        ),
      );
    } finally {
      setRemovingId(null);
    }
  };

  const onRoleChange = async (row: UserRow, newRole: ManagedAssignableRole) => {
    setUpdatingRoleId(row.id);
    setActionError(null);
    try {
      await requestManagedUserUpdate({
        userId: row.id,
        role: newRole,
      });
      await load();
    } catch (error) {
      console.error(error);
      setActionError(
        userFacingError(
          error,
          "No se pudo cambiar el rol. El empleado conserva el rol anterior.",
        ),
      );
    } finally {
      setUpdatingRoleId(null);
    }
  };

  return (
    <ModulePageShell {...shellProps}>
      <section className="hostly-employees-page" aria-label="Gestión de empleados">
        <header className="hostly-employees-toolbar">
          <div className="min-w-0">
            <p className="hostly-employees-eyebrow">Equipo</p>
            <h2 className="hostly-employees-title">Empleados y accesos</h2>
            <p className="hostly-employees-subtitle">
              Gestiona el rol y el acceso de cada persona sin salir de esta pantalla.
            </p>
          </div>
          <div className="hostly-employees-toolbar-actions">
            <span
              className="hostly-employees-count"
              aria-label={`${rows.length} ${rows.length === 1 ? "empleado" : "empleados"}`}
            >
              {rows.length}
            </span>
            <Link
              href="/dashboard/invitaciones"
              className="hostly-button-primary hostly-button-compact hostly-employees-invite-link"
            >
              <span aria-hidden>＋</span>
              Invitar empleado
            </Link>
          </div>
        </header>

        {actionError ? (
          <div className="hostly-employees-state hostly-employees-state--warning" role="alert">
            <strong>No se pudo completar el cambio</strong>
            <span>{actionError}</span>
            <HostlyButton variant="secondary" size="compact" onClick={() => setActionError(null)}>
              Cerrar aviso
            </HostlyButton>
          </div>
        ) : null}

        {!isFirebaseConfigured ? (
          <div className="hostly-employees-state hostly-employees-state--warning">
            Falta configuración de Firebase.
          </div>
        ) : !restaurantId ? (
          <div className="hostly-employees-state hostly-employees-state--warning">
            No se pudo obtener el restaurante.
          </div>
        ) : loading ? (
          <div className="hostly-employees-state">Cargando empleados…</div>
        ) : loadError ? (
          <div className="hostly-employees-state hostly-employees-state--warning" role="alert">
            <strong>No se pudo cargar el equipo</strong>
            <span>{loadError}</span>
            <HostlyButton variant="secondary" size="compact" onClick={() => void load()}>
              Reintentar
            </HostlyButton>
          </div>
        ) : rows.length === 0 ? (
          <div className="hostly-employees-state hostly-employees-state--empty">
            <strong>Tu equipo todavía está vacío</strong>
            <span>Invita a la primera persona y asígnale su rol antes de empezar.</span>
            <Link
              href="/dashboard/invitaciones"
              className="hostly-button-primary hostly-button-compact"
            >
              Invitar empleado
            </Link>
          </div>
        ) : (
          <div className="hostly-employees-list-shell">
            <div className="hostly-employees-list-head" aria-hidden>
              <span>Persona</span>
              <span>Email</span>
              <span>Rol</span>
              <span>Acceso</span>
            </div>
            <div className="hostly-employees-list">
              {rows.map((row) => {
                const isSelf = row.id === user?.uid;
                const owner = isManagedOwner(row.role);
                const protectedAdmin = isManagedAdmin(row.role) && actorRole !== "owner";
                const locked = isSelf || owner || protectedAdmin || Boolean(row.reviewRequired);
                const actionBusy = removingId === row.id;
                const roleBusy = updatingRoleId === row.id;
                const enabling = row.status === "disabled";
                return (
                  <article className="hostly-employees-row" key={row.id}>
                    <div className="hostly-employees-person">
                      <span className="hostly-employees-avatar" aria-hidden>
                        {displayNombre(row).slice(0, 1).toUpperCase() || "E"}
                      </span>
                      <div className="min-w-0">
                        <strong className="hostly-employees-name">{displayNombre(row)}</strong>
                        <div className="hostly-employees-mobile-email">
                          {typeof row.email === "string" ? row.email : "—"}
                        </div>
                        <div className="hostly-employees-badges">
                          {isSelf ? <span className="hostly-employees-badge">Tú</span> : null}
                          {row.status === "disabled" ? (
                            <span className="hostly-employees-badge hostly-employees-badge--muted">Desactivado</span>
                          ) : null}
                          {row.reviewRequired ? (
                            <span className="hostly-employees-badge hostly-employees-badge--warning">Revisión</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="hostly-employees-email">
                      {typeof row.email === "string" ? row.email : "—"}
                    </div>

                    <label className="hostly-employees-role-field">
                      <span className="hostly-employees-mobile-label">Rol</span>
                      <select
                        value={managedRoleValue(row.role)}
                        disabled={locked || roleBusy}
                        onChange={(event) => {
                          const newRole = event.target.value as ManagedAssignableRole;
                          void onRoleChange(row, newRole);
                        }}
                        className="hostly-employees-role-select"
                        aria-label={`Rol de ${displayNombre(row)}`}
                      >
                        {owner ? <option value="owner">Owner</option> : null}
                        {row.reviewRequired ? <option value="">Revisión necesaria</option> : null}
                        <option value="admin" disabled={actorRole !== "owner"}>
                          Administrador
                        </option>
                        <option value="manager">Encargado</option>
                        <option value="waiter">Operativo / Camarero</option>
                        <option value="kitchen">Cocina</option>
                        <option value="viewer">Solo lectura</option>
                      </select>
                    </label>

                    <div className="hostly-employees-action-cell">
                      <span className="hostly-employees-mobile-label">Acceso</span>
                      <HostlyButton
                        variant={enabling ? "secondary" : "destructive"}
                        size="compact"
                        disabled={actionBusy || roleBusy || locked}
                        onClick={() => void onRemove(row.id)}
                        className="hostly-employees-access-btn"
                        data-state={enabling ? "enable" : "disable"}
                      >
                        {row.reviewRequired
                          ? "Revisión necesaria"
                          : actionBusy
                            ? "Guardando…"
                            : enabling
                              ? "Activar"
                              : "Desactivar"}
                      </HostlyButton>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </ModulePageShell>
  );
}
