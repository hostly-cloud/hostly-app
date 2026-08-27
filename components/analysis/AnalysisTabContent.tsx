"use client";

import type { ReactNode } from "react";
import type { ComensalesAnalyticsSectionProps } from "@/components/analysis/ComensalesAnalyticsSection";
import { ComensalesAnalyticsSection } from "@/components/analysis/ComensalesAnalyticsSection";
import type { HorasAnalyticsSectionProps } from "@/components/analysis/HorasAnalyticsSection";
import { HorasAnalyticsSection } from "@/components/analysis/HorasAnalyticsSection";
import type { ProductosAnalyticsSectionProps } from "@/components/analysis/ProductosAnalyticsSection";
import { ProductosAnalyticsSection } from "@/components/analysis/ProductosAnalyticsSection";
import type { RentabilidadAnalyticsSectionProps } from "@/components/analysis/RentabilidadAnalyticsSection";
import { RentabilidadAnalyticsSection } from "@/components/analysis/RentabilidadAnalyticsSection";
import type { VentasAnalyticsSectionProps } from "@/components/analysis/VentasAnalyticsSection";
import { VentasAnalyticsSection } from "@/components/analysis/VentasAnalyticsSection";

export type AnalysisTabContentProps = {
  tab: string;
  comensalesSectionProps: ComensalesAnalyticsSectionProps;
  ventasSectionProps: VentasAnalyticsSectionProps;
  horasSectionProps: HorasAnalyticsSectionProps;
  productosSectionProps: ProductosAnalyticsSectionProps;
  rentabilidadSectionProps: RentabilidadAnalyticsSectionProps;
};

export function AnalysisTabContent({
  tab,
  comensalesSectionProps,
  ventasSectionProps,
  horasSectionProps,
  productosSectionProps,
  rentabilidadSectionProps,
}: AnalysisTabContentProps) {
  let content: ReactNode;

  if (tab === "comensales") {
    content = <ComensalesAnalyticsSection {...comensalesSectionProps} />;
  } else if (tab === "ventas") {
    content = <VentasAnalyticsSection {...ventasSectionProps} />;
  } else if (tab === "rentabilidad") {
    content = <RentabilidadAnalyticsSection {...rentabilidadSectionProps} />;
  } else if (tab === "horas") {
    content = <HorasAnalyticsSection {...horasSectionProps} />;
  } else {
    content = <ProductosAnalyticsSection {...productosSectionProps} />;
  }

  return <div className="hostly-analysis-tab-viewport">{content}</div>;
}
