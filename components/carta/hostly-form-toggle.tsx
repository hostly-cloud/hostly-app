import type { InputHTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "@/components/ui/hostly/hostly-cx";

export type HostlyFormToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
};

/** Checkbox accesible con presentación operacional Hostly v2. */
export function HostlyFormToggle({
  label,
  hint,
  className,
  disabled,
  ...rest
}: HostlyFormToggleProps) {
  return (
    <label className={hostlyCx("hostly-form-toggle", disabled && "is-disabled", className)}>
      <input type="checkbox" className="hostly-form-toggle__input" disabled={disabled} {...rest} />
      <span className="hostly-form-toggle__control" aria-hidden />
      <span className="hostly-form-toggle__copy">
        <span className="hostly-form-toggle__label">{label}</span>
        {hint ? <span className="hostly-form-toggle__hint">{hint}</span> : null}
      </span>
    </label>
  );
}
