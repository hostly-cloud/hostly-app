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
  const handleDateFromChange = (value: string) => {
    onDateFromChange(value);
    if (value && dateTo && value > dateTo) {
      onDateToChange(value);
    }
  };

  const handleDateToChange = (value: string) => {
    onDateToChange(value);
    if (value && dateFrom && value < dateFrom) {
      onDateFromChange(value);
    }
  };

  return (
    <div className={hostlyCx("hostly-analytics-date-fields", className)} lang="es-ES">
      <label className="hostly-analysis-date-field" htmlFor="hostly-analytics-date-from">
        <span className="hostly-analysis-date-field__label">Desde</span>
        <HostlyInput
          id="hostly-analytics-date-from"
          type="date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => handleDateFromChange(e.target.value)}
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
          min={dateFrom || undefined}
          onChange={(e) => handleDateToChange(e.target.value)}
          className="hostly-input--toolbar-compact"
          aria-label="Hasta"
        />
      </label>
    </div>
  );
}
