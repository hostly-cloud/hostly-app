"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import ModulePageShell from "@/components/module-page-shell";
import { HostlyBrandMark } from "@/components/brand/hostly-brand";

type HubCard = {
  id: string;
  title: string;
  description: string;
  href?: string;
  status: string;
  statusTone: "ok" | "warn" | "neutral";
  visual: string;
  icon: ReactNode;
};

const RESTAURANT_STATUS = [
  { label: "Perfil del local", tone: "neutral" as const },
  { label: "Carta y productos", tone: "neutral" as const },
  { label: "Operación y TPV", tone: "neutral" as const },
  { label: "Equipo y permisos", tone: "neutral" as const },
  { label: "Impresión y dispositivos", tone: "neutral" as const },
];

const CONFIG_ROUTES = {
  restaurant: "/dashboard/configuracion/empresa",
  operation: "/dashboard/configuracion/operacion",
  stations: "/dashboard/configuracion/estaciones",
  zones: "/dashboard/configuracion/espacios/zonas",
  spaceEditor: "/dashboard/configuracion/espacios/editor-v2",
  menuCategories: "/dashboard/configuracion/carta/categorias",
  menuFamilies: "/dashboard/configuracion/carta/familias",
  products: "/dashboard/configuracion/carta/productos",
  modifiers: "/dashboard/configuracion/modificadores",
  team: "/dashboard/configuracion/empleados",
  printers: "/dashboard/configuracion/impresoras",
  printQueue: "/dashboard/configuracion/impresoras/cola",
  aiImport: "/dashboard/configuracion/carta/importacion",
  integrations: "/dashboard/configuracion/integraciones",
} as const;

const HUB_CARDS: HubCard[] = [
  {
    id: "restaurant",
    title: "Mi restaurante",
    description: "Nombre, dirección, horarios y datos del local.",
    href: CONFIG_ROUTES.restaurant,
    status: "Configurar perfil",
    statusTone: "neutral",
    visual: "restaurant",
    icon: <IconRestaurant />,
  },
  {
    id: "operation",
    title: "Mi operación",
    description: "Estaciones, zonas, mesas y flujo de servicio.",
    href: CONFIG_ROUTES.operation,
    status: "Configurar operación",
    statusTone: "neutral",
    visual: "operation",
    icon: <IconOperation />,
  },
  {
    id: "menu",
    title: "Mi carta",
    description: "Categorías, familias, precios y estructura de la oferta.",
    href: CONFIG_ROUTES.menuCategories,
    status: "Gestionar carta",
    statusTone: "neutral",
    visual: "menu",
    icon: <IconMenu />,
  },
  {
    id: "products",
    title: "Mis productos",
    description: "Catálogo de venta, alérgenos, variantes y modificadores.",
    href: CONFIG_ROUTES.products,
    status: "Gestionar catálogo",
    statusTone: "neutral",
    visual: "products",
    icon: <IconProducts />,
  },
  {
    id: "team",
    title: "Mi equipo",
    description: "Empleados, roles, accesos e invitaciones.",
    href: CONFIG_ROUTES.team,
    status: "Gestionar accesos",
    statusTone: "neutral",
    visual: "team",
    icon: <IconTeam />,
  },
  {
    id: "cashier",
    title: "Mi caja",
    description: "IVA, tickets, métodos de pago y cierre de caja.",
    status: "Próximamente",
    statusTone: "neutral",
    visual: "cashier",
    icon: <IconCashier />,
  },
  {
    id: "devices",
    title: "Dispositivos",
    description: "Impresoras, cola de impresión y hardware conectado.",
    href: CONFIG_ROUTES.printers,
    status: "Configurar impresión",
    statusTone: "neutral",
    visual: "devices",
    icon: <IconDevices />,
  },
  {
    id: "ai",
    title: "IA",
    description: "Importación inteligente y asistentes de carta.",
    href: CONFIG_ROUTES.aiImport,
    status: "Disponible",
    statusTone: "neutral",
    visual: "ai",
    icon: <IconAI />,
  },
  {
    id: "integrations",
    title: "Integraciones",
    description: "Conexiones con delivery, pagos y herramientas externas.",
    href: CONFIG_ROUTES.integrations,
    status: "Próximamente",
    statusTone: "neutral",
    visual: "integrations",
    icon: <IconIntegrations />,
  },
  {
    id: "account",
    title: "Cuenta",
    description: "Plan Hostly, facturación y preferencias de cuenta.",
    status: "Próximamente",
    statusTone: "neutral",
    visual: "account",
    icon: <IconAccount />,
  },
];

type ConfigSearchItem = {
  id: string;
  section: string;
  title: string;
  description: string;
  href: string;
  keywords: string[];
};

const CONFIG_SEARCH_ITEMS: ConfigSearchItem[] = [
  {
    id: "restaurant",
    section: "Mi restaurante",
    title: "Datos del restaurante",
    description: "Nombre, dirección, horarios, empresa y datos del local.",
    href: CONFIG_ROUTES.restaurant,
    keywords: ["restaurante", "empresa", "local", "negocio", "direccion", "horario", "datos"],
  },
  {
    id: "operation",
    section: "Mi operación",
    title: "Configuración de la operación",
    description: "Portada de estaciones, zonas, mesas y flujo de servicio.",
    href: CONFIG_ROUTES.operation,
    keywords: ["operacion", "servicio", "flujo", "estacion", "estaciones", "zona", "zonas", "mesa", "mesas"],
  },
  {
    id: "stations",
    section: "Mi operación",
    title: "Estaciones",
    description: "Cocina, barra y puntos de producción.",
    href: CONFIG_ROUTES.stations,
    keywords: ["estacion", "estaciones", "produccion", "cocina", "barra"],
  },
  {
    id: "zones",
    section: "Mi operación",
    title: "Zonas",
    description: "Áreas operativas y zonas del restaurante.",
    href: CONFIG_ROUTES.zones,
    keywords: ["zona", "zonas", "area", "areas", "espacio", "espacios"],
  },
  {
    id: "space-editor",
    section: "Mi operación",
    title: "Editor de mapas V2",
    description: "Planos, zonas, mesas, elementos y distribución del restaurante.",
    href: CONFIG_ROUTES.spaceEditor,
    keywords: ["editor", "mapa", "plano", "espacio", "espacios", "mesa", "mesas", "sala", "salas", "distribucion", "elemento", "elementos"],
  },
  {
    id: "menu-categories",
    section: "Mi carta",
    title: "Categorías de carta",
    description: "Categorías, estructura, precios y organización de la carta.",
    href: CONFIG_ROUTES.menuCategories,
    keywords: ["carta", "menu", "categoria", "categorias", "precio", "precios", "estructura"],
  },
  {
    id: "menu-families",
    section: "Mi carta",
    title: "Familias de menú",
    description: "Familias y agrupaciones de la oferta.",
    href: CONFIG_ROUTES.menuFamilies,
    keywords: ["familia", "familias", "menu", "carta", "agrupacion", "agrupaciones"],
  },
  {
    id: "products",
    section: "Mis productos",
    title: "Productos",
    description: "Catálogo, alérgenos, variantes y productos de venta.",
    href: CONFIG_ROUTES.products,
    keywords: ["producto", "productos", "catalogo", "alergeno", "alergenos", "variante", "variantes"],
  },
  {
    id: "modifiers",
    section: "Mis productos",
    title: "Modificadores",
    description: "Opciones, extras y modificadores de productos.",
    href: CONFIG_ROUTES.modifiers,
    keywords: ["modificador", "modificadores", "opcion", "opciones", "extra", "extras"],
  },
  {
    id: "team",
    section: "Mi equipo",
    title: "Empleados y accesos",
    description: "Usuarios, empleados, roles, accesos e invitaciones.",
    href: CONFIG_ROUTES.team,
    keywords: ["equipo", "empleado", "empleados", "usuario", "usuarios", "rol", "roles", "acceso", "accesos", "invitacion", "invitaciones"],
  },
  {
    id: "printers",
    section: "Dispositivos",
    title: "Impresoras",
    description: "Impresoras, hardware e impresión por estación.",
    href: CONFIG_ROUTES.printers,
    keywords: ["dispositivo", "dispositivos", "impresora", "impresoras", "impresion", "hardware"],
  },
  {
    id: "print-queue",
    section: "Dispositivos",
    title: "Cola de impresión",
    description: "Trabajos y cola pendiente de impresión.",
    href: CONFIG_ROUTES.printQueue,
    keywords: ["cola", "impresion", "impresora", "pendiente", "trabajo", "trabajos"],
  },
  {
    id: "ai-import",
    section: "IA",
    title: "Importación inteligente",
    description: "Importar y revisar una carta con IA.",
    href: CONFIG_ROUTES.aiImport,
    keywords: ["ia", "inteligencia", "importacion", "importar", "asistente", "asistentes", "carta"],
  },
  {
    id: "integrations",
    section: "Integraciones",
    title: "Integraciones",
    description: "Delivery, pagos, conectores y herramientas externas.",
    href: CONFIG_ROUTES.integrations,
    keywords: ["integracion", "integraciones", "delivery", "pago", "pagos", "conector", "conectores", "externa", "externas"],
  },
];

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function filterConfigSearchItems(query: string): ConfigSearchItem[] {
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return CONFIG_SEARCH_ITEMS
    .map((item, sourceIndex) => {
      const title = normalizeSearchText(item.title);
      const section = normalizeSearchText(item.section);
      const keywords = item.keywords.map(normalizeSearchText);
      const haystack = normalizeSearchText(
        [item.section, item.title, item.description, ...item.keywords].join(" "),
      );
      const rank = title.includes(normalizedQuery)
        ? 0
        : section.includes(normalizedQuery)
          ? 1
          : keywords.some((keyword) => keyword.includes(normalizedQuery))
            ? 2
            : 3;
      return { item, sourceIndex, haystack, rank };
    })
    .filter(({ haystack }) => terms.every((term) => haystack.includes(term)))
    .sort((a, b) => a.rank - b.rank || a.sourceIndex - b.sourceIndex)
    .map(({ item }) => item);
}

export function ConfiguracionHubPageContent() {
  const router = useRouter();
  const listboxId = useId();
  const searchRootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [resultsOpen, setResultsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => filterConfigSearchItems(query), [query]);
  const hasQuery = normalizeSearchText(query).length > 0;
  const showResults = resultsOpen && hasQuery;
  const activeResult = results[activeIndex] ?? null;

  const closeResults = () => {
    setResultsOpen(false);
    setActiveIndex(0);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeResults();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) return;
      setResultsOpen(true);
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      setResultsOpen(true);
      setActiveIndex((current) => (current - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter" && showResults && activeResult) {
      event.preventDefault();
      closeResults();
      router.push(activeResult.href);
    }
  };

  return (
    <ModulePageShell
      title={null}
      maxWidth={1440}
      compactLayout
      shellSurface="configLight"
      backHref="/dashboard"
      backLabel="Volver al dashboard"
    >
      <div className="hostly-config-hub">
        <header className="hostly-config-hub__header">
          <HostlyBrandMark
            className="hostly-config-hub__brand"
            size={28}
            tone="app"
          />
          <p className="hostly-config-hub__eyebrow">Centro de preparación</p>
          <h1 className="hostly-config-hub__title">Configuración</h1>
          <p className="hostly-config-hub__subtitle">
            Deja tu restaurante listo para operar.
          </p>
        </header>

        <div
          ref={searchRootRef}
          className="relative z-20"
          onBlur={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              searchRootRef.current?.contains(event.relatedTarget)
            ) {
              return;
            }
            closeResults();
          }}
        >
          <label className="hostly-config-hub__search-wrap" htmlFor="config-hub-search">
            <span className="sr-only">Buscar configuración</span>
            <span className="hostly-config-hub__search-icon" aria-hidden>
              <IconSearch />
            </span>
            <input
              id="config-hub-search"
              type="search"
              className="hostly-config-hub__search"
              placeholder="Buscar ajuste, impresora, IVA, QR, usuario..."
              value={query}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showResults}
              aria-controls={listboxId}
              aria-activedescendant={
                showResults && activeResult
                  ? `${listboxId}-${activeResult.id}`
                  : undefined
              }
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                setResultsOpen(normalizeSearchText(nextQuery).length > 0);
                setActiveIndex(0);
              }}
              onFocus={() => {
                if (hasQuery) setResultsOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
            />
          </label>

          {showResults ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Resultados de configuración"
              className="absolute left-0 right-0 top-[calc(100%+6px)] max-h-80 overflow-y-auto rounded-2xl border border-[var(--hostly-table-divider-soft)] bg-white p-1.5 shadow-lg"
            >
              {results.length > 0 ? (
                results.map((item, index) => (
                  <Link
                    key={item.id}
                    id={`${listboxId}-${item.id}`}
                    href={item.href}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={[
                      "flex min-h-12 flex-col justify-center rounded-xl px-3 py-2 text-left no-underline outline-none transition-colors",
                      index === activeIndex
                        ? "bg-[var(--hostly-surface-soft)]"
                        : "hover:bg-[var(--hostly-ice-50)] focus-visible:bg-[var(--hostly-surface-soft)]",
                    ].join(" ")}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      closeResults();
                      router.push(item.href);
                    }}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--hostly-ink-faint)]">
                      {item.section}
                    </span>
                    <span className="text-sm font-semibold text-[var(--hostly-ink-strong)]">
                      {item.title}
                    </span>
                    <span className="text-xs leading-snug text-[var(--hostly-ink-muted)]">
                      {item.description}
                    </span>
                    <span className="mt-0.5 truncate text-[10px] text-[var(--hostly-ink-faint)]">
                      {item.href}
                    </span>
                  </Link>
                ))
              ) : (
                <div
                  role="status"
                  className="flex min-h-12 items-center rounded-xl px-3 py-2 text-sm text-[var(--hostly-ink-muted)]"
                >
                  No hay configuraciones que coincidan con “{query.trim()}”.
                </div>
              )}
            </div>
          ) : null}
        </div>

        <section className="hostly-config-hub__status" aria-label="Áreas de configuración">
          <div className="hostly-config-hub__status-head">
            <h2 className="hostly-config-hub__section-title">Preparación del restaurante</h2>
            <span className="hostly-config-hub__placeholder-badge">Accesos rápidos</span>
          </div>
          <ul className="hostly-config-hub__status-list">
            {RESTAURANT_STATUS.map((item) => (
              <li
                key={item.label}
                className={`hostly-config-hub__status-item hostly-config-hub__status-item--${item.tone}`}
              >
                <span className="hostly-config-hub__status-mark" aria-hidden>
                  •
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </section>

        <section className="hostly-config-hub__domains" aria-label="Dominios de configuración">
          <h2 className="hostly-config-hub__section-title hostly-config-hub__section-title--sr">
            Dominios
          </h2>
          <div className="hostly-config-hub__grid">
            {HUB_CARDS.map((card) => {
              const content = (
                <>
                <span className="hostly-config-hub-card__icon">{card.icon}</span>
                <span className="hostly-config-hub-card__body">
                  <span className="hostly-config-hub-card__title">{card.title}</span>
                  <span className="hostly-config-hub-card__description">{card.description}</span>
                </span>
                <span
                  className={`hostly-config-hub-card__status hostly-config-hub-card__status--${card.statusTone}`}
                >
                  {card.status}
                </span>
                {card.href ? (
                  <span className="hostly-config-hub-card__arrow" aria-hidden>
                    <IconArrow />
                  </span>
                ) : null}
                </>
              );
              return card.href ? (
                <Link
                  key={card.id}
                  href={card.href}
                  className="hostly-config-hub-card"
                  data-visual={card.visual}
                >
                  {content}
                </Link>
              ) : (
                <div
                  key={card.id}
                  className="hostly-config-hub-card"
                  data-visual={card.visual}
                  aria-disabled="true"
                  style={{
                    cursor: "default",
                    opacity: 0.68,
                    pointerEvents: "none",
                  }}
                >
                  {content}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </ModulePageShell>
  );
}

function IconSearch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconArrow({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12h14M14 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRestaurant({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10V4h3v16H4M10 4v7M13 4v7M10 11h3v9M17 4h3v16h-3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOperation({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="8" width="8" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 12h0M17 10h0M17 14h0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

function IconMenu({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 9h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconProducts({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconTeam({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5M14 20c0-2.2 1.8-3.5 4-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCashier({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 10h4M7 14h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="12" r="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconDevices({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 20h8M12 15v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconAI({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.6 4.9L18.5 9l-4.9 1.6L12 15.5 10.4 10.6 5.5 9l4.9-1.6L12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M19 14l.8 2.4L22 17l-2.2.6L19 20l-.8-2.4L16 17l2.2-.6L19 14z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconIntegrations({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 11l7-3.5M8.5 13l7 3.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconAccount({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
