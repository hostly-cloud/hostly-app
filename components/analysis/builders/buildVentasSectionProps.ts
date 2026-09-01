import type { VentasAnalyticsSectionProps, VentasOrderInput } from "@/components/analysis";

export type BuildVentasSectionPropsInput = {
  placeholder?: string;
  restaurantId?: string;
  orders: VentasOrderInput[];
  dataState?: "loading" | "ready" | "error";
  errorMessage?: string;
};

export function buildVentasSectionProps({
  placeholder,
  restaurantId,
  orders,
  dataState,
  errorMessage,
}: BuildVentasSectionPropsInput): VentasAnalyticsSectionProps {
  return {
    placeholder,
    restaurantId,
    orders,
    dataState,
    errorMessage,
  };
}
