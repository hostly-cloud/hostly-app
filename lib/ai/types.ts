/**
 * Tipos compartidos Hostly AI Core (infra read-only; sin proveedor LLM aún).
 */

export type HostlyManagerReservationBucket = {
  total: number;
  booked: number;
  seated: number;
  completed: number;
  noShow: number;
};

export type HostlyManagerOrdersBucket = {
  active: number;
  pendingItems: number;
  preparingItems: number;
  readyItems: number;
};

export type HostlyManagerSalesBucket = {
  /** Suma neta de ventas (tickets pagados hoy), o null si no se pudo calcular. */
  total: number | null;
  /** Número de pagos registrados hoy, o null si no disponible. */
  payments: number | null;
};

export type HostlyManagerDaySummary = {
  date: string;
  restaurantId: string;
  reservations: HostlyManagerReservationBucket;
  orders: HostlyManagerOrdersBucket;
  sales: HostlyManagerSalesBucket;
  alerts: string[];
  insights: string[];
};

export type HostlyAiManagerSummaryResponse =
  | {
      ok: true;
      summary: HostlyManagerDaySummary;
    }
  | {
      ok: false;
      error: string;
    };
