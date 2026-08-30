import Link from "next/link";

type IntegrationArea = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  examples: string[];
  icon: "delivery" | "payments" | "management" | "api";
};

const INTEGRATION_AREAS: IntegrationArea[] = [
  {
    id: "delivery",
    eyebrow: "Canales de venta",
    title: "Delivery",
    description:
      "Pedidos externos entrando en el mismo flujo operativo de Hostly.",
    examples: ["Glovo", "Uber Eats", "Just Eat"],
    icon: "delivery",
  },
  {
    id: "payments",
    eyebrow: "Cobros conectados",
    title: "Pagos",
    description: "Terminales y conciliación sin separar la cuenta de la mesa.",
    examples: ["Datáfonos", "Pago online", "Conciliación"],
    icon: "payments",
  },
  {
    id: "management",
    eyebrow: "Administración",
    title: "Gestión y fiscalidad",
    description:
      "Ventas y cierres preparados para las herramientas administrativas.",
    examples: ["Holded", "Sage", "Contabilidad"],
    icon: "management",
  },
  {
    id: "api",
    eyebrow: "Ecosistema Hostly",
    title: "API y webhooks",
    description:
      "Eventos operativos con permisos explícitos y alcance controlado.",
    examples: ["Pedidos", "Productos", "Estados"],
    icon: "api",
  },
];

function IntegrationGlyph({ icon }: { icon: IntegrationArea["icon"] }) {
  if (icon === "delivery") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden>
        <path
          d="M11 17h26l-3 19H14l-3-19Z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M18 17a6 6 0 0 1 12 0M17 25h14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (icon === "payments") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden>
        <rect
          x="9"
          y="13"
          width="30"
          height="22"
          rx="5"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <path
          d="M9 21h30M15 29h8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (icon === "management") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden>
        <path
          d="M14 9h20v30H14z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M19 17h10M19 23h10M19 29h6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden>
      <path
        d="M17 17 10 24l7 7M31 17l7 7-7 7M27 11l-6 26"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ConfigIntegracionesPage() {
  return (
    <div className="hostly-config-page-body hostly-integrations-hub flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="hostly-integrations-hub__inner">
        <section className="hostly-integrations-hub__hero">
          <div className="hostly-integrations-hub__hero-copy">
            <span className="hostly-integrations-hub__eyebrow">
              Centro de integraciones
            </span>
            <h1>Todo conectado, sin perder el control.</h1>
            <p>
              Delivery, pagos y administración llegarán a Hostly con permisos
              explícitos, trazabilidad y aislamiento por restaurante.
            </p>
            <div
              className="hostly-integrations-hub__hero-badges"
              aria-label="Principios de las integraciones"
            >
              <span>Permisos por conexión</span>
              <span>Datos trazables</span>
              <span>Control del restaurante</span>
            </div>
          </div>
          <div className="hostly-integrations-hub__orbit" aria-hidden>
            <div className="hostly-integrations-hub__orbit-core">H</div>
            <span className="is-delivery">
              <IntegrationGlyph icon="delivery" />
            </span>
            <span className="is-payments">
              <IntegrationGlyph icon="payments" />
            </span>
            <span className="is-management">
              <IntegrationGlyph icon="management" />
            </span>
            <span className="is-api">
              <IntegrationGlyph icon="api" />
            </span>
          </div>
        </section>

        <div className="hostly-integrations-hub__section-heading">
          <div>
            <span>Roadmap de conexiones</span>
            <h2>Preparadas para crecer con tu operación</h2>
          </div>
          <span className="hostly-integrations-hub__coming">Próximamente</span>
        </div>

        <section
          className="hostly-integrations-hub__grid"
          aria-label="Áreas de integración previstas"
        >
          {INTEGRATION_AREAS.map((area) => (
            <article
              key={area.id}
              className={`hostly-integration-card hostly-integration-card--${area.id}`}
            >
              <div className="hostly-integration-card__icon">
                <IntegrationGlyph icon={area.icon} />
              </div>
              <div className="hostly-integration-card__copy">
                <span>{area.eyebrow}</span>
                <h3>{area.title}</h3>
                <p>{area.description}</p>
              </div>
              <div className="hostly-integration-card__examples">
                {area.examples.map((example) => (
                  <span key={example}>{example}</span>
                ))}
              </div>
              <div className="hostly-integration-card__status">
                <span aria-hidden /> En preparación
              </div>
            </article>
          ))}
        </section>

        <section className="hostly-integrations-hub__trust">
          <div className="hostly-integrations-hub__trust-icon" aria-hidden>
            <svg viewBox="0 0 48 48" fill="none">
              <path
                d="M24 7 38 12v10c0 9-5.6 15.2-14 19-8.4-3.8-14-10-14-19V12l14-5Z"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <path
                d="m18 24 4 4 8-9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <span>Seguridad por diseño</span>
            <h2>Nada se conectará sin tu autorización.</h2>
            <p>
              Cada integración mostrará qué puede leer o modificar antes de
              activarse. Hasta entonces, esta pantalla es informativa y no
              concede acceso a terceros.
            </p>
          </div>
          <Link
            href="/dashboard/configuracion"
            className="hostly-button-secondary hostly-button-compact"
          >
            Volver a Configuración
          </Link>
        </section>
      </div>
    </div>
  );
}
