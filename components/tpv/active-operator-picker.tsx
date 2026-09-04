"use client";

import { HostlyBackButton } from "@/components/hostly/back-button";
import { useI18n } from "@/components/i18n-provider";
import { HostlyButton } from "@/components/ui/hostly";
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
      className="hostly-tpv-operator-picker"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tpv-active-operator-title"
    >
      <div className="hostly-tpv-operator-picker__exit">
        <HostlyBackButton
          href="/dashboard"
          label="Dashboard"
          ariaLabel="Volver al dashboard"
          tone="light"
          moduleChrome
        />
      </div>
      <div className="hostly-tpv-operator-picker__panel">
        <h1
          id="tpv-active-operator-title"
          className="hostly-tpv-operator-picker__title"
        >
          {t("activeOperator.title")}
        </h1>
        <p className="hostly-tpv-operator-picker__subtitle">
          {t("activeOperator.subtitle")}
        </p>

        <div className="hostly-tpv-operator-picker__list">
          {options.map((option) => (
            <HostlyButton
              key={option.id}
              variant="secondary"
              size="touch"
              onClick={() => onSelect(option)}
              className="hostly-tpv-operator-picker__card"
            >
              <span className="hostly-tpv-operator-picker__card-name">
                {option.name}
              </span>
            </HostlyButton>
          ))}
        </div>

        {lastOperator ? (
          <div className="hostly-tpv-operator-picker__last-wrap">
            <p className="hostly-tpv-operator-picker__last-pill">
              <span className="hostly-tpv-operator-picker__last-label">
                {t("activeOperator.lastOperator")}:
              </span>{" "}
              <span className="hostly-tpv-operator-picker__last-name">
                {lastOperator.name}
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
