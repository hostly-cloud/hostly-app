import Link from "next/link";
import { AnalyticsDateRangeFields } from "@/components/analysis/AnalyticsDateRangeFields";
import { AnalyticsSectionHeader } from "@/components/analysis/AnalyticsSectionHeader";
import { ArrowUpRight, ReceiptText } from "lucide-react";

export type VentasHeaderBlockProps = {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  formatDateEs: (value: string) => string;
  detailHref: string;
};

export function VentasHeaderBlock({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  formatDateEs,
  detailHref,
}: VentasHeaderBlockProps) {
  return (
    <div className="hostly-analysis-header-card">
      <AnalyticsSectionHeader
        eyebrow="Rendimiento comercial"
        title="Ventas y cobros"
        description={`${formatDateEs(dateFrom)} – ${formatDateEs(dateTo)} · Solo cobros confirmados`}
        icon={<ReceiptText size={21} strokeWidth={2.1} />}
      />
      <div className="hostly-analysis-filterbar">
        <AnalyticsDateRangeFields
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
        <Link
          href={detailHref}
          className="hostly-analysis-detail-link"
        >
          <span>Ver cobros</span>
          <ArrowUpRight size={17} strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
