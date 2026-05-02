import type { VentasAnalyticsSectionProps, VentasOrderInput } from "@/components/analysis";

export type BuildVentasSectionPropsInput = {
  placeholder?: string;
  restaurantId?: string;
  orders: VentasOrderInput[];
};

export function buildVentasSectionProps({
  placeholder,
  restaurantId,
  orders,
}: BuildVentasSectionPropsInput): VentasAnalyticsSectionProps {
  return {
    placeholder,
    restaurantId,
    orders,
  };
}

