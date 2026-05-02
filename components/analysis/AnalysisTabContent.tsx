"use client";

import type { ComensalesAnalyticsSectionProps } from "@/components/analysis/ComensalesAnalyticsSection";
import { ComensalesAnalyticsSection } from "@/components/analysis/ComensalesAnalyticsSection";
import type { HorasAnalyticsSectionProps } from "@/components/analysis/HorasAnalyticsSection";
import { HorasAnalyticsSection } from "@/components/analysis/HorasAnalyticsSection";
import type { ProductosAnalyticsSectionProps } from "@/components/analysis/ProductosAnalyticsSection";
import { ProductosAnalyticsSection } from "@/components/analysis/ProductosAnalyticsSection";
import type { VentasAnalyticsSectionProps } from "@/components/analysis/VentasAnalyticsSection";
import { VentasAnalyticsSection } from "@/components/analysis/VentasAnalyticsSection";

export type AnalysisTabContentProps = {
  tab: string;
  comensalesSectionProps: ComensalesAnalyticsSectionProps;
  ventasSectionProps: VentasAnalyticsSectionProps;
  horasSectionProps: HorasAnalyticsSectionProps;
  productosSectionProps: ProductosAnalyticsSectionProps;
};

export function AnalysisTabContent({
  tab,
  comensalesSectionProps,
  ventasSectionProps,
  horasSectionProps,
  productosSectionProps,
}: AnalysisTabContentProps) {
  if (tab === "comensales") {
    return <ComensalesAnalyticsSection {...comensalesSectionProps} />;
  }

  if (tab === "ventas") {
    return <VentasAnalyticsSection {...ventasSectionProps} />;
  }

  if (tab === "horas") {
    return <HorasAnalyticsSection {...horasSectionProps} />;
  }

  return <ProductosAnalyticsSection {...productosSectionProps} />;
}
