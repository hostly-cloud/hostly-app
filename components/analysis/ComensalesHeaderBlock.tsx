import { AnalyticsDateRangeFields } from "@/components/analysis/AnalyticsDateRangeFields";
import { HostlySectionHeader } from "@/components/ui/hostly";

export type ComensalesHeaderBlockProps = {
  dateFrom: string;
  dateTo: string;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
  formatDateEs: (date: string) => string;
};

export function ComensalesHeaderBlock({
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  formatDateEs,
}: ComensalesHeaderBlockProps) {
  return (
    <div className="hostly-analytics-toolbar">
      <div className="hostly-analytics-toolbar__filters min-w-0 flex-1 flex-col items-stretch gap-[var(--hostly-op-gap-sm)] sm:flex-row sm:items-center">
        <HostlySectionHeader
          title="Comensales"
          description={`Del ${formatDateEs(dateFrom)} al ${formatDateEs(dateTo)}`}
          titleVariant="section"
          className="hostly-section-header--operational w-full min-w-0 flex-1"
        />
        <AnalyticsDateRangeFields
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
        />
      </div>
    </div>
  );
}
