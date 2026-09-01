import Link from "next/link";
import { AnalyticsDateRangeFields } from "@/components/analysis/AnalyticsDateRangeFields";
import { HostlySectionHeader } from "@/components/ui/hostly";

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
    <div className="hostly-analytics-toolbar">
      <div className="hostly-analytics-toolbar__filters min-w-0 flex-1 flex-col items-stretch gap-[var(--hostly-op-gap-sm)] sm:flex-row sm:items-center">
        <HostlySectionHeader
          title="Ventas"
          description={`Cobros confirmados · ${formatDateEs(dateFrom)} – ${formatDateEs(dateTo)}`}
          titleVariant="section"
          className="hostly-section-header--operational w-full min-w-0 flex-1"
        />
        <AnalyticsDateRangeFields
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
        <Link
          href={detailHref}
          className="hostly-button-secondary inline-flex min-h-11 shrink-0 items-center justify-center px-4"
        >
          Ver cobros
        </Link>
      </div>
    </div>
  );
}
