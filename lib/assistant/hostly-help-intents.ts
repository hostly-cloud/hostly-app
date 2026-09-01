import type { HostlyCapability } from "@/lib/auth/hostly-capabilities";

export type HostlyHelpIntent = {
  id: string;
  title: string;
  answer: string;
  href: string;
  actionLabel: string;
  capability?: HostlyCapability;
  keywords: readonly string[];
};

export const HOSTLY_HELP_INTENTS: readonly HostlyHelpIntent[] = [
  {
    id: "printer-setup",
    title: "Enlazar una impresora",
    answer:
      "Ve a Impresoras, crea o abre la impresora y asígnala a la estación que debe recibir los tickets. Después puedes revisar la cola de impresión desde esa misma pantalla.",
    href: "/dashboard/configuracion/impresoras",
    actionLabel: "Ir a Impresoras",
    capability: "settings.manage",
    keywords: ["impresora", "impresoras", "ticket", "imprimir", "enlazar impresora", "cola impresion"],
  },
  {
    id: "product-image",
    title: "Añadir una foto a un producto",
    answer:
      "Abre Productos, entra en el producto y usa el bloque Imagen. Puedes subir una foto propia; quedará guardada en el catálogo del restaurante.",
    href: "/dashboard/configuracion/carta/productos",
    actionLabel: "Ir a Productos",
    capability: "settings.manage",
    keywords: [
      "foto producto",
      "foto de un producto",
      "imagen producto",
      "imagen de un producto",
      "poner foto",
      "subir imagen",
      "añadir imagen",
      "producto imagen",
    ],
  },
  {
    id: "menu-import",
    title: "Importar una carta desde una foto",
    answer:
      "Abre Importación, elige Foto de carta y analiza el archivo. Hostly preparará una propuesta para que revises nombres, precios, categorías y estaciones antes de publicar.",
    href: "/dashboard/configuracion/carta/importacion",
    actionLabel: "Ir a Importación",
    capability: "settings.manage",
    keywords: [
      "foto carta",
      "foto a la carta",
      "importar carta",
      "subir carta",
      "menu foto",
      "carta imagen",
      "analizar carta",
    ],
  },
  {
    id: "open-tpv",
    title: "Abrir el TPV",
    answer:
      "Entra en TPV para abrir una venta, seleccionar una mesa y añadir productos. Los pedidos solo llegan a preparación cuando se envían desde el flujo de servicio.",
    href: "/dashboard/operacion/tpv",
    actionLabel: "Ir al TPV",
    capability: "tpv.sell",
    keywords: ["abrir tpv", "crear pedido", "nueva venta", "cobrar mesa", "añadir producto pedido"],
  },
  {
    id: "kitchen-orders",
    title: "Ver comandas en Cocina",
    answer:
      "Abre Cocina para ver las líneas ya enviadas a preparación. Los pedidos que aún no se han enviado desde TPV no deben aparecer aquí.",
    href: "/dashboard/operacion/cocina",
    actionLabel: "Ir a Cocina",
    capability: "kds.manage",
    keywords: ["comanda cocina", "ver pedidos cocina", "kds", "preparacion", "pedido cocina"],
  },
  {
    id: "reservations",
    title: "Gestionar reservas",
    answer:
      "Abre Reservas para consultar las llegadas, crear una reserva y revisar su asignación antes del servicio.",
    href: "/dashboard/operacion/reservas",
    actionLabel: "Ir a Reservas",
    capability: "tpv.sell",
    keywords: ["reserva", "reservas", "crear reserva", "llegadas", "reservar mesa"],
  },
];

function normalizeHelpQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findHostlyHelpIntent(
  query: string,
  canAccess: (capability: HostlyCapability) => boolean = () => true,
): HostlyHelpIntent | null {
  const normalized = normalizeHelpQuery(query);
  if (!normalized) return null;

  let best: { intent: HostlyHelpIntent; score: number } | null = null;
  for (const intent of HOSTLY_HELP_INTENTS) {
    if (intent.capability && !canAccess(intent.capability)) continue;
    const score = intent.keywords.reduce((total, keyword) => {
      const normalizedKeyword = normalizeHelpQuery(keyword);
      if (!normalizedKeyword || !normalized.includes(normalizedKeyword)) return total;
      return total + normalizedKeyword.split(" ").length;
    }, 0);
    if (score > 0 && (!best || score > best.score)) best = { intent, score };
  }
  return best?.intent ?? null;
}

const OPERATIONAL_RUNTIME_PATHS = [
  "/dashboard/operacion/",
  "/dashboard/mesas",
  "/dashboard/cocina",
  "/dashboard/sala",
] as const;

/** Evita superponer ayuda sobre controles de servicio de alta frecuencia. */
export function shouldShowHostlyHelpAssistant(pathname: string): boolean {
  return !OPERATIONAL_RUNTIME_PATHS.some(
    (path) => pathname === path.replace(/\/$/, "") || pathname.startsWith(path),
  );
}
