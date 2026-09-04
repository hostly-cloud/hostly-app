"use client";

import Link from "next/link";
import {
  Bot,
  Building2,
  ChevronRight,
  CircleUserRound,
  CreditCard,
  LayoutDashboard,
  MonitorCog,
  PackageOpen,
  PlugZap,
  Search,
  UsersRound,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import {
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
  Icon: LucideIcon;
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
  tables: "/dashboard/configuracion/espacios/mesas",
  spaceEditor: "/dashboard/configuracion/espacios/editor-v2",
  menuCategories: "/dashboard/configuracion/carta/categorias",
  menuFamilies: "/dashboard/configuracion/carta/familias",
  products: "/dashboard/configuracion/carta/productos",
  modifiers: "/dashboard/configuracion/modificadores",
  recipes: "/dashboard/configuracion/carta/escandallos",
  team: "/dashboard/configuracion/empleados",
  employeeOperations: "/dashboard/empleados/operaciones",
  employeeClocking: "/dashboard/empleados/fichajes",
  cash: "/dashboard/caja",
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
    Icon: Building2,
  },
  {
    id: "operation",
    title: "Mi operación",
    description: "Estaciones, zonas, mesas y flujo de servicio.",
    href: CONFIG_ROUTES.operation,
    status: "Configurar operación",
    statusTone: "neutral",
    visual: "operation",
    Icon: LayoutDashboard,
  },
  {
    id: "menu",
    title: "Mi carta",
    description: "Categorías, familias, precios y estructura de la oferta.",
    href: CONFIG_ROUTES.menuCategories,
    status: "Gestionar carta",
    statusTone: "neutral",
    visual: "menu",
    Icon: UtensilsCrossed,
  },
  {
    id: "products",
    title: "Mis productos",
    description: "Catálogo de venta, alérgenos, variantes y modificadores.",
    href: CONFIG_ROUTES.products,
    status: "Gestionar catálogo",
    statusTone: "neutral",
    visual: "products",
    Icon: PackageOpen,
  },
  {
    id: "team",
    title: "Mi equipo",
    description: "Empleados, roles, accesos, fichajes y RRHH operativo.",
    href: CONFIG_ROUTES.team,
    status: "Gestionar equipo",
    statusTone: "neutral",
    visual: "team",
    Icon: UsersRound,
  },
  {
    id: "cashier",
    title: "Mi caja",
    description: "Turnos, movimientos, cierre ciego y conciliación de caja.",
    href: CONFIG_ROUTES.cash,
    status: "Gestionar caja",
    statusTone: "neutral",
    visual: "cashier",
    Icon: CreditCard,
  },
  {
    id: "devices",
    title: "Dispositivos",
    description: "Impresoras, cola de impresión y hardware conectado.",
    href: CONFIG_ROUTES.printers,
    status: "Configurar impresión",
    statusTone: "neutral",
    visual: "devices",
    Icon: MonitorCog,
  },
  {
    id: "ai",
    title: "IA",
    description: "Importación inteligente y asistentes de carta.",
    href: CONFIG_ROUTES.aiImport,
    status: "Disponible",
    statusTone: "neutral",
    visual: "ai",
    Icon: Bot,
  },
  {
    id: "integrations",
    title: "Integraciones",
    description: "Conexiones con delivery, pagos y herramientas externas.",
    href: CONFIG_ROUTES.integrations,
    status: "Próximamente",
    statusTone: "neutral",
    visual: "integrations",
    Icon: PlugZap,
  },
  {
    id: "account",
    title: "Cuenta",
    description: "Plan Hostly, facturación y preferencias de cuenta.",
    status: "Próximamente",
    statusTone: "neutral",
    visual: "account",
    Icon: CircleUserRound,
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
    id: "tables",
    section: "Mi operación",
    title: "Mesas",
    description: "Acceso a la gestión visual de mesas dentro del plano.",
    href: CONFIG_ROUTES.tables,
    keywords: ["mesa", "mesas", "plano", "sala", "terraza", "capacidad"],
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
    id: "recipes",
    section: "Mis productos",
    title: "Escandallos",
    description: "Costes, ingredientes y márgenes de los productos.",
    href: CONFIG_ROUTES.recipes,
    keywords: ["escandallo", "escandallos", "coste", "costes", "ingrediente", "ingredientes", "margen", "margenes"],
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
    id: "employee-operations",
    section: "Mi equipo",
    title: "RRHH operativo",
    description: "Operativa de personal, jornadas y gestión del equipo.",
    href: CONFIG_ROUTES.employeeOperations,
    keywords: ["rrhh", "recursos", "humanos", "personal", "jornada", "jornadas", "empleados", "operaciones"],
  },
  {
    id: "employee-clocking",
    section: "Mi equipo",
    title: "Terminal de fichaje",
    description: "Fichaje seguro con QR rotatorio, ubicación y PIN.",
    href: CONFIG_ROUTES.employeeClocking,
    keywords: ["fichaje", "fichar", "qr", "pin", "terminal", "geolocalizacion", "ubicacion", "horario"],
  },
  {
    id: "cash",
    section: "Mi caja",
    title: "Caja y conciliación",
    description: "Turnos, apertura, movimientos, cierre ciego e historial de caja.",
    href: CONFIG_ROUTES.cash,
    keywords: ["caja", "turno", "turnos", "apertura", "cierre", "ciego", "conciliacion", "efectivo", "movimiento", "movimientos", "arqueo"],
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
              <Search size={20} strokeWidth={2} />
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
                  <span className="hostly-config-hub-card__icon" aria-hidden>
                    <card.Icon size={22} strokeWidth={1.8} />
                  </span>
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
                      <ChevronRight size={16} strokeWidth={1.9} />
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
