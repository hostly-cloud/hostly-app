"use client";

import { useActiveOperator } from "@/components/tpv/active-operator-context";
import { useI18n } from "@/components/i18n-provider";

type ActiveOperatorTopBarButtonProps = {
  className?: string;
};

export function ActiveOperatorTopBarButton({
  className,
}: ActiveOperatorTopBarButtonProps = {}) {
  const { activeOperator, requestOperatorChange } = useActiveOperator();
  const { t } = useI18n();

  if (!activeOperator) return null;

  return (
    <button
      type="button"
      onClick={requestOperatorChange}
      className={`hostly-tpv-active-operator-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[rgba(15,23,42,0.1)] bg-white px-3 py-2 text-sm font-semibold text-[var(--hostly-ink)] shadow-sm transition-colors hover:bg-[rgba(15,23,42,0.03)] touch-manipulation${className ? ` ${className}` : ""}`}
      aria-label={`${activeOperator.activeOperatorName} · ${t("activeOperator.change")}`}
    >
      <span className="hostly-tpv-active-operator-btn__name">
        {activeOperator.activeOperatorName}
      </span>
      <span className="text-[var(--hostly-ink-muted)]">·</span>
      <span className="hostly-tpv-active-operator-btn__change text-[var(--hostly-ink-muted)]">
        {t("activeOperator.change")}
      </span>
    </button>
  );
}
