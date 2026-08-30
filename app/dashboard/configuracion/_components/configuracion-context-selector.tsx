"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Building2,
  ChefHat,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Layers3,
  LayoutGrid,
  Package,
  Printer,
  Puzzle,
  ReceiptText,
  Sparkles,
  Tags,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  CONFIG_NAV_GROUPS,
  configPathnameMatches,
  type ConfigNavLeaf,
} from "@/lib/configuracion/config-nav";
import { LanguageSwitcher } from "@/components/language-switcher";

type ConfigContextItem = ConfigNavLeaf & {
  Icon: LucideIcon;
};

type ConfigContextGroup = {
  id: string;
  label: string;
  children: ConfigContextItem[];
};

const NAV_ICON_BY_HREF: Record<string, LucideIcon> = {
  "/dashboard/configuracion/operacion": Workflow,
  "/dashboard/configuracion/estaciones": ChefHat,
  "/dashboard/configuracion/impresoras": Printer,
  "/dashboard/configuracion/carta/familias": Layers3,
  "/dashboard/configuracion/carta/categorias": Tags,
  "/dashboard/configuracion/carta/productos": Package,
  "/dashboard/configuracion/modificadores": Puzzle,
  "/dashboard/configuracion/carta/escandallos": ReceiptText,
  "/dashboard/configuracion/carta/importacion": Sparkles,
  "/dashboard/configuracion/carta/import-workspace": ClipboardList,
  "/dashboard/configuracion/espacios/zonas": Layers3,
  "/dashboard/configuracion/espacios/editor-v2": LayoutGrid,
  "/dashboard/configuracion/familias-producto": Boxes,
  "/dashboard/configuracion/empleados": Users,
  "/dashboard/configuracion/empresa": Building2,
  "/dashboard/configuracion/integraciones": CircleDollarSign,
};

const CONTEXT_GROUPS: ConfigContextGroup[] = CONFIG_NAV_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  children: group.children.map((item) => ({
    ...item,
    Icon: NAV_ICON_BY_HREF[item.href] ?? Boxes,
  })),
}));

function findActiveContext(pathname: string) {
  for (const group of CONTEXT_GROUPS) {
    const item = group.children.find((child) =>
      configPathnameMatches(pathname, child.href),
    );
    if (item) {
      return { group, item };
    }
  }
  return null;
}

export function ConfiguracionContextSelector() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeContext = useMemo(() => findActiveContext(pathname), [pathname]);
  const activeLabel = activeContext?.item.label ?? "Configuración";
  const activeGroup = activeContext?.group.label ?? "Hub";
  const ActiveIcon = activeContext?.item.Icon ?? Boxes;

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`hostly-config-context-selector${open ? " is-open" : ""}`}
    >
      <div className="hostly-config-context-selector__bar">
        <div className="hostly-config-context-selector__main">
          <Link
            href="/dashboard/configuracion"
            className="hostly-config-context-selector__hub"
            onClick={() => setOpen(false)}
          >
            Configuración
          </Link>
          <button
            type="button"
            className="hostly-config-context-selector__trigger"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? "hostly-config-context-panel" : undefined}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="hostly-config-context-selector__trigger-icon" aria-hidden>
              <ActiveIcon size={17} strokeWidth={2.25} />
            </span>
            <span className="hostly-config-context-selector__trigger-text">
              <span className="hostly-config-context-selector__group">
                {activeGroup}
              </span>
              <span className="hostly-config-context-selector__label">
                {activeLabel}
              </span>
            </span>
            <ChevronDown
              className="hostly-config-context-selector__chevron"
              size={16}
              strokeWidth={2.4}
              aria-hidden
            />
          </button>
        </div>
        <LanguageSwitcher className="hostly-config-context-selector__language" />
      </div>

      {open ? (
        <button
          type="button"
          className="hostly-config-context-selector__overlay"
          aria-label="Cerrar selector de configuración"
          onClick={() => setOpen(false)}
        />
      ) : null}

      {open ? (
        <div
          id="hostly-config-context-panel"
          className="hostly-config-context-selector__panel"
          role="dialog"
          aria-label="Cambiar área de configuración"
        >
          <div className="hostly-config-context-selector__sheet-header">
            <div>
              <p className="hostly-config-context-selector__sheet-kicker">
                Cambiar contexto
              </p>
              <p className="hostly-config-context-selector__sheet-title">
                Configuración
              </p>
            </div>
            <button
              type="button"
              className="hostly-config-context-selector__close"
              aria-label="Cerrar selector"
              onClick={() => setOpen(false)}
            >
              <X size={18} strokeWidth={2.3} />
            </button>
          </div>

          <div className="hostly-config-context-selector__groups">
            {CONTEXT_GROUPS.map((group) => (
              <section
                key={group.id}
                className="hostly-config-context-selector__section"
              >
                <p className="hostly-config-context-selector__section-label">
                  {group.label}
                </p>
                <div className="hostly-config-context-selector__items">
                  {group.children.map(({ href, label, Icon }) => {
                    const active = configPathnameMatches(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`hostly-config-context-selector__item${
                          active ? " is-active" : ""
                        }`}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setOpen(false)}
                      >
                        <span
                          className="hostly-config-context-selector__item-icon"
                          aria-hidden
                        >
                          <Icon size={17} strokeWidth={2.2} />
                        </span>
                        <span className="hostly-config-context-selector__item-label">
                          {label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
