import type { ReactNode } from "react";
import { hostlyCx } from "../hostly-cx";

const hostlyMobileDensityStyles = `
@media (max-width: 1024px) {
  .hostly-productos-config-skin .hostly-productos-catalog-toolbar {
    padding: 8px 10px !important;
    gap: 8px !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-toolbar .hostly-config-canonical-search {
    box-shadow: none !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-filterbar,
  .hostly-productos-config-skin .hostly-productos-catalog-categorybar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-filterbar::-webkit-scrollbar,
  .hostly-productos-config-skin .hostly-productos-catalog-categorybar::-webkit-scrollbar {
    display: none;
  }
}

@media (max-width: 767px) {
  .hostly-productos-config-skin .hostly-productos-catalog-toolbar {
    padding: 6px 8px !important;
    border-bottom-color: rgba(148, 163, 184, 0.16) !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-toolbar .hostly-section-header__stack {
    display: none;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-toolbar > div:last-child {
    width: 100%;
    flex: 1 1 100%;
    gap: 0 !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-toolbar .hostly-config-canonical-search {
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
    flex-basis: 100% !important;
    min-height: 40px !important;
    padding: 8px 12px !important;
    border-radius: 12px !important;
    font-size: 14px !important;
    line-height: 1.2 !important;
    background: rgba(255, 255, 255, 0.98) !important;
  }

  .hostly-productos-config-skin .hostly-productos-carta-food-drink-segment {
    padding: 4px 8px !important;
    overflow-x: auto;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
    scrollbar-width: none;
  }

  .hostly-productos-config-skin .hostly-productos-carta-food-drink-segment::-webkit-scrollbar {
    display: none;
  }

  .hostly-productos-config-skin .hostly-productos-carta-food-drink-segment button {
    min-height: 34px !important;
    padding: 5px 9px !important;
    font-size: 11px !important;
    line-height: 1.1 !important;
    white-space: nowrap;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-filterbar {
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    overscroll-behavior-x: contain;
    padding: 4px 8px !important;
    gap: 4px !important;
    border-bottom-color: rgba(148, 163, 184, 0.14) !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-filterbar > span:first-child {
    display: none;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-filterbar button,
  .hostly-productos-config-skin .hostly-productos-catalog-filterbar .hostly-productos-carta-filter-chip {
    flex: 0 0 auto;
    min-height: 34px !important;
    padding: 5px 9px !important;
    font-size: 11px !important;
    line-height: 1.1 !important;
    white-space: nowrap;
    border-radius: 10px !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-categorybar {
    padding: 4px 8px !important;
    gap: 4px !important;
    border-bottom-color: rgba(148, 163, 184, 0.14) !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-categorybar button {
    min-height: 32px !important;
    padding: 4px 9px !important;
    border-radius: 9px !important;
    font-size: 10.5px !important;
    font-weight: 720 !important;
    line-height: 1.1 !important;
  }

  .hostly-productos-config-skin .hostly-productos-catalog-list {
    min-height: 0;
  }

  .hostly-productos-config-skin .hostly-mobile-list-shell {
    gap: 5px;
  }

  .hostly-productos-config-skin .hostly-mobile-list-group__head {
    min-height: 30px;
    padding: 5px 8px;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item {
    padding: 9px 10px;
    gap: 6px;
    border-radius: 10px;
    box-shadow: none;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__body {
    gap: 8px;
    align-items: flex-start;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__main {
    gap: 3px;
    min-width: 0;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__name {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 14px;
    font-weight: 760;
    line-height: 1.18;
    letter-spacing: -0.012em;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__meta {
    gap: 3px;
    font-size: 10.5px;
    line-height: 1.18;
  }

  .hostly-productos-config-skin .hostly-productos-routing-recommendation-hint {
    display: none !important;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__aside {
    flex: 0 0 auto;
    gap: 3px;
    align-items: flex-end;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__price {
    font-size: 13px;
    font-weight: 760;
    line-height: 1.1;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__badges {
    gap: 3px;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item .hostly-status-badge,
  .hostly-productos-config-skin .hostly-mobile-list-item .hostly-productos-carta-table-chip {
    min-height: 19px;
    padding: 2px 5px;
    font-size: 9.5px;
    line-height: 1.05;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__actions {
    margin-top: 0;
    padding-top: 5px;
    border-top: 1px solid rgba(148, 163, 184, 0.11);
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__actions .hostly-row-actions {
    width: 100%;
    gap: 4px;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__actions .hostly-row-actions__btn {
    min-height: 34px;
    padding: 5px 8px;
    font-size: 10.5px;
    line-height: 1.1;
  }

  .hostly-productos-config-skin .hostly-mobile-list-item__actions .hostly-row-actions__btn--icon {
    width: 34px;
    min-width: 34px;
    padding-left: 0;
    padding-right: 0;
  }

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
      <style>{hostlyMobileDensityStyles}</style>
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
