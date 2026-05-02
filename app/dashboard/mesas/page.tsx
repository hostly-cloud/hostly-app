"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-context";
import { useMesas } from "@/hooks/useMesas";
import { updateMesa } from "@/lib/firestore/mesas";
import type { Mesa } from "@/types/mesa";

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
    return <div>Cargando mesas...</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>Mesas</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 12,
        }}
      >
        {mesas.map((mesa) => (
          <div
            key={mesa.id}
            onClick={() => router.push(`/dashboard/mesas/${mesa.id}`)}
            style={{
              padding: 12,
              borderRadius: 12,
              color: "#f9fafb",
              background:
                mesa.status === "free"
                  ? "#1f2937"
                  : mesa.status === "occupied"
                    ? "#7f1d1d"
                    : "#78350f",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 600 }}>{mesa.name}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{mesa.zone}</div>
            <div style={{ fontSize: 12 }}>{mesa.capacity} pax</div>
          </div>
        ))}
      </div>
    </div>
  );
}
