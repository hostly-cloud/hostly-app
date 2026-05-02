"use client";

import { useMemo } from "react";
import type { Reservation } from "@/lib/firestore/reservations";

export type UseZonasDataInput = {
  reservations: Reservation[];
  dateFrom: string;
  dateTo: string;
  restaurantId?: string;
};

export function useZonasData({
  reservations,
  dateFrom,
  dateTo,
  restaurantId,
}: UseZonasDataInput) {
  void dateFrom;
  void dateTo;
  void restaurantId;

  return useMemo(() => {
    const data = reservations;
    return { reservations: data };
  }, [reservations]);
}
