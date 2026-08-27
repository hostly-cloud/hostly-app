"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { useMesas } from "@/hooks/useMesas";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyLoadingState } from "@/components/ui/hostly";

export default function MesasPage() {
  const router = useRouter();
  const { restaurantId, ready } = useAuth();
  const { mesas, loading } = useMesas(restaurantId);

  if (!ready || loading) {
    return (
      <ModulePageShell
        title="Mesas"
        subtitle="Estado de sala"
        maxWidth={1180}
        compactLayout
        operationalFocus
        denseWorkbench
        lockViewport
      >
        <HostlyLoadingState embedded label="Cargando mesas…" />
      </ModulePageShell>
    );
  }

  return (
    <ModulePageShell
      title="Mesas"
      subtitle="Estado de sala"
      maxWidth={1180}
      compactLayout
      operationalFocus
      denseWorkbench
      lockViewport
    >
      <section className="hostly-mesas-viewport" aria-label="Mesas del restaurante">
        <div className="hostly-mesas-toolbar">
          <div>
            <p className="hostly-mesas-toolbar__eyebrow">Sala</p>
            <p className="hostly-mesas-toolbar__title">{mesas.length} mesas</p>
          </div>
          <p className="hostly-mesas-toolbar__hint">Pulsa una mesa para abrir su detalle.</p>
        </div>
        <div className="hostly-mesas-grid" role="list">
          {mesas.map((mesa) => (
            <button
              type="button"
              role="listitem"
              className={`hostly-mesa-card hostly-mesa-card--${mesa.status}`}
              key={mesa.id}
              onClick={() => router.push(`/dashboard/mesas/${mesa.id}`)}
              aria-label={`${mesa.name}, ${mesa.zone}, ${mesa.capacity} personas`}
            >
              <span className="hostly-mesa-card__name">{mesa.name}</span>
              <span className="hostly-mesa-card__meta">{mesa.zone}</span>
              <span className="hostly-mesa-card__meta">{mesa.capacity} pax</span>
            </button>
          ))}
        </div>
      </section>
    </ModulePageShell>
  );
}
