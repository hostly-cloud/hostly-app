import type { HTMLAttributes, ReactNode } from "react";
import { hostlyCx } from "./hostly-cx";

export type HostlyDrawerProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
};

export function HostlyDrawer({
  title,
  description,
  actions,
  footer,
  className,
  children,
  ...rest
}: HostlyDrawerProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={hostlyCx("hostly-ds-drawer", className)}
      {...rest}
    >
      <header className="hostly-ds-drawer__header">
        <div className="hostly-ds-drawer__heading">
          <h2 className="hostly-ds-drawer__title">{title}</h2>
          {description ? <p className="hostly-ds-drawer__description">{description}</p> : null}
        </div>
        {actions ? <div className="hostly-ds-drawer__header-actions">{actions}</div> : null}
      </header>
      <div className="hostly-ds-drawer__body">{children}</div>
      {footer ? <footer className="hostly-ds-drawer__footer">{footer}</footer> : null}
    </div>
  );
}
