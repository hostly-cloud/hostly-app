"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { useMesas } from "@/hooks/useMesas";
import { updateMesa } from "@/lib/firestore/mesas";
import type { Mesa } from "@/types/mesa";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyLoadingState } from "@/components/ui/hostly";

export default function MesasPage() {
  const router = useRouter();
  const { restaurantId, ready } = useAuth();
  const { mesas, loading } = useMesas(restaurantId);

  const handleToggleMesa = async (mesa: Mesa) => {
    const nextStatus = mesa.status === "free" ? "occupied" : "free";

    try {
      await updateMesa(mesa.id, {
        status: nextStatus,
      });
    } catch (err) {
      console.error("Error updating mesa", err);
    }
  };

  if (!ready || loading) {
    return (
      <ModulePageShell title="Mesas" subtitle="Estado de sala" maxWidth={1180} compactLayout>
        <HostlyLoadingState embedded label="Cargando mesas…" />
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell title="Mesas" subtitle="Estado de sala" maxWidth={1180} compactLayout>
      <div className="hostly-mesas-grid">
        {mesas.map((mesa) => (
          <div
            className={`hostly-mesa-card hostly-mesa-card--${mesa.status}`}
            key={mesa.id}
            onClick={() => router.push(`/dashboard/mesas/${mesa.id}`)}
          >
            <div className="hostly-mesa-card__name">{mesa.name}</div>
            <div className="hostly-mesa-card__meta">{mesa.zone}</div>
            <div className="hostly-mesa-card__meta">{mesa.capacity} pax</div>
          </div>
        ))}
      </div>
    </ModulePageShell>
  );
}
