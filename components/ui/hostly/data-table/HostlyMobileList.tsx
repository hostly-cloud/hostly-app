import type { ReactNode } from "react";
import { hostlyCx } from "../hostly-cx";

const escandallosMobileDensityStyles = `
@media (max-width: 767px) {
  .hostly-data-table-viewport--escandallos .hostly-mobile-list-shell {
    gap: 6px;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item {
    padding: 10px 12px;
    gap: 7px;
    border-radius: 12px;
    box-shadow: none;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__body {
    align-items: flex-start;
    gap: 8px;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__main {
    min-width: 0;
    gap: 4px;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__title {
    min-width: 0;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__name {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 14px;
    font-weight: 750;
    line-height: 1.22;
    letter-spacing: -0.01em;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__meta {
    gap: 4px;
    font-size: 11px;
    line-height: 1.2;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__aside {
    flex: 0 0 auto;
    align-items: flex-end;
    gap: 3px;
  }

  .hostly-data-table-viewport--escandallos .hostly-status-badge,
  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__row-flags .hostly-status-badge {
    min-height: 20px;
    padding: 2px 6px;
    font-size: 10px;
    line-height: 1.1;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__extra {
    margin-top: 0;
  }

  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__mobile-fields {
    gap: 6px;
    margin-top: 1px;
  }

  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__mobile-fields--readonly {
    display: none;
  }

  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__mobile-fields:not(.hostly-recipe-editor__mobile-fields--readonly) .hostly-carta-config-form-field {
    gap: 3px;
  }

  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__mobile-fields:not(.hostly-recipe-editor__mobile-fields--readonly) .hostly-carta-config-form-label {
    font-size: 10px;
  }

  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__money-input {
    min-height: 36px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item__actions {
    margin-top: 0;
    padding-top: 6px;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
  }

  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__mobile-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    width: 100%;
  }

  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__mobile-actions > button,
  .hostly-data-table-viewport--escandallos .hostly-recipe-editor__mobile-actions > a {
    min-height: 36px;
    padding: 6px 10px;
    font-size: 11px;
    line-height: 1.15;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item:has(.hostly-recipe-editor__mobile-fields--readonly) .hostly-recipe-editor__mobile-actions > :first-child {
    display: none;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item:has(.hostly-recipe-editor__mobile-fields--readonly) .hostly-mobile-list-item__actions {
    padding-top: 4px;
  }

  .hostly-data-table-viewport--escandallos .hostly-mobile-list-item:has(.hostly-recipe-editor__mobile-fields--readonly) .hostly-recipe-editor__mobile-actions > :last-child {
    margin-left: auto;
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    padding-left: 8px;
    padding-right: 8px;
  }
}
`;

export function HostlyMobileList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={hostlyCx("hostly-mobile-list-shell", className)}>
      <style>{escandallosMobileDensityStyles}</style>
      {children}
    </div>
  );
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
