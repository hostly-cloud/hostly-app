"use client";

import { useMemo } from "react";
import type { VentasOrder } from "@/components/analysis/types/ventas";

export type VentasOrderInput = {
  total?: VentasOrder["total"] | null;
  createdAt?: unknown;
  id?: string | null;
  zoneName?: string | null;
};

export type UseVentasDataInput = {
  orders?: VentasOrderInput[] | null;
  restaurantId?: string;
};

export type UseVentasDataResult = {
  orders: VentasOrderInput[];
};

export function useVentasData({ orders, restaurantId }: UseVentasDataInput): UseVentasDataResult {
  void restaurantId;

  const safeOrders = useMemo(() => {
    return Array.isArray(orders) ? orders : [];
  }, [orders]);

  return {
    orders: safeOrders,
  };
}
