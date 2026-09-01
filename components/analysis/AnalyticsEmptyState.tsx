import type { ReactNode } from "react";

export type AnalyticsEmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: string;
  hint?: string;
  role?: "status" | "alert";
  compact?: boolean;
};

export function AnalyticsEmptyState({
  icon,
  title,
  description,
  hint,
  role,
  compact = false,
}: AnalyticsEmptyStateProps) {
  return (
    <div
      className={`hostly-analysis-empty${compact ? " hostly-analysis-empty--compact" : ""}`}
      role={role}
      aria-live={role === "status" ? "polite" : undefined}
    >
      <span className="hostly-analysis-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="hostly-analysis-empty__copy">
        <h3>{title}</h3>
        <p>{description}</p>
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}
