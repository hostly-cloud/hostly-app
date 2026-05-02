"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth/auth-context";
import { useOperationFilter } from "@/components/kds/operation-filter-context";
import { db, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  computeServiceMetrics,
  formatAvgMinutes,
  isOrderActiveForMetrics,
  type ServiceMetricsItem,
  type ServiceScope,
} from "@/lib/operacion/service-metrics";

type ChipTone = "blue" | "amber" | "green" | "neutral";

const chipBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  whiteSpace: "nowrap",
};

function chipStyle(tone: ChipTone): CSSProperties {
  if (tone === "blue") {
    return {
      ...chipBase,
      background: "rgba(59, 130, 246, 0.16)",
      color: "#dbeafe",
      border: "1px solid rgba(59, 130, 246, 0.32)",
    };
  }
  if (tone === "amber") {
    return {
      ...chipBase,
      background: "rgba(249, 115, 22, 0.16)",
      color: "#fed7aa",
      border: "1px solid rgba(249, 115, 22, 0.32)",
    };
  }
  if (tone === "green") {
    return {
      ...chipBase,
      background: "rgba(34, 197, 94, 0.16)",
      color: "#bbf7d0",
      border: "1px solid rgba(34, 197, 94, 0.32)",
    };
  }
  return {
    ...chipBase,
    background: "rgba(148, 163, 184, 0.14)",
    color: "#e2e8f0",
    border: "1px solid rgba(148, 163, 184, 0.28)",
  };
}

const chipLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  opacity: 0.85,
  letterSpacing: "0.02em",
};

const chipValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "-0.01em",
};

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(148, 163, 184, 0.22)",
  background: "rgba(15, 23, 42, 0.45)",
};

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: ChipTone;
}) {
  return (
    <span style={chipStyle(tone)}>
      <span style={chipLabelStyle}>{label}</span>
      <span style={chipValueStyle}>{value}</span>
    </span>
  );
}

type MetricsOrder = {
  waiterId?: string | null;
  tableId?: string | null;
  items: ServiceMetricsItem[];
};

export default function ServiceMetricsBar({
  scope,
}: {
  scope: ServiceScope;
}) {
  const { restaurantId, ready: authReady } = useAuth();
  const { matchesOrder } = useOperationFilter();
  const [orders, setOrders] = useState<MetricsOrder[]>([]);

  useEffect(() => {
    if (!authReady || !isFirebaseConfigured || !restaurantId) return;
    const q = query(
      collection(db, "orders"),
      where("restaurantId", "==", restaurantId),
    );
    const unsub = onSnapshot(q, (snap) => {
      const next: MetricsOrder[] = [];
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
        if (!isOrderActiveForMetrics(data.status)) continue;
        const arr = Array.isArray(data.items) ? data.items : [];
        const items: ServiceMetricsItem[] = [];
        for (const raw of arr) {
          if (!raw || typeof raw !== "object") continue;
          items.push(raw as ServiceMetricsItem);
        }
        next.push({
          waiterId:
            typeof data.waiterId === "string"
              ? (data.waiterId as string)
              : null,
          tableId:
            typeof data.tableId === "string" ? (data.tableId as string) : null,
          items,
        });
      }
      setOrders(next);
    });
    return () => unsub();
  }, [authReady, restaurantId]);

  const metrics = useMemo(() => {
    const items: ServiceMetricsItem[] = [];
    for (const o of orders) {
      if (!matchesOrder(o)) continue;
      for (const it of o.items) items.push(it);
    }
    return computeServiceMetrics(items, scope);
  }, [orders, scope, matchesOrder]);

  return (
    <div style={barStyle} aria-label="Métricas de servicio">
      <Chip label="Enviados" value={metrics.sent} tone="blue" />
      <Chip label="Preparados" value={metrics.prepared} tone="amber" />
      <Chip label="Servidos" value={metrics.served} tone="green" />
      <Chip
        label="Prep. media"
        value={formatAvgMinutes(metrics.avgPrepMinutes)}
        tone="neutral"
      />
      <Chip
        label="Serv. media"
        value={formatAvgMinutes(metrics.avgServeMinutes)}
        tone="neutral"
      />
    </div>
  );
}
