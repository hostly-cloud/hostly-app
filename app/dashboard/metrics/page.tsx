"use client";

import {
  Timestamp,
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import ModulePageShell from "@/components/module-page-shell";

type OrderDoc = {
  id: string;
  createdAt?: unknown;
  closedAt?: unknown;
  status?: string;
  restaurantId?: string;
  tableId?: string | null;
  tableName?: string | null;
};

function readTsMs(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (
    v &&
    typeof v === "object" &&
    "toDate" in v &&
    typeof (v as { toDate: () => Date }).toDate === "function"
  ) {
    return (v as { toDate: () => Date }).toDate().getTime();
  }
  return undefined;
}

function startOfDayMs(day: Date): number {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDayMs(day: Date): number {
  const d = new Date(day);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function isCreatedOnDate(createdAt: unknown, day: Date): boolean {
  const ms = readTsMs(createdAt);
  if (ms == null) return false;
  return ms >= startOfDayMs(day) && ms <= endOfDayMs(day);
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function openOrderElapsedMinutes(o: OrderDoc): number | null {
  const ms = readTsMs(o.createdAt);
  if (ms == null) return null;
  return Math.floor((Date.now() - ms) / 60000);
}

function avgClosedMinutesForDay(
  ordersList: OrderDoc[],
  day: Date,
): number | null {
  const dayOrders = ordersList.filter((o) =>
    isCreatedOnDate(o.createdAt, day),
  );
  const durations: number[] = [];
  for (const o of dayOrders) {
    const c = readTsMs(o.createdAt);
    const cl = readTsMs(o.closedAt);
    if (c != null && cl != null && cl >= c) {
      durations.push(cl - c);
    }
  }
  if (durations.length === 0) return null;
  const avgMs =
    durations.reduce((a, b) => a + b, 0) / durations.length;
  return Math.round(avgMs / 60000);
}

export default function MetricsPage() {
  const router = useRouter();
  const { restaurantId, ready: authReady } = useAuth();
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAlert, setShowAlert] = useState(false);
  const prevTrend = useRef<"better" | "worse" | "equal" | null>(null);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;

    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );

    let cancelled = false;

    const unsub = onSnapshot(q, (snapshot) => {
      if (cancelled) return;
      setOrders(
        snapshot.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            createdAt: data.createdAt,
            closedAt: data.closedAt,
            status: typeof data.status === "string" ? data.status : undefined,
            restaurantId:
              typeof data.restaurantId === "string"
                ? data.restaurantId
                : undefined,
            tableId:
              typeof data.tableId === "string"
                ? data.tableId
                : data.tableId === null
                  ? null
                  : undefined,
            tableName:
              typeof data.tableName === "string"
                ? data.tableName
                : data.tableName === null
                  ? null
                  : undefined,
          };
        }),
      );
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authReady, restaurantId]);

  const {
    totalOrders,
    readyOrders,
    avgTimeToday,
    avgTimeYesterday,
    totalOrdersYesterday,
    ordersCompareTrend,
  } = useMemo(() => {
    const dayOrders = orders.filter((o) =>
      isCreatedOnDate(o.createdAt, selectedDate),
    );
    const totalOrders = dayOrders.length;
    const readyOrders = dayOrders.filter((o) => o.status === "ready").length;

    const yesterday = new Date(selectedDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const totalOrdersYesterday = orders.filter((o) =>
      isCreatedOnDate(o.createdAt, yesterday),
    ).length;

    let ordersCompareTrend: string | null = null;
    if (totalOrders > totalOrdersYesterday) {
      ordersCompareTrend = "↑ mejor";
    } else if (totalOrders < totalOrdersYesterday) {
      ordersCompareTrend = "↓ peor";
    }

    const avgTimeToday = avgClosedMinutesForDay(orders, selectedDate);
    const avgTimeYesterday = avgClosedMinutesForDay(orders, yesterday);

    let timeCompareTrend: string | null = null;
    if (avgTimeToday != null && avgTimeYesterday != null) {
      if (avgTimeToday < avgTimeYesterday) {
        timeCompareTrend = "⚡ más rápido";
      } else if (avgTimeToday > avgTimeYesterday) {
        timeCompareTrend = "🐢 más lento";
      }
    }

    return {
      totalOrders,
      readyOrders,
      avgTimeToday,
      avgTimeYesterday,
      timeCompareTrend,
      totalOrdersYesterday,
      ordersCompareTrend,
    };
  }, [orders, selectedDate]);

  const currentTrend =
    avgTimeToday != null && avgTimeYesterday != null
      ? avgTimeToday < avgTimeYesterday
        ? "better"
        : avgTimeToday > avgTimeYesterday
          ? "worse"
          : "equal"
      : null;

  useEffect(() => {
    if (prevTrend.current !== "worse" && currentTrend === "worse") {
      new Audio("/alert.mp3").play().catch(() => {});
      setShowAlert(true);
    }
    prevTrend.current = currentTrend;
  }, [currentTrend]);

  useEffect(() => {
    if (!showAlert) return;
    const t = window.setTimeout(() => setShowAlert(false), 5000);
    return () => clearTimeout(t);
  }, [showAlert]);

  const slowestTables = useMemo(() => {
    type Acc = { sum: number; count: number };
    const byTable = new Map<string, Acc>();

    const dayOrders = orders.filter((o) =>
      isCreatedOnDate(o.createdAt, selectedDate),
    );
    for (const o of dayOrders) {
      const c = readTsMs(o.createdAt);
      const cl = readTsMs(o.closedAt);
      if (c == null || cl == null || cl < c) continue;
      const label =
        o.tableName != null && String(o.tableName).trim() !== ""
          ? String(o.tableName).trim()
          : "Sin mesa";
      const dur = cl - c;
      const prev = byTable.get(label) ?? { sum: 0, count: 0 };
      prev.sum += dur;
      prev.count += 1;
      byTable.set(label, prev);
    }

    return [...byTable.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([name, v]) => ({
        name,
        avgMin: Math.round(v.sum / v.count / 60000),
      }))
      .sort((a, b) => b.avgMin - a.avgMin)
      .slice(0, 3);
  }, [orders, selectedDate]);

  const { slowOrdersCount, slowOrderTableLabels } = useMemo(() => {
    const todayOpen = orders.filter(
      (o) =>
        isCreatedOnDate(o.createdAt, selectedDate) &&
        o.status !== "closed" &&
        readTsMs(o.createdAt) != null,
    );
    const slowOrders = todayOpen.filter((o) => {
      const minutes = openOrderElapsedMinutes(o);
      return minutes != null && minutes > 20;
    });
    const slowOrdersCount = slowOrders.length;
    const slowOrderTableLabels = slowOrders.map((o) =>
      o.tableName != null && String(o.tableName).trim() !== ""
        ? String(o.tableName).trim()
        : "Sin mesa",
    );
    return { slowOrdersCount, slowOrderTableLabels };
  }, [orders, selectedDate]);

  const slowTables = useMemo(() => {
    return orders
      .map((o) => {
        const minutes = openOrderElapsedMinutes(o);
        return {
          tableName: o.tableName || "Mesa",
          minutes,
          tableId: o.tableId,
          orderId: o.id,
        };
      })
      .filter((o) => o.minutes != null && o.minutes > 20)
      .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))
      .slice(0, 3);
  }, [orders]);

  const prevSlowOrdersCount = useRef(0);

  useEffect(() => {
    if (slowOrdersCount > 0 && prevSlowOrdersCount.current === 0) {
      const audio = new Audio("/alert.mp3");
      void audio.play().catch(() => {});
    }
    prevSlowOrdersCount.current = slowOrdersCount;
  }, [slowOrdersCount]);

  return (
    <ModulePageShell title="Métricas" subtitle="Resumen del servicio" maxWidth={1180} compactLayout>
      <div style={{ color: "#fff" }}>
      <button
        type="button"
        onClick={() => {
          new Audio("/alert.mp3").play().catch(console.error);
        }}
      >
        Probar sonido
      </button>
      {showAlert ? (
        <div
          style={{
            backgroundColor: "#ef4444",
            color: "white",
            padding: "10px",
            borderRadius: "6px",
            marginBottom: "10px",
            fontWeight: "600",
          }}
        >
          ⚠️ Servicio empeorando
        </div>
      ) : null}
      {slowTables.length > 0 ? (
        <div style={{ marginTop: "10px" }}>
          <p style={{ fontWeight: "600" }}>⚠️ Mesas con retraso:</p>
          <ul>
            {slowTables.map((row, i) => (
              <li
                key={i}
                title="Abrir comanda"
                onClick={() => {
                  router.push(
                    `/dashboard/carta?tableId=${row.tableId}&orderId=${row.orderId}`,
                  );
                }}
                style={{
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontWeight: "600",
                }}
              >
                {row.tableName} ({row.minutes} min)
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {slowOrdersCount > 0 ? (
        <div
          style={{
            backgroundColor: "#dc2626",
            color: "white",
            padding: 12,
            marginBottom: 16,
          }}
        >
          ⚠️ Hay comandas con retraso
        </div>
      ) : null}
      <h2 style={{ marginTop: 0 }}>Métricas</h2>
      <input
        type="date"
        value={toDateInputValue(selectedDate)}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const [y, m, d] = v.split("-").map(Number);
          setSelectedDate(new Date(y, m - 1, d));
        }}
        style={{ marginBottom: 12, display: "block" }}
      />
      <p>Hoy: {totalOrders} comandas</p>
      <p>Ayer: {totalOrdersYesterday} comandas</p>
      {ordersCompareTrend ? <p>{ordersCompareTrend}</p> : null}
      <p>Listas: {readyOrders}</p>
      <p>
        Tiempo medio hoy:{" "}
        {avgTimeToday != null ? `${avgTimeToday} min` : "—"}
      </p>
      <p>
        Tiempo medio ayer:{" "}
        {avgTimeYesterday != null ? `${avgTimeYesterday} min` : "—"}
      </p>
      {avgTimeToday != null && avgTimeYesterday != null ? (
        <div
          style={{
            padding: "8px",
            borderRadius: "6px",
            marginTop: "8px",
            border:
              avgTimeToday < avgTimeYesterday
                ? "2px solid #22c55e"
                : avgTimeToday > avgTimeYesterday
                  ? "2px solid #ef4444"
                  : "2px solid #9ca3af",
            backgroundColor:
              avgTimeToday < avgTimeYesterday
                ? "#dcfce7"
                : avgTimeToday > avgTimeYesterday
                  ? "#fee2e2"
                  : "#f3f4f6",
          }}
        >
          <p style={{ fontWeight: "600" }}>
            {avgTimeToday < avgTimeYesterday
              ? `🟢 Servicio más rápido que ayer (-${Math.abs(avgTimeToday - avgTimeYesterday)} min)`
              : avgTimeToday > avgTimeYesterday
                ? `🔴 Servicio más lento que ayer (+${Math.abs(avgTimeToday - avgTimeYesterday)} min)`
                : "⚪ Mismo rendimiento que ayer"}
          </p>
        </div>
      ) : null}
      <p>Comandas con retraso: {slowOrdersCount}</p>
      {slowOrderTableLabels.length > 0 ? (
        <ul style={{ marginTop: 4, marginBottom: 0, paddingLeft: 20 }}>
          {slowOrderTableLabels.map((name, i) => (
            <li key={`${name}-${i}`}>{name}</li>
          ))}
        </ul>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <p style={{ marginBottom: 8 }}>Mesas más lentas:</p>
        {!Array.isArray(slowestTables) || slowestTables.length === 0 ? (
          <p>—</p>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {(Array.isArray(slowestTables) ? slowestTables : []).map((row) => (
              <li key={row.name}>
                {row.name} - {row.avgMin} min
              </li>
            ))}
          </ol>
        )}
      </div>
      </div>
    </ModulePageShell>
  );
}
