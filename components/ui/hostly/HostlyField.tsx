import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { hostlyCx } from "./hostly-cx";

export function HostlyField({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={hostlyCx("hostly-ds-field", className)}>
      <span className="hostly-ds-field__label hostly-type-caption">{label}</span>
      {children}
      {error ? (
        <span className="hostly-ds-field__message hostly-ds-field__message--error hostly-type-caption">{error}</span>
      ) : hint ? (
        <span className="hostly-ds-field__message hostly-type-caption">{hint}</span>
      ) : null}
    </label>
  );
}

export function HostlyInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={hostlyCx("hostly-input", className)} {...rest} />;
}

export function HostlySelect({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={hostlyCx("hostly-select", className)} {...rest} />;
}

export function HostlyTextarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={hostlyCx("hostly-textarea", className)} {...rest} />;
}

export function HostlyCheckbox({
  label,
  className,
  disabled,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
}) {
  return (
    <label className={hostlyCx("hostly-ds-checkbox", disabled && "is-disabled", className)}>
      <input type="checkbox" className="hostly-ds-checkbox__input" disabled={disabled} {...rest} />
      <span className="hostly-ds-checkbox__control" aria-hidden />
      <span className="hostly-ds-checkbox__label">{label}</span>
    </label>
  );
}
