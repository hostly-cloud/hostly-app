"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  getUsersByRestaurant,
  removeUserFromRestaurant,
  updateUserRole,
} from "@/lib/firestore/users";
import ModulePageShell from "@/components/module-page-shell";

type UserRow = {
  id: string;
  email?: string;
  nombre?: string;
  displayName?: string;
  role?: string | null;
  restaurantId?: string | null;
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

export default function EmpleadosPage({
  embedInConfig = false,
}: {
  embedInConfig?: boolean;
}) {
  const { user, restaurantId, role, ready: authReady } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isFirebaseConfigured || !restaurantId || role !== "owner") {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getUsersByRestaurant(restaurantId);
      setRows(list as UserRow[]);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId, role]);

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

  if (role !== "owner") {
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
      await removeUserFromRestaurant(userId);
      const list = await getUsersByRestaurant(restaurantId);
      setRows(list as UserRow[]);
    } catch (e) {
      console.error(e);
    } finally {
      setRemovingId(null);
    }
  };

  const owners = rows.filter((u) => u.role === "owner");

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
                    value={row.role === "owner" ? "owner" : "staff"}
                    disabled={row.id === user?.uid && owners.length === 1}
                    onChange={(e) => {
                      void (async () => {
                        const newRole = e.target.value as "owner" | "staff";
                        if (
                          row.role === "owner" &&
                          newRole === "staff" &&
                          owners.length === 1
                        ) {
                          alert("Debe haber al menos un owner");
                          return;
                        }
                        await updateUserRole(row.id, newRole);
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
                    <option value="owner">Owner</option>
                    <option value="staff">Staff</option>
                  </select>
                </td>
                <td style={{ padding: "10px 0 10px 12px" }}>
                  <button
                    type="button"
                    disabled={removingId === row.id}
                    onClick={() => void onRemove(row.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #666",
                      backgroundColor: "#2a2a2a",
                      color: "#fff",
                      cursor: removingId === row.id ? "not-allowed" : "pointer",
                    }}
                  >
                    Eliminar
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
