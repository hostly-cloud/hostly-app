import Link from "next/link";
import type { ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlyOperationalEmptyAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  prefetch?: boolean;
};

export type HostlyOperationalEmptyStateProps = {
  title: string;
  text: string;
  hints?: readonly string[];
  icon?: ReactNode;
  /** Custom actions row; overrides `primaryAction` / `secondaryAction` when set. */
  actions?: ReactNode;
  primaryAction?: HostlyOperationalEmptyAction;
  secondaryAction?: HostlyOperationalEmptyAction;
  className?: string;
};

function renderAction(action: HostlyOperationalEmptyAction, key: string) {
  const className = hostlyCx(
    action.variant === "secondary" ? "hostly-button-secondary" : "hostly-button-primary",
    "hostly-button-compact",
    "hostly-operational-empty__action",
  );

  if (action.href) {
    return (
      <Link
        key={key}
        href={action.href}
        className={className}
        prefetch={action.prefetch ?? true}
      >
        {action.label}
      </Link>
    );
  }

  return (
    <button key={key} type="button" className={className} onClick={action.onClick}>
      {action.label}
    </button>
  );
}

export function HostlyOperationalEmptyState({
  title,
  text,
  hints,
  icon,
  actions,
  primaryAction,
  secondaryAction,
  className,
}: HostlyOperationalEmptyStateProps) {
  const actionRow =
    actions ??
    (primaryAction || secondaryAction ? (
      <>
        {primaryAction ? renderAction(primaryAction, "primary") : null}
        {secondaryAction ? renderAction(secondaryAction, "secondary") : null}
      </>
    ) : null);

  return (
    <div className={hostlyCx("hostly-operational-empty", className)}>
      <div className="hostly-operational-empty__header">
        {icon ?? (
          <span className="hostly-operational-empty__icon" aria-hidden>
            ◫
          </span>
        )}
        <div className="hostly-operational-empty__content">
          <h3 className="hostly-operational-empty__title">{title}</h3>
          <p className="hostly-operational-empty__text">{text}</p>
        </div>
      </div>

      {actionRow ? <div className="hostly-operational-empty__actions">{actionRow}</div> : null}

      {hints && hints.length > 0 ? (
        <ul className="hostly-operational-empty__hints">
          {hints.map((hint) => (
            <li key={hint} className="hostly-operational-empty__hint">
              {hint}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
