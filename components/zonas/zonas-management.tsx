"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  countTablesUsingZone,
  createZone,
  deleteZone,
  getZones,
  updateZone,
  type Zone,
} from "@/lib/firestore/zones";

const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  boxSizing: "border-box",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.5)",
  color: "#f8fafc",
  padding: "10px 12px",
  fontSize: 14,
  outline: "none",
};

const colorInputStyle: CSSProperties = {
  width: 40,
  height: 40,
  padding: 0,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 10,
  background: "transparent",
  cursor: "pointer",
};

const primaryBtn: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  background: "rgba(56, 189, 248, 0.18)",
  color: "#e0f2fe",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const secondaryBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "transparent",
  color: "#e2e8f0",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const dangerBtn: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(248, 113, 113, 0.35)",
  background: "rgba(248, 113, 113, 0.12)",
  color: "#fecaca",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148, 163, 184, 0.18)",
  background: "rgba(15, 23, 42, 0.45)",
};

const dotStyle = (color?: string): CSSProperties => ({
  width: 14,
  height: 14,
  borderRadius: 999,
  background: color || "rgba(148, 163, 184, 0.35)",
  border: "1px solid rgba(148, 163, 184, 0.35)",
  flex: "none",
});

export default function ZonasManagement() {
  const { restaurantId: profileRestaurantId, user, ready: authReady } = useAuth();
  const restaurantId = profileRestaurantId ?? null;

  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>("#38bdf8");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string>("");

  const refresh = useCallback(async () => {
    if (!restaurantId || !isFirebaseConfigured) {
      setZones([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getZones(restaurantId);
      setZones(list);
    } catch {
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!authReady) return;
    void refresh();
  }, [authReady, refresh]);

  const handleCreateZone = useCallback(async () => {
    setError(null);
    const n = newName.trim();
    if (!restaurantId || !isFirebaseConfigured || !n) return;
    setBusy(true);
    try {
      await createZone(restaurantId, n, newColor || undefined);
      setNewName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear zona");
    } finally {
      setBusy(false);
    }
  }, [restaurantId, newName, newColor, refresh]);

  const startEdit = useCallback((zone: Zone) => {
    setEditingId(zone.id);
    setEditName(zone.name);
    setEditColor(zone.color ?? "");
    setError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  }, []);

  const handleUpdateZone = useCallback(
    async (zoneId: string) => {
      setError(null);
      const n = editName.trim();
      if (!isFirebaseConfigured || !n) return;
      setBusy(true);
      try {
        await updateZone(zoneId, {
          name: n,
          color: editColor || null,
        });
        cancelEdit();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al actualizar zona");
      } finally {
        setBusy(false);
      }
    },
    [editName, editColor, refresh, cancelEdit],
  );

  const handleDeleteZone = useCallback(
    async (zone: Zone) => {
      setError(null);
      if (!restaurantId || !isFirebaseConfigured) return;
      setBusy(true);
      try {
        const inUse = await countTablesUsingZone(
          restaurantId,
          zone.id,
          zone.name,
        );
        if (inUse > 0) {
          setError(
            `No se puede eliminar: ${inUse} ${
              inUse === 1 ? "elemento usa" : "elementos usan"
            } esta zona. Reasigna primero.`,
          );
          return;
        }
        await deleteZone(zone.id);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al eliminar zona");
      } finally {
        setBusy(false);
      }
    },
    [restaurantId, refresh],
  );

  return (
    <div
      className="hostly-card"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        padding: 20,
        borderRadius: "var(--hostly-radius-md)",
        gap: 16,
        overflow: "auto",
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            color: "#e2e8f0",
            letterSpacing: "-0.02em",
          }}
        >
          Zonas
        </h2>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: 13,
            color: "#94a3b8",
          }}
        >
          Áreas del local (terraza, salón, barra, piscina…)
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder="Nueva zona (ej. Terraza)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleCreateZone();
          }}
          style={inputStyle}
          disabled={busy || !restaurantId}
        />
        <input
          type="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          style={colorInputStyle}
          aria-label="Color de la zona"
          disabled={busy || !restaurantId}
        />
        <button
          type="button"
          onClick={() => void handleCreateZone()}
          style={primaryBtn}
          disabled={busy || !newName.trim() || !restaurantId}
        >
          Añadir zona
        </button>
      </div>

      {error ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(248, 113, 113, 0.35)",
            background: "rgba(248, 113, 113, 0.1)",
            color: "#fecaca",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{ display: "flex", flexDirection: "column", gap: 8 }}
      >
        {loading ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>Cargando…</div>
        ) : !restaurantId || !isFirebaseConfigured ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>
            Conecta Firebase para gestionar zonas.
          </div>
        ) : zones.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>
            Aún no hay zonas. Crea la primera arriba.
          </div>
        ) : (
          zones.map((z) =>
            editingId === z.id ? (
              <div key={z.id} style={rowStyle}>
                <input
                  type="color"
                  value={editColor || "#38bdf8"}
                  onChange={(e) => setEditColor(e.target.value)}
                  style={colorInputStyle}
                  aria-label="Color de la zona"
                />
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={inputStyle}
                />
                <button
                  type="button"
                  style={primaryBtn}
                  onClick={() => void handleUpdateZone(z.id)}
                  disabled={busy || !editName.trim()}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  style={secondaryBtn}
                  onClick={cancelEdit}
                  disabled={busy}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div key={z.id} style={rowStyle}>
                <span style={dotStyle(z.color)} aria-hidden />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    color: "#e2e8f0",
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {z.name}
                </span>
                <button
                  type="button"
                  style={secondaryBtn}
                  onClick={() => startEdit(z)}
                  disabled={busy}
                >
                  Editar
                </button>
                <button
                  type="button"
                  style={dangerBtn}
                  onClick={() => void handleDeleteZone(z)}
                  disabled={busy}
                >
                  Eliminar
                </button>
              </div>
            ),
          )
        )}
      </div>
    </div>
  );
}
