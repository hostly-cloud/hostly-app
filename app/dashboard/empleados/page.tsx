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

  if (!authReady) {
    return (
      <ModulePageShell
        title={shellTitle}
        subtitle={shellSubtitle}
        maxWidth={1180}
        compactLayout
        hideBackLink={embedInConfig}
        hideLogoutButton={embedInConfig}
        hideLanguageSwitcher={embedInConfig}
        shellSurface={embedInConfig ? "configLight" : "default"}
      >
        <div style={{ color: "#fff" }}>
          <p>Cargando...</p>
        </div>
      </ModulePageShell>
    );
  }

  if (!canManageUsers) {
    return (
      <ModulePageShell
        title={shellTitle}
        subtitle={shellSubtitle}
        maxWidth={1180}
        compactLayout
        hideBackLink={embedInConfig}
        hideLogoutButton={embedInConfig}
        hideLanguageSwitcher={embedInConfig}
        shellSurface={embedInConfig ? "configLight" : "default"}
      >
        <div style={{ color: "#fff" }}>
          <p>No tienes permiso para ver esta página.</p>
        </div>
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

  return (
    <ModulePageShell
      title={shellTitle}
      subtitle={shellSubtitle}
      maxWidth={1180}
      compactLayout
      hideBackLink={embedInConfig}
      hideLogoutButton={embedInConfig}
      hideLanguageSwitcher={embedInConfig}
      shellSurface={embedInConfig ? "configLight" : "default"}
    >
      <div style={{ color: "#fff" }}>
      {!isFirebaseConfigured && <p>Falta configuración de Firebase</p>}
      {isFirebaseConfigured && !restaurantId && (
        <p>No se pudo obtener el restaurante.</p>
      )}
      {isFirebaseConfigured && restaurantId && loading && <p>Cargando...</p>}
      {isFirebaseConfigured && restaurantId && !loading && (
        <table
          style={{
            width: "100%",
            maxWidth: 720,
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid #444", textAlign: "left" }}>
              <th style={{ padding: "8px 12px 8px 0" }}>Nombre</th>
              <th style={{ padding: "8px 12px" }}>Email</th>
              <th style={{ padding: "8px 12px" }}>Rol</th>
              <th style={{ padding: "8px 0 8px 12px" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #333" }}>
                <td style={{ padding: "10px 12px 10px 0" }}>{displayNombre(row)}</td>
                <td style={{ padding: "10px 12px" }}>
                  {typeof row.email === "string" ? row.email : "—"}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <select
                    value={managedRoleValue(row.role)}
                    disabled={
                      row.id === user?.uid ||
                      isManagedOwner(row.role) ||
                      (isManagedAdmin(row.role) && actorRole !== "owner") ||
                      row.reviewRequired
                    }
                    onChange={(e) => {
                      void (async () => {
                        const newRole = e.target.value as ManagedAssignableRole;
                        await requestManagedUserUpdate({
                          userId: row.id,
                          role: newRole,
                        });
                        await load();
                      })();
                    }}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid #666",
                      backgroundColor: "#2a2a2a",
                      color: "#fff",
                    }}
                  >
                    {isManagedOwner(row.role) ? (
                      <option value="owner">Owner</option>
                    ) : null}
                    {row.reviewRequired ? (
                      <option value="">Revisión necesaria</option>
                    ) : null}
                    <option value="admin" disabled={actorRole !== "owner"}>
                      Administrador
                    </option>
                    <option value="manager">Encargado</option>
                    <option value="waiter">Operativo / Camarero</option>
                    <option value="kitchen">Cocina</option>
                    <option value="viewer">Solo lectura</option>
                  </select>
                </td>
                <td style={{ padding: "10px 0 10px 12px" }}>
                  <button
                    type="button"
                    disabled={
                      removingId === row.id ||
                      row.id === user?.uid ||
                      isManagedOwner(row.role) ||
                      (isManagedAdmin(row.role) && actorRole !== "owner") ||
                      row.reviewRequired
                    }
                    onClick={() => void onRemove(row.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #666",
                      backgroundColor: "#2a2a2a",
                      color: "#fff",
                      cursor:
                        removingId === row.id ||
                        row.id === user?.uid ||
                        isManagedOwner(row.role) ||
                        (isManagedAdmin(row.role) && actorRole !== "owner") ||
                        row.reviewRequired
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {row.reviewRequired
                      ? "Revisión necesaria"
                      : row.status === "disabled"
                        ? "Activar"
                        : "Desactivar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      </div>
    </ModulePageShell>
  );
}
