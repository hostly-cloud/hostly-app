import type { ReactNode } from "react";

export type AnalyticsSectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  children?: ReactNode;
};

export function AnalyticsSectionHeader({
  eyebrow,
  title,
  description,
  icon,
  children,
}: AnalyticsSectionHeaderProps) {
  return (
    <div className="hostly-analysis-section-head">
      <div className="hostly-analysis-section-head__identity">
        <span className="hostly-analysis-section-head__icon" aria-hidden="true">
          {icon}
        </span>
        <div className="hostly-analysis-section-head__copy">
          <span className="hostly-analysis-section-head__eyebrow">{eyebrow}</span>
          <h2 className="hostly-analysis-section-head__title">{title}</h2>
          <p className="hostly-analysis-section-head__description">{description}</p>
        </div>
      </div>
      {children ? <div className="hostly-analysis-section-head__aside">{children}</div> : null}
    </div>
  );
}
