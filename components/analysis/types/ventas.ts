export type VentasOrder = {
  total: number;
};

export type VentasKpis = {
  totalVentas: number;
  totalTickets: number;
  ticketMedio: number;
};

export type VentasChartPoint = {
  label: string;
  value: number;
};

export type VentasTableRow = {
  label: string;
  total: number;
  shortId?: string | null;
};

