"use client";

import { ComensalesChartsBlock } from "@/components/analysis/ComensalesChartsBlock";
import { ComensalesKpiBlock } from "@/components/analysis/ComensalesKpiBlock";
import { ZonasAnalyticsSection, type ZonasAnalyticsSectionProps } from "@/components/analysis/ZonasAnalyticsSection";
import type {
  ComensalesSelectorsCharts,
  ComensalesSelectorsKpis,
} from "@/components/analysis/hooks/useComensalesSelectors";

export type ComensalesContentBlockProps = {
  compactViewZonas: boolean;
  comensalesKpis: ComensalesSelectorsKpis;
  comensalesCharts: ComensalesSelectorsCharts;
  zonasSectionProps: ZonasAnalyticsSectionProps;
};

export function ComensalesContentBlock({
  compactViewZonas,
  comensalesKpis,
  comensalesCharts,
  zonasSectionProps,
}: ComensalesContentBlockProps) {
  return (
    <>
      {!compactViewZonas ? (
        <>
          <ComensalesKpiBlock data={comensalesKpis} />

          <ComensalesChartsBlock data={comensalesCharts} />
        </>
      ) : null}

      <ZonasAnalyticsSection {...zonasSectionProps} />
    </>
  );
}
