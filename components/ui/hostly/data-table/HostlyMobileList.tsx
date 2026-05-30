import type { ReactNode } from "react";
import { hostlyCx } from "../hostly-cx";

export function HostlyMobileList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={hostlyCx("hostly-mobile-list-shell", className)}>{children}</div>;
}

export function HostlyMobileListGroup({
  children,
  title,
  count,
}: {
  children: ReactNode;
  title: string;
  count?: number;
}) {
  return (
    <section className="hostly-mobile-list-group">
      <header className="hostly-mobile-list-group__head">
        <span className="hostly-mobile-list-group__title">{title}</span>
        {typeof count === "number" ? (
          <span className="hostly-mobile-list-group__count">{count}</span>
        ) : null}
      </header>
      <div className="hostly-mobile-list-group__items">{children}</div>
    </section>
  );
}

export type HostlyMobileListItemProps = {
  children?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
};

export function HostlyMobileListItem({
  title,
  meta,
  aside,
  actions,
  leading,
  selected,
  onClick,
  className,
  children,
}: HostlyMobileListItemProps) {
  return (
    <article
      className={hostlyCx("hostly-mobile-list-item", selected && "is-selected", className)}
      onClick={onClick}
    >
      {leading ? <div className="hostly-mobile-list-item__leading">{leading}</div> : null}
      <div className="hostly-mobile-list-item__body">
        <div className="hostly-mobile-list-item__main">
          <div className="hostly-mobile-list-item__title">{title}</div>
          {meta ? <div className="hostly-mobile-list-item__meta">{meta}</div> : null}
        </div>
        {aside ? <div className="hostly-mobile-list-item__aside">{aside}</div> : null}
      </div>
      {children ? <div className="hostly-mobile-list-item__extra">{children}</div> : null}
      {actions ? <div className="hostly-mobile-list-item__actions">{actions}</div> : null}
    </article>
  );
}
