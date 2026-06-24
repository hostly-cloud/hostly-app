import type { ReactNode } from "react";
import { HostlyCard } from "./HostlyCard";
import { hostlyCx } from "./hostly-cx";

export function HostlyLoadingState({
  label = "Cargando…",
  embedded,
  fullPage,
  className,
}: {
  label?: ReactNode;
  embedded?: boolean;
  fullPage?: boolean;
  className?: string;
}) {
  return (
    <div className={hostlyCx("hostly-ds-state", embedded && "is-embedded", fullPage && "is-full-page", className)}>
      <HostlyCard family="configuration" className="hostly-ds-state__panel" role="status">
        <span className="hostly-ds-state__spinner" aria-hidden />
        <span>{label}</span>
      </HostlyCard>
    </div>
  );
}

export function HostlyPermissionState({
  title = "Acceso restringido",
  children,
  embedded,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  embedded?: boolean;
  className?: string;
}) {
  return (
    <div className={hostlyCx("hostly-ds-state", embedded && "is-embedded", className)}>
      <HostlyCard family="configuration" className="hostly-ds-state__panel" role="status">
        <div>
          <h2 className="hostly-ds-state__title">{title}</h2>
          <div className="hostly-ds-state__copy">{children}</div>
        </div>
      </HostlyCard>
    </div>
  );
}
