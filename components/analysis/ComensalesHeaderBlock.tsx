import { AnalyticsDateRangeFields } from "@/components/analysis/AnalyticsDateRangeFields";
import { AnalyticsSectionHeader } from "@/components/analysis/AnalyticsSectionHeader";
import { CalendarCheck2 } from "lucide-react";

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
    <div className="hostly-analysis-header-card">
      <AnalyticsSectionHeader
        eyebrow="Reservas y asistencia"
        title="Comensales"
        description={`${formatDateEs(dateFrom)} – ${formatDateEs(dateTo)} · Previsión y asistencia real`}
        icon={<CalendarCheck2 size={21} strokeWidth={2.1} />}
      />
      <div className="hostly-analysis-filterbar">
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
