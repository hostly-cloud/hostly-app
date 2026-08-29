"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import {
  HostlyAlert,
  HostlyButton,
  HostlyField,
  HostlyInput,
  HostlySectionHeader,
  HostlySurface,
} from "@/components/ui/hostly";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import {
  countTablesUsingZone,
  createZone,
  deleteZone,
  getZones,
  updateZone,
  type Zone,
} from "@/lib/firestore/zones";

export default function ZonasManagement() {
  const { restaurantId: profileRestaurantId, ready: authReady } = useAuth();
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
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <HostlySectionHeader
        title="Zonas"
        description="Organiza las áreas del local, como terraza, salón, barra o piscina."
      />

      <HostlySurface variant="ice" className="p-4 sm:p-5">
        <HostlySectionHeader
          title="Nueva zona"
          titleVariant="section"
          description="Ponle un nombre claro y un color para reconocerla rápidamente."
          className="mb-4"
        />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_88px_auto] sm:items-end">
          <HostlyField label="Nombre">
            <HostlyInput
              type="text"
              placeholder="Ej. Terraza"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreateZone();
              }}
              disabled={busy || !restaurantId}
            />
          </HostlyField>
          <HostlyField label="Color">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-11 w-full cursor-pointer rounded-xl border border-slate-200 bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Color de la nueva zona"
              disabled={busy || !restaurantId}
            />
          </HostlyField>
          <HostlyButton
            variant="primary"
            className="h-11 whitespace-nowrap"
            onClick={() => void handleCreateZone()}
            disabled={busy || !newName.trim() || !restaurantId}
          >
            Añadir zona
          </HostlyButton>
        </div>
      </HostlySurface>

      {error ? <HostlyAlert tone="danger">{error}</HostlyAlert> : null}

      <HostlySurface variant="flat" className="flex flex-col gap-3 p-4 sm:p-5">
        <HostlySectionHeader
          title="Zonas del restaurante"
          titleVariant="section"
          description={`${zones.length} ${zones.length === 1 ? "zona configurada" : "zonas configuradas"}`}
        />
        {loading ? (
          <p className="hostly-muted hostly-type-caption py-6 text-center">
            Cargando…
          </p>
        ) : !restaurantId || !isFirebaseConfigured ? (
          <HostlyAlert tone="warning">
            Conecta Firebase para gestionar zonas.
          </HostlyAlert>
        ) : zones.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Aún no hay zonas. Crea la primera arriba.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {zones.map((z) =>
              editingId === z.id ? (
                <div
                  key={z.id}
                  className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3 sm:grid-cols-[56px_minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <input
                    type="color"
                    value={editColor || "#38bdf8"}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="h-11 w-14 cursor-pointer rounded-xl border border-slate-200 bg-white p-1"
                    aria-label={`Color de ${z.name}`}
                  />
                  <HostlyInput
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    aria-label={`Nombre de ${z.name}`}
                  />
                  <HostlyButton
                    variant="primary"
                    onClick={() => void handleUpdateZone(z.id)}
                    disabled={busy || !editName.trim()}
                  >
                    Guardar
                  </HostlyButton>
                  <HostlyButton
                    variant="secondary"
                    onClick={cancelEdit}
                    disabled={busy}
                  >
                    Cancelar
                  </HostlyButton>
                </div>
              ) : (
                <div
                  key={z.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-full border border-slate-200 shadow-sm"
                    style={{ backgroundColor: z.color || "#cbd5e1" }}
                    aria-hidden
                  />
                  <strong className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                    {z.name}
                  </strong>
                  <HostlyButton
                    variant="tableAction"
                    onClick={() => startEdit(z)}
                    disabled={busy}
                  >
                    Editar
                  </HostlyButton>
                  <HostlyButton
                    variant="destructive"
                    onClick={() => void handleDeleteZone(z)}
                    disabled={busy}
                  >
                    Eliminar
                  </HostlyButton>
                </div>
              ),
            )}
          </div>
        )}
      </HostlySurface>
    </div>
  );
}
