"use client";

import { useI18n } from "@/components/i18n-provider";
import type { TpvOperatorPickerOption } from "@/lib/tpv/active-operator-session";

type ActiveOperatorPickerProps = {
  options: TpvOperatorPickerOption[];
  lastOperator: { id: string; name: string } | null;
  onSelect: (option: TpvOperatorPickerOption) => void;
};

export function ActiveOperatorPicker({
  options,
  lastOperator,
  onSelect,
}: ActiveOperatorPickerProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-0 z-[120] flex min-h-[100dvh] flex-col items-center justify-center bg-[linear-gradient(180deg,var(--hostly-surface-page-soft)_0%,var(--hostly-surface-page)_52%,#e8eff6_100%)] px-4 py-8 text-[var(--hostly-ink)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tpv-active-operator-title"
    >
      <div className="w-full max-w-[520px]">
        <h1
          id="tpv-active-operator-title"
          className="mb-2 text-center text-[clamp(1.5rem,4vw,2rem)] font-bold tracking-tight"
        >
          {t("activeOperator.title")}
        </h1>
        <p className="mb-8 text-center text-sm text-[var(--hostly-ink-muted)]">
          {t("activeOperator.subtitle")}
        </p>

        <div className="flex flex-col gap-3">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option)}
              className="min-h-[64px] rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white px-5 py-4 text-left text-lg font-semibold text-[var(--hostly-ink)] shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-transform active:scale-[0.985] hover:border-[rgba(15,23,42,0.14)] hover:shadow-[0_10px_28px_rgba(15,23,42,0.08)]"
            >
              {option.name}
            </button>
          ))}
        </div>

        {lastOperator ? (
          <p className="mt-8 text-center text-sm text-[var(--hostly-ink-muted)]">
            {t("activeOperator.lastOperator")}:{" "}
            <span className="font-semibold text-[var(--hostly-ink)]">
              {lastOperator.name}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
