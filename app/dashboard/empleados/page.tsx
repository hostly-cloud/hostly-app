"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
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

function employeeStatusLabel(row: UserRow): string {
  if (row.reviewRequired) return "Revisión necesaria";
  if (row.status === "disabled") return "Inactivo";
  return "Activo";
}

const empleadosResponsiveStyles = `
.hostly-employees-state {
  padding: 14px 16px;
  border: 1px solid var(--hostly-line);
  border-radius: var(--hostly-radius-md);
  background: rgba(255,255,255,.9);
  color: var(--hostly-ink-muted);
  font-size: 13px;
  line-height: 1.4;
}

.hostly-employees-surface {
  overflow: hidden;
  border: 1px solid var(--hostly-line);
  border-radius: var(--hostly-radius-md);
  background: rgba(255,255,255,.94);
  box-shadow: var(--hostly-shadow-card);
}

.hostly-employees-table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.hostly-employees-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--hostly-ink);
}

.hostly-employees-table th {
  padding: 9px 12px;
  border-bottom: 1px solid var(--hostly-table-divider);
  background: var(--hostly-table-head-surface);
  color: var(--hostly-ink-muted);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .045em;
  text-align: left;
  text-transform: uppercase;
}

.hostly-employees-table td {
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--hostly-table-divider-soft);
  vertical-align: middle;
  font-size: 12.5px;
}

.hostly-employees-table tbody tr:last-child td {
  border-bottom: 0;
}

.hostly-employees-table__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hostly-ink-strong);
  font-weight: 730;
}

.hostly-employees-table__email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--hostly-ink-muted);
}

.hostly-employees-role-select {
  width: 100%;
  min-height: 40px;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--hostly-line-strong);
  border-radius: 9px;
  background: #fff;
  color: var(--hostly-ink);
  font-size: 12px;
}

.hostly-employees-action {
  min-height: 40px;
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--hostly-line-strong);
  border-radius: 9px;
  background: #fff;
  color: var(--hostly-ink);
  font-size: 11px;
  font-weight: 700;
  white-space: normal;
  line-height: 1.15;
  cursor: pointer;
}

.hostly-employees-action:disabled,
.hostly-employees-role-select:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.hostly-employees-mobile-list {
  display: none;
}

@media (max-width: 767px) {
  .hostly-employees-table-wrap {
    display: none;
  }

  .hostly-employees-surface {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .hostly-employees-mobile-list {
    display: grid;
    gap: 6px;
  }

  .hostly-employees-card {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 10px;
    border: 1px solid rgba(148,163,184,.16);
    border-radius: 11px;
    background: #fff;
    box-shadow: none;
  }

  .hostly-employees-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .hostly-employees-card__identity {
    min-width: 0;
    flex: 1 1 auto;
  }

  .hostly-employees-card__name {
    overflow-wrap: anywhere;
    color: var(--hostly-ink-strong);
    font-size: 13px;
    font-weight: 760;
    line-height: 1.15;
  }

  .hostly-employees-card__email {
    margin-top: 2px;
    overflow-wrap: anywhere;
    color: var(--hostly-ink-muted);
    font-size: 10px;
    line-height: 1.25;
  }

  .hostly-employees-card__status {
    flex: 0 0 auto;
    padding: 3px 6px;
    border: 1px solid var(--hostly-line);
    border-radius: 999px;
    background: var(--hostly-surface-page-soft);
    color: var(--hostly-ink-muted);
    font-size: 9px;
    font-weight: 700;
    line-height: 1.1;
    white-space: nowrap;
  }

  .hostly-employees-card__controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(96px, auto);
    gap: 6px;
    align-items: stretch;
  }

  .hostly-employees-role-select,
  .hostly-employees-action {
    min-height: 44px;
    border-radius: 10px;
    font-size: 11px;
  }

  .hostly-employees-action {
    min-width: 0;
    padding-inline: 8px;
  }

  .hostly-employees-state {
    padding: 12px;
    border-radius: 10px;
    font-size: 11px;
  }
}

@media (max-width: 380px) {
  .hostly-employees-card__controls {
    grid-template-columns: 1fr;
  }
}
`;

export default function EmpleadosPage({
  embedInConfig = false,
}: {
  embedInConfig?: boolean;
}) {
  const { user, restaurantId, ready: authReady } = useAuth();
  const { can, role: actorRole } = useHostlyCapabilities();
  const canManageUsers = can("users.manage");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured || !restaurantId || !canManageUsers) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await requestManagedRestaurantUsers();
      setRows(list as UserRow[]);
    } catch (e) {
      console.error(e);
      setRows([]);
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
    hideBackLink: embedInConfig,
    hideLogoutButton: embedInConfig,
    hideLanguageSwitcher: embedInConfig,
    shellSurface: embedInConfig ? ("configLight" as const) : ("default" as const),
  };

  if (!authReady) {
    return (
      <ModulePageShell {...shellProps}>
        <style>{empleadosResponsiveStyles}</style>
        <div className="hostly-employees-state" role="status">Cargando empleados…</div>
      </ModulePageShell>
    );
  }

  if (!canManageUsers) {
    return (
      <ModulePageShell {...shellProps}>
        <style>{empleadosResponsiveStyles}</style>
        <div className="hostly-employees-state">No tienes permiso para ver esta página.</div>
      </ModulePageShell>
    );
  }

  const onRemove = async (userId: string) => {
    if (!restaurantId) return;
    setRemovingId(userId);
    try {
      const row = rows.find((candidate) => candidate.id === userId);
      await requestManagedUserUpdate({
        userId,
        status: row?.status === "disabled" ? "active" : "disabled",
      });
      const list = await requestManagedRestaurantUsers();
      setRows(list as UserRow[]);
    } catch (e) {
      console.error(e);
    } finally {
      setRemovingId(null);
    }
  };

  const rowDisabled = (row: UserRow) =>
    removingId === row.id ||
    row.id === user?.uid ||
    isManagedOwner(row.role) ||
    (isManagedAdmin(row.role) && actorRole !== "owner") ||
    Boolean(row.reviewRequired);

  const roleDisabled = (row: UserRow) =>
    row.id === user?.uid ||
    isManagedOwner(row.role) ||
    (isManagedAdmin(row.role) && actorRole !== "owner") ||
    Boolean(row.reviewRequired);

  const renderRoleSelect = (row: UserRow) => (
    <select
      className="hostly-employees-role-select"
      value={managedRoleValue(row.role)}
      disabled={roleDisabled(row)}
      aria-label={`Rol de ${displayNombre(row)}`}
      onChange={(e) => {
        void (async () => {
          const newRole = e.target.value as ManagedAssignableRole;
          await requestManagedUserUpdate({ userId: row.id, role: newRole });
          await load();
        })();
      }}
    >
      {isManagedOwner(row.role) ? <option value="owner">Owner</option> : null}
      {row.reviewRequired ? <option value="">Revisión necesaria</option> : null}
      <option value="admin" disabled={actorRole !== "owner"}>Administrador</option>
      <option value="manager">Encargado</option>
      <option value="waiter">Operativo / Camarero</option>
      <option value="kitchen">Cocina</option>
      <option value="viewer">Solo lectura</option>
    </select>
  );

  const renderAction = (row: UserRow) => (
    <button
      type="button"
      className="hostly-employees-action"
      disabled={rowDisabled(row)}
      onClick={() => void onRemove(row.id)}
    >
      {row.reviewRequired
        ? "Revisión necesaria"
        : row.status === "disabled"
          ? "Activar"
          : "Desactivar"}
    </button>
  );

  return (
    <ModulePageShell {...shellProps}>
      <style>{empleadosResponsiveStyles}</style>

      {!isFirebaseConfigured ? (
        <div className="hostly-employees-state">Falta configuración de Firebase.</div>
      ) : !restaurantId ? (
        <div className="hostly-employees-state">No se pudo obtener el restaurante.</div>
      ) : loading ? (
        <div className="hostly-employees-state" role="status">Cargando empleados…</div>
      ) : rows.length === 0 ? (
        <div className="hostly-employees-state">No hay empleados para mostrar.</div>
      ) : (
        <section className="hostly-employees-surface" aria-label="Empleados del restaurante">
          <div className="hostly-employees-table-wrap">
            <table className="hostly-employees-table">
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "18%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><div className="hostly-employees-table__name">{displayNombre(row)}</div></td>
                    <td><div className="hostly-employees-table__email">{typeof row.email === "string" ? row.email : "—"}</div></td>
                    <td>{renderRoleSelect(row)}</td>
                    <td>{renderAction(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="hostly-employees-mobile-list">
            {rows.map((row) => (
              <article key={row.id} className="hostly-employees-card">
                <div className="hostly-employees-card__head">
                  <div className="hostly-employees-card__identity">
                    <div className="hostly-employees-card__name">{displayNombre(row)}</div>
                    <div className="hostly-employees-card__email">
                      {typeof row.email === "string" ? row.email : "—"}
                    </div>
                  </div>
                  <span className="hostly-employees-card__status">{employeeStatusLabel(row)}</span>
                </div>
                <div className="hostly-employees-card__controls">
                  {renderRoleSelect(row)}
                  {renderAction(row)}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </ModulePageShell>
  );
}
