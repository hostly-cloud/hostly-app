"use client";

import { useRouter } from "next/navigation";
import {
  Timestamp,
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import { getTables, type Table } from "@/lib/firestore/tables";
import { useSelectedTable } from "@/context/SelectedTableContext";
import ModulePageShell from "@/components/module-page-shell";

function orderCreatedAtMs(createdAt: unknown): number | undefined {
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt;
  if (createdAt instanceof Timestamp) return createdAt.toMillis();
  if (
    createdAt &&
    typeof createdAt === "object" &&
    "toDate" in createdAt &&
    typeof (createdAt as { toDate: () => Date }).toDate === "function"
  ) {
    return (createdAt as { toDate: () => Date }).toDate().getTime();
  }
  return undefined;
}

export default function TablesPage() {
  const router = useRouter();
  const { restaurantId, ready: authReady } = useAuth();
  const { selectedTable, setSelectedTable } = useSelectedTable();
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<
    { id: string; tableId?: string | null; status?: string; createdAt?: unknown }[]
  >([]);

  useEffect(() => {
    setSelectedTable(null);
  }, [restaurantId, setSelectedTable]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;

    let cancelled = false;

    void (async () => {
      const list = await getTables(restaurantId);
      if (cancelled) return;
      setTables(list);
    })();

    const ordersQuery = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    const unsub = onSnapshot(ordersQuery, (snapshot) => {
      if (cancelled) return;
      setOrders(
        snapshot.docs.map((d) => {
          const data = d.data() as {
            tableId?: string | null;
            status?: string;
            createdAt?: unknown;
          };
          return {
            id: d.id,
            tableId: data.tableId,
            status: data.status,
            createdAt: data.createdAt,
          };
        }),
      );
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, restaurantId]);

  useEffect(() => {
    if (tables.length === 0) return;
    setSelectedTable((prev) => {
      if (!prev) return tables[0];
      if (tables.some((t) => t.id === prev.id)) return prev;
      return tables[0];
    });
  }, [tables, setSelectedTable]);

  return (
    <ModulePageShell title="Mesas" subtitle="Selecciona una mesa para operar" maxWidth={1180} compactLayout>
      <div style={{ color: "#fff" }}>
      <h2 style={{ marginTop: 0 }}>Mesas</h2>
      <ul>
        {tables.map((t) => {
          const isReady = orders.some(
            (o) => o.tableId === t.id && o.status === "ready",
          );
          const isOccupied = orders.some(
            (o) => o.tableId === t.id && o.status !== "closed",
          );
          const activeOrder = orders.find(
            (o) => o.tableId === t.id && o.status !== "closed",
          );
          const createdMs = activeOrder
            ? orderCreatedAtMs(activeOrder.createdAt)
            : undefined;
          const minutes =
            createdMs != null
              ? Math.floor((Date.now() - createdMs) / 60000)
              : null;

          let borderColor = "transparent";
          if (minutes != null && minutes >= 20) {
            borderColor = "#dc2626";
          } else if (minutes != null && minutes >= 10) {
            borderColor = "#eab308";
          }

          return (
            <li
              key={t.id}
              onClick={() => {
                const active = orders.find(
                  (o) => o.tableId === t.id && o.status !== "closed",
                );
                if (active) {
                  router.push(
                    `/dashboard/carta?tableId=${t.id}&orderId=${active.id}`,
                  );
                } else {
                  router.push(`/dashboard/carta?tableId=${t.id}`);
                }
              }}
              style={{
                backgroundColor: isReady
                  ? "#22c55e"
                  : isOccupied
                    ? "#ef4444"
                    : "#e5e7eb",
                border: `3px solid ${borderColor}`,
              }}
            >
              {t.name}
              {minutes != null ? ` - ${minutes} min` : ""} — {t.status}
              {isReady ? " — LISTO" : isOccupied ? " — Ocupada" : " — Libre"}
              {selectedTable?.id === t.id ? " (seleccionada)" : ""}
            </li>
          );
        })}
      </ul>
      </div>
    </ModulePageShell>
  );
}
