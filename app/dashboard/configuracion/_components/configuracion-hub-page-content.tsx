"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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
  { label: "Restaurante listo", tone: "ok" as const },
  { label: "Carta publicada", tone: "ok" as const },
  { label: "TPV configurado", tone: "ok" as const },
  { label: "Usuarios activos", tone: "ok" as const },
  { label: "1 impresora pendiente", tone: "warn" as const },
];

const HUB_CARDS: HubCard[] = [
  {
    id: "restaurant",
    title: "Mi restaurante",
    description: "Nombre, dirección, horarios y datos del local.",
    href: "/dashboard/configuracion/empresa",
    status: "Perfil básico",
    statusTone: "ok",
    visual: "restaurant",
    icon: <IconRestaurant />,
  },
  {
    id: "operation",
    title: "Mi operación",
    description: "Estaciones, zonas, mesas y flujo de servicio.",
    href: "/dashboard/configuracion/operacion",
    status: "4 estaciones",
    statusTone: "neutral",
    visual: "operation",
    icon: <IconOperation />,
  },
  {
    id: "menu",
    title: "Mi carta",
    description: "Categorías, familias, precios y estructura de la oferta.",
    href: "/dashboard/configuracion/carta/categorias",
    status: "Publicada",
    statusTone: "ok",
    visual: "menu",
    icon: <IconMenu />,
  },
  {
    id: "products",
    title: "Mis productos",
    description: "Catálogo de venta, alérgenos, variantes y modificadores.",
    href: "/dashboard/configuracion/carta/productos",
    status: "142 productos",
    statusTone: "neutral",
    visual: "products",
    icon: <IconProducts />,
  },
  {
    id: "team",
    title: "Mi equipo",
    description: "Empleados, roles, accesos e invitaciones.",
    href: "/dashboard/configuracion/empleados",
    status: "8 usuarios",
    statusTone: "ok",
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
    href: "/dashboard/configuracion/impresoras",
    status: "1 pendiente",
    statusTone: "warn",
    visual: "devices",
    icon: <IconDevices />,
  },
  {
    id: "ai",
    title: "IA",
    description: "Importación inteligente y asistentes de carta.",
    href: "/dashboard/configuracion/carta/importacion",
    status: "Disponible",
    statusTone: "neutral",
    visual: "ai",
    icon: <IconAI />,
  },
  {
    id: "integrations",
    title: "Integraciones",
    description: "Conexiones con delivery, pagos y herramientas externas.",
    href: "/dashboard/configuracion/integraciones",
    status: "2 activas",
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

export function ConfiguracionHubPageContent() {
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

        <label className="hostly-config-hub__search-wrap" htmlFor="config-hub-search">
          <span className="hostly-config-hub__search-icon" aria-hidden>
            <IconSearch />
          </span>
          <input
            id="config-hub-search"
            type="search"
            className="hostly-config-hub__search"
            placeholder="Buscar ajuste, impresora, IVA, QR, usuario..."
            readOnly
          />
        </label>

        <section className="hostly-config-hub__status" aria-label="Estado del restaurante">
          <div className="hostly-config-hub__status-head">
            <h2 className="hostly-config-hub__section-title">Restaurante listo</h2>
            <span className="hostly-config-hub__placeholder-badge">Orientativo</span>
          </div>
          <ul className="hostly-config-hub__status-list">
            {RESTAURANT_STATUS.map((item) => (
              <li
                key={item.label}
                className={`hostly-config-hub__status-item hostly-config-hub__status-item--${item.tone}`}
              >
                <span className="hostly-config-hub__status-mark" aria-hidden>
                  {item.tone === "warn" ? "⚠" : "✓"}
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
