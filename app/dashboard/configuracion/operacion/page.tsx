import Link from "next/link";
import { Boxes, ChefHat, Layers3, LayoutGrid, type LucideIcon } from "lucide-react";
import { ConfigModulePageHeader } from "../_components/config-module-page-header";

type OperationShortcut = {
  title: string;
  description: string;
  href: string;
  Icon: LucideIcon;
};

const OPERATION_SHORTCUTS: OperationShortcut[] = [
  {
    title: "Estaciones",
    description: "Organiza cocina, barra y puntos de producción.",
    href: "/dashboard/configuracion/estaciones",
    Icon: ChefHat,
  },
  {
    title: "Zonas",
    description: "Define las áreas operativas del restaurante.",
    href: "/dashboard/configuracion/espacios/zonas",
    Icon: Layers3,
  },
  {
    title: "Mesas",
    description: "Configura espacios, mesas y distribución inicial.",
    href: "/dashboard/configuracion/espacios/mesas",
    Icon: LayoutGrid,
  },
  {
    title: "Editor de espacios",
    description: "Ajusta visualmente el plano y sus elementos.",
    href: "/dashboard/configuracion/espacios/editor-v2",
    Icon: Boxes,
  },
];

export default function ConfigOperacionPage() {
  return (
    <div className="hostly-config-page-body flex min-h-0 flex-1 flex-col overflow-auto">
      <ConfigModulePageHeader
        title="Mi operación"
        description="Configura las áreas que preparan el restaurante para el servicio."
      />

      <nav
        className="hostly-config-hub__grid mx-auto w-full max-w-[var(--hostly-config-content-max)]"
        aria-label="Configuración de la operación"
      >
        {OPERATION_SHORTCUTS.map(({ title, description, href, Icon }) => (
          <Link
            key={href}
            href={href}
            className="hostly-config-hub-card"
            data-visual="operation"
          >
            <span className="hostly-config-hub-card__icon" aria-hidden>
              <Icon size={20} strokeWidth={2} />
            </span>
            <span className="hostly-config-hub-card__body">
              <span className="hostly-config-hub-card__title">{title}</span>
              <span className="hostly-config-hub-card__description">
                {description}
              </span>
            </span>
            <span className="hostly-config-hub-card__status hostly-config-hub-card__status--neutral">
              Abrir
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
