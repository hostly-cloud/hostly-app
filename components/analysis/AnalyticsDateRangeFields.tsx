import { HostlyInput, hostlyCx } from "@/components/ui/hostly";

export type AnalyticsDateRangeFieldsProps = {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  className?: string;
};

export function AnalyticsDateRangeFields({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  className,
}: AnalyticsDateRangeFieldsProps) {
  return (
    <div className={hostlyCx("hostly-analytics-date-fields", className)}>
      <label className="hostly-analysis-date-field" htmlFor="hostly-analytics-date-from">
        <span className="hostly-analysis-date-field__label">Desde</span>
        <HostlyInput
          id="hostly-analytics-date-from"
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="hostly-input--toolbar-compact"
          aria-label="Desde"
        />
      </label>
      <label className="hostly-analysis-date-field" htmlFor="hostly-analytics-date-to">
        <span className="hostly-analysis-date-field__label">Hasta</span>
        <HostlyInput
          id="hostly-analytics-date-to"
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="hostly-input--toolbar-compact"
          aria-label="Hasta"
        />
      </label>
    </div>
  );
}
