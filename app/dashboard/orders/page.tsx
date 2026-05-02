"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/auth-context";
import ModulePageShell from "@/components/module-page-shell";

export default function OrdersPage() {
  const { restaurantId } = useAuth();
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!restaurantId) return;

      const q = query(
        collection(db, "orders"),
        where("restaurantId", "==", restaurantId),
      );

      const snap = await getDocs(q);
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setOrders(data);
    };

    load();
  }, [restaurantId]);

  return (
    <ModulePageShell title="Historial de comandas" subtitle="Comandas guardadas" maxWidth={1180} compactLayout>
      <div>

      {orders.map((order) => {
        const id = String(order.id ?? "");
        const total = typeof order.total === "number" ? order.total : null;
        const items = Array.isArray(order.items) ? (order.items as unknown[]) : [];
        return (
          <div key={id} style={{ marginBottom: 20 }}>
            <div>Total: {total != null ? total.toFixed(2) : "—"}€</div>

            {items.map((it, i) => {
              const row = it as { nombre?: unknown; quantity?: unknown };
              const nombre = typeof row.nombre === "string" ? row.nombre : "—";
              const qty = typeof row.quantity === "number" ? row.quantity : null;
              return (
                <div key={i}>
                  {nombre} x{qty != null ? qty : "—"}
                </div>
              );
            })}
          </div>
        );
      })}
      </div>
    </ModulePageShell>
  );
}
