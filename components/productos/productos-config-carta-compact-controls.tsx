"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { HostlyButton } from "@/components/ui/hostly";
import type { TranslateFn } from "@/lib/i18n";
import {
  PRODUCT_CATEGORY_ALL_ID,
  type ProductCategoryNavigationOption,
} from "@/lib/productos/product-category-navigation";
import { filterProductCategoryNavigationOptions } from "@/lib/productos/product-ui-navigation";

const TOOLBAR_TOUCH_STYLE = { minHeight: 40 } as const;
const MENU_TOUCH_STYLE = { minHeight: 44 } as const;

export type ConfigCartaListFilterId =
  | "activos"
  | "inactivos"
  | "todos"
  | "enCarta"
  | "fueraCarta";

export type ConfigCartaStatusFilterCounts = {
  activos: number;
  inactivos: number;
  total: number;
  enCarta: number;
  fueraCarta: number;
};

type ConfigCartaStatusFilterSelectProps = {
  value: string;
  counts: ConfigCartaStatusFilterCounts;
  onChange: (id: ConfigCartaListFilterId) => void;
  t: TranslateFn;
};

const STATUS_FILTER_IDS: ConfigCartaListFilterId[] = [
  "activos",
  "inactivos",
  "todos",
  "enCarta",
  "fueraCarta",
];

export function isConfigCartaStatusListFilter(
  value: string,
): value is ConfigCartaListFilterId {
  return STATUS_FILTER_IDS.includes(value as ConfigCartaListFilterId);
}

export function ConfigCartaStatusFilterSelect({
  value,
  counts,
  onChange,
  t,
}: ConfigCartaStatusFilterSelectProps) {
  const selectValue = isConfigCartaStatusListFilter(value) ? value : "todos";

  return (
    <label className="hostly-productos-carta-status-filter">
      <span className="hostly-productos-carta-status-filter__prefix" aria-hidden>
        Estado
      </span>
      <select
        className="hostly-select hostly-select--toolbar-compact hostly-productos-carta-status-filter__select"
        style={TOOLBAR_TOUCH_STYLE}
        value={selectValue}
        onChange={(e) => onChange(e.target.value as ConfigCartaListFilterId)}
        aria-label="Filtrar por estado del producto y publicación en carta"
      >
        <optgroup label="Estado">
          <option value="activos">{`Activos (${counts.activos})`}</option>
          <option value="inactivos">{`Inactivos (${counts.inactivos})`}</option>
          <option value="todos">{`Todos (${counts.total})`}</option>
        </optgroup>
        <optgroup label="Publicación en carta">
          <option value="enCarta">{`${t("productos.pubEnCarta")} (${counts.enCarta})`}</option>
          <option value="fueraCarta">{`${t("productos.pubFueraCarta")} (${counts.fueraCarta})`}</option>
        </optgroup>
      </select>
    </label>
  );
}

type ProductosCategoryNavigationProps = {
  options: readonly ProductCategoryNavigationOption[];
  value: string;
  onChange: (id: string) => void;
  categoriesLabel: string;
};

export function ProductosCategoryNavigation({
  options,
  value,
  onChange,
  categoriesLabel,
}: ProductosCategoryNavigationProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const allOption = options.find((option) => option.kind === "all");
  const categoryOptions = options.filter((option) => option.kind !== "all");
  const filteredCategoryOptions = useMemo(
    () => filterProductCategoryNavigationOptions(categoryOptions, query),
    [categoryOptions, query],
  );
  const activeOption = options.find((option) => option.id === value) ?? allOption;
  const categorySelected = activeOption?.kind !== "all";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const selectOption = (option: ProductCategoryNavigationOption) => {
    onChange(option.id);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(0);
    }
  };

  const handleOptionKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(Math.min(index + 1, filteredCategoryOptions.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (index === 0) searchRef.current?.focus();
      else focusOption(index - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusOption(filteredCategoryOptions.length - 1);
    }
  };

  return (
    <div
      ref={rootRef}
      className="hostly-productos-category-navigation"
      aria-label={categoriesLabel}
    >
      {allOption ? (
        <HostlyButton
          variant="chip"
          size="compact"
          active={value === PRODUCT_CATEGORY_ALL_ID}
          style={TOOLBAR_TOUCH_STYLE}
          className={`hostly-productos-category-navigation__all${
            value === PRODUCT_CATEGORY_ALL_ID ? " is-active" : ""
          }`}
          onClick={() => selectOption(allOption)}
        >
          <span>{allOption.label}</span>
          <span className="hostly-productos-category-navigation__count">{allOption.count}</span>
        </HostlyButton>
      ) : null}
      <HostlyButton
        ref={triggerRef}
        variant="tool"
        size="compact"
        active={categorySelected}
        style={TOOLBAR_TOUCH_STYLE}
        className={`hostly-productos-category-navigation__trigger${
          categorySelected ? " is-active" : ""
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="hostly-productos-category-navigation-options"
        disabled={categoryOptions.length === 0}
        onClick={() => {
          if (open) setQuery("");
          setOpen((current) => !current);
        }}
      >
        <span className="hostly-productos-category-navigation__trigger-copy">
          {categorySelected ? activeOption?.label : categoriesLabel}
        </span>
        {categorySelected && activeOption ? (
          <span className="hostly-productos-category-navigation__count">{activeOption.count}</span>
        ) : (
          <span className="hostly-productos-category-navigation__count">{categoryOptions.length}</span>
        )}
        <span className="hostly-productos-category-navigation__caret" aria-hidden>
          ▾
        </span>
      </HostlyButton>
      {open ? (
        <div
          id="hostly-productos-category-navigation-panel"
          className="hostly-productos-category-navigation__panel"
        >
          <div className="hostly-productos-category-navigation__panel-head">
            <span>{categoriesLabel}</span>
            <span>{categoryOptions.length}</span>
          </div>
          {categoryOptions.length > 7 ? (
            <div className="hostly-productos-category-navigation__search-wrap">
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar categoría..."
                aria-label="Buscar categoría"
                className="hostly-config-canonical-search hostly-productos-category-navigation__search"
                style={TOOLBAR_TOUCH_STYLE}
              />
            </div>
          ) : null}
          <div
            id="hostly-productos-category-navigation-options"
            className="hostly-productos-category-navigation__options"
            role="listbox"
            aria-label={categoriesLabel}
          >
            {filteredCategoryOptions.length > 0 ? (
              filteredCategoryOptions.map((option, index) => (
                <HostlyButton
                  key={option.id}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  variant="ghost"
                  size="touch"
                  active={option.id === value}
                  role="option"
                  style={MENU_TOUCH_STYLE}
                  aria-selected={option.id === value}
                  className={`hostly-productos-category-navigation__option${
                    option.id === value ? " is-active" : ""
                  }`}
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  onClick={() => selectOption(option)}
                >
                  <span>{option.label}</span>
                  <span className="hostly-productos-category-navigation__count">{option.count}</span>
                </HostlyButton>
              ))
            ) : (
              <p className="hostly-productos-category-navigation__empty" role="status">
                No hay categorías que coincidan.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type BulkMenuItem = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledTitle?: string;
  tone?: "danger";
};

type ProductosCompactBulkActionsMenuProps = {
  items: BulkMenuItem[];
};

export function ProductosCompactBulkActionsMenu({
  items,
}: ProductosCompactBulkActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const firstEnabled = itemRefs.current.find((element) => element && !element.disabled);
      firstEnabled?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const focusRelativeItem = (currentIndex: number, direction: 1 | -1) => {
    if (items.length === 0) return;
    for (let step = 1; step <= items.length; step += 1) {
      const nextIndex = (currentIndex + direction * step + items.length) % items.length;
      const candidate = itemRefs.current[nextIndex];
      if (candidate && !candidate.disabled) {
        candidate.focus();
        return;
      }
    }
  };

  return (
    <div ref={rootRef} className="hostly-productos-bulk-actions-menu">
      <HostlyButton
        ref={triggerRef}
        variant="tool"
        size="compact"
        active={open}
        style={TOOLBAR_TOUCH_STYLE}
        className="hostly-productos-bulk-actions-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        Acciones
        <span className="hostly-productos-bulk-actions-menu__caret" aria-hidden>
          ▼
        </span>
      </HostlyButton>
      {open ? (
        <div className="hostly-productos-bulk-actions-menu__panel" role="menu">
          {items.map((item, index) => (
            <HostlyButton
              key={item.key}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              variant={item.tone === "danger" ? "destructive" : "ghost"}
              size="touch"
              role="menuitem"
              style={MENU_TOUCH_STYLE}
              className={`hostly-productos-bulk-actions-menu__item${
                item.tone === "danger" ? " hostly-productos-bulk-actions-menu__item--danger" : ""
              }`}
              disabled={item.disabled}
              title={item.disabled ? item.disabledTitle : undefined}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusRelativeItem(index, 1);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  focusRelativeItem(index, -1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  const firstEnabled = itemRefs.current.find((element) => element && !element.disabled);
                  firstEnabled?.focus();
                } else if (event.key === "End") {
                  event.preventDefault();
                  const lastEnabled = [...itemRefs.current]
                    .reverse()
                    .find((element) => element && !element.disabled);
                  lastEnabled?.focus();
                }
              }}
              onClick={() => {
                setOpen(false);
                item.onClick();
                triggerRef.current?.focus();
              }}
            >
              {item.label}
            </HostlyButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ConfigCartaCompactFilterRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["hostly-productos-carta-compact-filters", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
