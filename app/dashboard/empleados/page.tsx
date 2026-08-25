"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import StaffInvitePanel from "@/components/employees/staff-invite-panel";
import ModulePageShell from "@/components/module-page-shell";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import { normalizeAuthorizationRole } from "@/lib/auth/profile-authorization-policy";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  requestManagedRestaurantUsers,
  requestManagedUserUpdate,
} from "@/lib/users/request-manage-users";
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
  const name =
    (typeof row.displayName === "string" && row.displayName.trim()) ||
    (typeof row.nombre === "string" && row.nombre.trim());
  if (name) return name;
  const email = typeof row.email === "string" ? row.email.trim() : "";
  return email.includes("@") ? email.split("@")[0] || "—" : email || "—";
}

function managedRoleValue(role: unknown): ManagedAssignableRole | "owner" | "" {
  return normalizeAuthorizationRole(role) ?? "";
}

function roleLabel(role: unknown): string {
  const value = managedRoleValue(role);
  if (value === "owner") return "Propietario";
  if (value === "admin") return "Administrador";
  if (value === "manager") return "Encargado";
  if (value === "waiter") return "Operativo / Camarero";
  if (value === "kitchen") return "Cocina";
  if (value === "viewer") return "Solo lectura";
  return "Sin rol";
}

function isOwner(role: unknown): boolean {
  return managedRoleValue(role) === "owner";
}

function isAdmin(role: unknown): boolean {
  return managedRoleValue(role) === "admin";
}

function statusLabel(row: UserRow): string {
  if (row.reviewRequired) return "Revisión necesaria";
  if (row.status === "disabled") return "Inactivo";
  return "Activo";
}

const styles = `
.hostly-team-page{display:flex;min-width:0;flex-direction:column;gap:12px}
.hostly-team-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.hostly-team-kpi{min-width:0;border:1px solid var(--hostly-line);border-radius:12px;background:#fff;padding:10px 12px}
.hostly-team-kpi strong{display:block;color:var(--hostly-ink-strong);font-size:18px;line-height:1}
.hostly-team-kpi span{display:block;margin-top:4px;color:var(--hostly-ink-muted);font-size:10px;font-weight:650}
.hostly-team-toolbar{display:flex;min-width:0;align-items:center;gap:8px}
.hostly-team-search{min-height:42px;min-width:0;flex:1;border:1px solid var(--hostly-line-strong);border-radius:10px;background:#fff;padding:0 12px;color:var(--hostly-ink);font-size:13px;outline:none}
.hostly-team-search:focus{border-color:#38bdf8;box-shadow:0 0 0 3px rgba(56,189,248,.12)}
.hostly-team-state{padding:14px;border:1px solid var(--hostly-line);border-radius:12px;background:#fff;color:var(--hostly-ink-muted);font-size:12px;line-height:1.4}
.hostly-team-surface{overflow:hidden;border:1px solid var(--hostly-line);border-radius:14px;background:#fff}
.hostly-team-table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
.hostly-team-table{width:100%;min-width:780px;border-collapse:collapse;table-layout:fixed}
.hostly-team-table th{padding:9px 12px;border-bottom:1px solid var(--hostly-table-divider);background:var(--hostly-table-head-surface);color:var(--hostly-ink-muted);font-size:10px;font-weight:750;letter-spacing:.045em;text-align:left;text-transform:uppercase}
.hostly-team-table td{min-width:0;padding:10px 12px;border-bottom:1px solid var(--hostly-table-divider-soft);vertical-align:middle;font-size:12px}
.hostly-team-table tbody tr:last-child td{border-bottom:0}
.hostly-team-name,.hostly-team-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hostly-team-name{color:var(--hostly-ink-strong);font-weight:730}.hostly-team-email{margin-top:2px;color:var(--hostly-ink-muted);font-size:11px}
.hostly-team-badge{display:inline-flex;min-height:24px;align-items:center;border-radius:999px;padding:3px 8px;background:var(--hostly-surface-page-soft);color:var(--hostly-ink-muted);font-size:10px;font-weight:700;white-space:nowrap}
.hostly-team-select,.hostly-team-action{min-height:40px;width:100%;border:1px solid var(--hostly-line-strong);border-radius:9px;background:#fff;color:var(--hostly-ink);font-size:11px}
.hostly-team-select{padding:6px 8px}.hostly-team-action{padding:6px 9px;font-weight:700;cursor:pointer}.hostly-team-action:disabled,.hostly-team-select:disabled{cursor:not-allowed;opacity:.48}
.hostly-team-mobile{display:none}
@media(max-width:767px){
 .hostly-team-page{gap:10px}.hostly-team-summary{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.hostly-team-kpi{padding:9px}.hostly-team-kpi strong{font-size:16px}.hostly-team-kpi span{font-size:9px}
 .hostly-team-toolbar{align-items:stretch}.hostly-team-search{min-height:44px}
 .hostly-team-table-wrap{display:none}.hostly-team-surface{overflow:visible;border:0;background:transparent}.hostly-team-mobile{display:grid;gap:7px}
 .hostly-team-card{display:grid;gap:9px;min-width:0;border:1px solid rgba(148,163,184,.2);border-radius:12px;background:#fff;padding:10px}
 .hostly-team-card-head{display:flex;min-width:0;align-items:flex-start;justify-content:space-between;gap:8px}.hostly-team-card-id{min-width:0;flex:1}.hostly-team-name{font-size:13px}.hostly-team-email{overflow-wrap:anywhere;white-space:normal;font-size:10px}
 .hostly-team-card-controls{display:grid;grid-template-columns:minmax(0,1fr) minmax(104px,.42fr);gap:7px}.hostly-team-select,.hostly-team-action{min-height:44px;border-radius:10px}
}
@media(max-width:380px){.hostly-team-summary{grid-template-columns:1fr}.hostly-team-card-controls{grid-template-columns:1fr}}
`;

export default function EmpleadosPage({ embedInConfig = false }: { embedInConfig?: boolean }) {
  const {
    user,
    restaurantId,
    restaurantName,
    ready: authReady,
  } = useAuth();
  const { can, role: actorRole } = useHostlyCapabilities();
  const canManageUsers = can("users.manage");
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured || !restaurantId || !canManageUsers) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows((await requestManagedRestaurantUsers()) as UserRow[]);
    } catch (e) {
      console.error("[employees] load users", e);
      setRows([]);
      setError("No se pudo cargar el equipo del restaurante.");
    } finally {
      setLoading(false);
    }
  }, [canManageUsers, restaurantId]);

  useEffect(() => {
    if (authReady) void load();
  }, [authReady, load]);

  const activeCount = rows.filter((row) => row.status !== "disabled" && !row.reviewRequired).length;
  const disabledCount = rows.filter((row) => row.status === "disabled").length;
  const reviewCount = rows.filter((row) => row.reviewRequired).length;

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [displayNombre(row), row.email ?? "", roleLabel(row.role), statusLabel(row)]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [query, rows]);

  const protectedRow = (row: UserRow) =>
    row.id === user?.uid ||
    isOwner(row.role) ||
    (isAdmin(row.role) && actorRole !== "owner") ||
    Boolean(row.reviewRequired);

  const updateRole = useCallback(
    async (row: UserRow, role: ManagedAssignableRole) => {
      setBusyId(row.id);
      setError(null);
      try {
        await requestManagedUserUpdate({ userId: row.id, role });
        await load();
      } catch (e) {
        console.error("[employees] update role", e);
        setError("No se pudo cambiar el rol.");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const toggleStatus = useCallback(
    async (row: UserRow) => {
      setBusyId(row.id);
      setError(null);
      try {
        await requestManagedUserUpdate({
          userId: row.id,
          status: row.status === "disabled" ? "active" : "disabled",
        });
        await load();
      } catch (e) {
        console.error("[employees] update status", e);
        setError("No se pudo cambiar el estado del empleado.");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const renderRoleSelect = (row: UserRow) => (
    <select
      className="hostly-team-select"
      value={managedRoleValue(row.role)}
      disabled={busyId === row.id || protectedRow(row)}
      aria-label={`Rol de ${displayNombre(row)}`}
      onChange={(e) => void updateRole(row, e.target.value as ManagedAssignableRole)}
    >
      {isOwner(row.role) ? <option value="owner">Propietario</option> : null}
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
      className="hostly-team-action"
      disabled={busyId === row.id || protectedRow(row)}
      onClick={() => void toggleStatus(row)}
    >
      {busyId === row.id
        ? "Guardando…"
        : row.reviewRequired
          ? "Revisar"
          : row.status === "disabled"
            ? "Activar"
            : "Desactivar"}
    </button>
  );

  const shellProps = {
    title: embedInConfig ? undefined : "Empleados",
    subtitle: embedInConfig ? undefined : "Equipo, roles y accesos del restaurante",
    maxWidth: 1180,
    compactLayout: true,
    hideBackLink: embedInConfig,
    hideLogoutButton: embedInConfig,
    hideLanguageSwitcher: embedInConfig,
    shellSurface: embedInConfig ? ("configLight" as const) : ("default" as const),
  };

  if (!authReady) {
    return <ModulePageShell {...shellProps}><style>{styles}</style><div className="hostly-team-state">Cargando equipo…</div></ModulePageShell>;
  }

  if (!canManageUsers) {
    return <ModulePageShell {...shellProps}><style>{styles}</style><div className="hostly-team-state">No tienes permiso para gestionar empleados.</div></ModulePageShell>;
  }

  return (
    <ModulePageShell {...shellProps}>
      <style>{styles}</style>
      <div className="hostly-team-page">
        {!isFirebaseConfigured ? <div className="hostly-team-state">Falta configuración de Firebase.</div> : null}
        {!restaurantId ? <div className="hostly-team-state">No se pudo obtener el restaurante.</div> : null}

        {restaurantId ? (
          <>
            <div className="hostly-team-summary" aria-label="Resumen de equipo">
              <div className="hostly-team-kpi"><strong>{activeCount}</strong><span>Activos</span></div>
              <div className="hostly-team-kpi"><strong>{disabledCount}</strong><span>Inactivos</span></div>
              <div className="hostly-team-kpi"><strong>{reviewCount}</strong><span>Por revisar</span></div>
            </div>

            <StaffInvitePanel restaurantName={restaurantName} actorRole={actorRole} />

            <div className="hostly-team-toolbar">
              <input
                type="search"
                className="hostly-team-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, email, rol o estado…"
                aria-label="Buscar empleados"
              />
            </div>

            {error ? <div className="hostly-team-state" role="alert">{error}</div> : null}
            {loading ? (
              <div className="hostly-team-state" role="status">Cargando empleados…</div>
            ) : rows.length === 0 ? (
              <div className="hostly-team-state">Aún no hay empleados activos. Crea una invitación para incorporar el primer miembro del equipo.</div>
            ) : filteredRows.length === 0 ? (
              <div className="hostly-team-state">No hay empleados que coincidan con la búsqueda.</div>
            ) : (
              <section className="hostly-team-surface" aria-label="Empleados del restaurante">
                <div className="hostly-team-table-wrap">
                  <table className="hostly-team-table">
                    <colgroup><col style={{width:"30%"}}/><col style={{width:"25%"}}/><col style={{width:"27%"}}/><col style={{width:"18%"}}/></colgroup>
                    <thead><tr><th>Empleado</th><th>Estado</th><th>Rol</th><th>Acción</th></tr></thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          <td><div className="hostly-team-name">{displayNombre(row)}</div><div className="hostly-team-email">{row.email || "—"}</div></td>
                          <td><span className="hostly-team-badge">{statusLabel(row)}</span></td>
                          <td>{renderRoleSelect(row)}</td>
                          <td>{renderAction(row)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="hostly-team-mobile">
                  {filteredRows.map((row) => (
                    <article key={row.id} className="hostly-team-card">
                      <div className="hostly-team-card-head">
                        <div className="hostly-team-card-id"><div className="hostly-team-name">{displayNombre(row)}</div><div className="hostly-team-email">{row.email || "—"}</div></div>
                        <span className="hostly-team-badge">{statusLabel(row)}</span>
                      </div>
                      <div className="hostly-team-card-controls">{renderRoleSelect(row)}{renderAction(row)}</div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </div>
    </ModulePageShell>
  );
}
