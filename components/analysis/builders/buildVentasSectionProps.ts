import type { VentasAnalyticsSectionProps, VentasOrderInput } from "@/components/analysis";

export type BuildVentasSectionPropsInput = {
  placeholder?: string;
  restaurantId?: string;
  orders: VentasOrderInput[];
  dataState?: "loading" | "ready" | "error";
  errorMessage?: string;
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  formatDateEs: (value: string) => string;
  detailHref: string;
};

export function buildVentasSectionProps({
  placeholder,
  restaurantId,
  orders,
  dataState,
  errorMessage,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  formatDateEs,
  detailHref,
}: BuildVentasSectionPropsInput): VentasAnalyticsSectionProps {
  return {
    placeholder,
    restaurantId,
    orders,
    dataState,
    errorMessage,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    formatDateEs,
    detailHref,
  };
}
