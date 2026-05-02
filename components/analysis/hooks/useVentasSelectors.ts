"use client";

import { useMemo } from "react";
import type { VentasOrderInput } from "./useVentasData";
import type {
  VentasChartPoint,
  VentasKpis,
  VentasTableRow as DomainVentasTableRow,
} from "@/components/analysis/types/ventas";
import type { VentasAnalyticsSnapshotModel } from "@/components/analysis/types/snapshots";

export type VentasSelectorsKpis = VentasKpis;

export type VentasChartsPoint = VentasChartPoint;

export type VentasSelectorsCharts = {
  dailySales: VentasChartsPoint[];
};

export type VentasTableRow = DomainVentasTableRow;

export type VentasSelectorsTable = {
  rows: VentasTableRow[];
};

export type VentasSelectorsInsights = {
  summaryLines: string[];
};

export type VentasSelectorsActionsData = {
  kpis: VentasSelectorsKpis;
  charts: VentasSelectorsCharts;
  table: VentasSelectorsTable;
  insights: VentasSelectorsInsights;
};

export type UseVentasSelectorsInput = {
  orders?: VentasOrderInput[] | null;
};

export type VentasZonaMasVentas = {
  zoneName: string;
  total: number;
} | null;

export type VentasTopZona = {
  zoneName: string;
  total: number;
};

export type VentasZonaVentasVsOcupacion = {
  zoneName: string;
  ventas: number;
};

export type VentasAnalyticsSnapshot = VentasAnalyticsSnapshotModel & {
  actionsData: VentasSelectorsActionsData;
  zonaMasVentas: VentasZonaMasVentas;
  topZonasVentas: VentasTopZona[];
  ventasPorZona: Map<string, number>;
};

export type UseVentasSelectorsResult = VentasAnalyticsSnapshot;

const resolveVentasOrderDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const formatVentasDateLabel = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatVentasDateTimeLabel = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

const VENTAS_TABLE_LIMIT = 10;

export function useVentasSelectors(input: UseVentasSelectorsInput): UseVentasSelectorsResult {
  const { orders } = input;

  const kpis = useMemo<VentasSelectorsKpis>(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];

    const totalVentas = safeOrders.reduce<number>((acc, order) => {
      const total =
        typeof order?.total === "number" && !Number.isNaN(order.total)
          ? order.total
          : 0;
      return acc + total;
    }, 0);

    const totalTickets = safeOrders.length;
    const ticketMedio = totalTickets > 0 ? totalVentas / totalTickets : 0;

    return {
      totalVentas,
      totalTickets,
      ticketMedio,
    };
  }, [orders]);

  const zonaMasVentas = useMemo<VentasZonaMasVentas>(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];

    const byZone = new Map<string, number>();

    safeOrders.forEach((order) => {
      const total =
        typeof order?.total === "number" && !Number.isNaN(order.total)
          ? order.total
          : 0;

      const zone =
        typeof order?.zoneName === "string" && order.zoneName.trim().length > 0
          ? order.zoneName.trim()
          : "Sin zona";

      byZone.set(zone, (byZone.get(zone) ?? 0) + total);
    });

    let maxZone: string | null = null;
    let maxValue = 0;

    byZone.forEach((value, key) => {
      if (value > maxValue) {
        maxValue = value;
        maxZone = key;
      }
    });

    return maxZone
      ? { zoneName: maxZone, total: maxValue }
      : null;
  }, [orders]);

  const topZonasVentas = useMemo<VentasTopZona[]>(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const byZone = new Map<string, number>();

    safeOrders.forEach((order) => {
      const total =
        typeof order?.total === "number" && !Number.isNaN(order.total)
          ? order.total
          : 0;

      const zone =
        typeof order?.zoneName === "string" && order.zoneName.trim().length > 0
          ? order.zoneName.trim()
          : "Sin zona";

      byZone.set(zone, (byZone.get(zone) ?? 0) + total);
    });

    return Array.from(byZone.entries())
      .map(([zoneName, total]) => ({ zoneName, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [orders]);

  const ventasPorZona = useMemo<Map<string, number>>(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const byZone = new Map<string, number>();

    safeOrders.forEach((order) => {
      const total =
        typeof order?.total === "number" && !Number.isNaN(order.total)
          ? order.total
          : 0;

      const zone =
        typeof order?.zoneName === "string" && order.zoneName.trim().length > 0
          ? order.zoneName.trim()
          : "Sin zona";

      byZone.set(zone, (byZone.get(zone) ?? 0) + total);
    });

    return byZone;
  }, [orders]);

  const charts = useMemo<VentasSelectorsCharts>(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];

    const byDay = new Map<string, number>();

    safeOrders.forEach((order) => {
      const value =
        typeof order?.total === "number" && !Number.isNaN(order.total)
          ? order.total
          : 0;

      const date = resolveVentasOrderDate(order?.createdAt);
      if (!date) return;

      const key = date.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + value);
    });

    const dailySales = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rawLabel, value]) => {
        const parsedDate = new Date(`${rawLabel}T00:00:00`);
        return {
          label: Number.isNaN(parsedDate.getTime())
            ? rawLabel
            : formatVentasDateLabel(parsedDate),
          value,
        };
      });

    return {
      dailySales,
    };
  }, [orders]);

  const table = useMemo<VentasSelectorsTable>(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];

    const rows = safeOrders
      .map((order, index) => {
        const total =
          typeof order?.total === "number" && !Number.isNaN(order.total)
            ? order.total
            : 0;

        const date = resolveVentasOrderDate(order?.createdAt);
        const shortId =
          typeof order?.id === "string" && order.id.trim().length > 0
            ? order.id.trim().slice(0, 8)
            : null;

        const label = date
          ? formatVentasDateTimeLabel(date)
          : `Sin fecha ${index + 1}`;

        return {
          label,
          total,
          shortId,
          sortTime: date ? date.getTime() : -1,
        };
      })
      .sort((a, b) => b.sortTime - a.sortTime)
      .slice(0, VENTAS_TABLE_LIMIT)
      .map(({ label, total, shortId }) => ({
        label,
        total,
        shortId,
      }));

    return {
      rows,
    };
  }, [orders]);

  const insights = useMemo<VentasSelectorsInsights>(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];

    if (safeOrders.length === 0) {
      return {
        summaryLines: [],
      };
    }

    const totalVentas = kpis.totalVentas;
    const totalTickets = kpis.totalTickets;
    const ticketMedio = kpis.ticketMedio;

    const summaryLines = [
      `Ventas totales registradas: ${totalVentas.toFixed(2)} €`,
      `Total de tickets detectados: ${totalTickets}`,
      `Ticket medio actual: ${ticketMedio.toFixed(2)} €`,
    ];

    return {
      summaryLines,
    };
  }, [orders, kpis]);

  const actionsData = useMemo<VentasSelectorsActionsData>(
    () => ({
      kpis,
      charts,
      table,
      insights,
    }),
    [kpis, charts, table, insights],
  );

  return {
    kpis,
    charts,
    table,
    insights,
    actionsData,
    zonaMasVentas,
    topZonasVentas,
    ventasPorZona,
  };
}
