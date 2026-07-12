import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChefHat,
  ClipboardList,
  CreditCard,
  Layers,
  Package,
  Receipt,
  ShieldCheck,
  Store,
  Timer,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
} from "lucide-react";

export type MarketingNavItem = {
  label: string;
  href: string;
};

export type MarketingCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
};

export type MarketingTestimonial = {
  quote: string;
  name: string;
  role: string;
  venue: string;
};

export type MarketingFlowStep = {
  step: string;
  title: string;
  description: string;
};

export type MarketingAiFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
};

export const demoMailHref = "mailto:hola@hostlyapp.app?subject=Solicitar%20demo%20Hostly";

export const marketingNav: MarketingNavItem[] = [
  { label: "Producto", href: "#producto" },
  { label: "Flujo", href: "#flujo" },
  { label: "IA", href: "#ia" },
  { label: "Negocios", href: "#negocios" },
];

export const marketingHero = {
  eyebrow: "TPV SaaS para hostelería real",
  headline: "Opera sala, cocina y caja con menos fricción.",
  subcopy:
    "Hostly conecta TPV táctil, mesas, comandas, carta, reservas y pagos para que tu equipo trabaje rápido durante el servicio.",
  primaryCta: { label: "Solicitar demo", href: demoMailHref },
  secondaryCta: { label: "Ver producto", href: "#producto" },
  trustLine:
    "Diseñado para restaurantes, bares, terrazas, beach clubs y negocios con servicio en mesa.",
  proofPoints: ["TPV táctil", "Sala + cocina/barra", "Carta, reservas y pagos"],
};

export const marketingKeyBenefits: MarketingCard[] = [
  {
    icon: Wallet,
    title: "Cobra más rápido",
    description:
      "Flujos táctiles para vender, revisar la cuenta y cerrar mesa sin pasos innecesarios.",
  },
  {
    icon: ShieldCheck,
    title: "Reduce errores",
    description:
      "Sala, cocina y barra trabajan con la misma información de cada comanda.",
  },
  {
    icon: Users,
    title: "Forma al equipo antes",
    description:
      "Pantallas claras para que nuevos empleados aprendan el servicio sin manuales eternos.",
  },
  {
    icon: Layers,
    title: "Controla la operación",
    description:
      "Mesas, carta, reservas y cobros conectados en una misma plataforma.",
  },
];

export const marketingProblems: MarketingCard[] = [
  {
    icon: Layers,
    title: "Operación fragmentada",
    description: "TPV, carta, mesas y comunicación viven en sitios distintos.",
  },
  {
    icon: ChefHat,
    title: "Sala difícil de leer",
    description: "Terraza, salón, barra y reservas no siempre reflejan lo que ocurre en servicio.",
  },
  {
    icon: BarChart3,
    title: "Carta desconectada",
    description: "Productos, precios, categorías y cocina cambian sin una base común.",
  },
  {
    icon: Timer,
    title: "Demasiados clics",
    description: "Cada paso extra entre pedido, cocina y cobro ralentiza la operación.",
  },
  {
    icon: CalendarDays,
    title: "Varios espacios, poco control",
    description: "Restaurantes con salas, terrazas o eventos necesitan una visión más visual.",
  },
];

export const marketingProductIntro = {
  eyebrow: "Producto",
  title: "Todo lo que ocurre durante el servicio, en una sola operación.",
  description:
    "Hostly empieza por el núcleo diario del restaurante: vender, enviar comandas, mover mesas, coordinar cocina y cobrar con confianza.",
};

export const marketingProductModules: MarketingCard[] = [
  {
    icon: Receipt,
    title: "TPV rápido",
    description:
      "Añade productos, modifica cantidades, aplica descuentos y cobra desde una interfaz pensada para horas punta.",
    detail: "Venta táctil",
  },
  {
    icon: Layers,
    title: "Mesas y plano",
    description:
      "Visualiza salón, terraza, barra o beach club con estados claros y acceso rápido a cada cuenta.",
    detail: "Sala visual",
  },
  {
    icon: ChefHat,
    title: "Cocina y barra / KDS",
    description:
      "Comandas ordenadas por estación, tiempos visibles y menos confusión entre sala, cocina y barra.",
    detail: "Pase coordinado",
  },
  {
    icon: UtensilsCrossed,
    title: "Carta y productos",
    description:
      "Gestiona platos, bebidas, categorías, precios y disponibilidad desde una base común.",
    detail: "Carta conectada",
  },
  {
    icon: CalendarDays,
    title: "Reservas",
    description:
      "Organiza próximas reservas y relaciónalas con la capacidad real de sala.",
    detail: "Capacidad real",
  },
  {
    icon: CreditCard,
    title: "Pagos",
    description:
      "Cobra por mesa, revisa importes y mantiene el cierre conectado con la operación diaria.",
    detail: "Caja clara",
  },
];

export const marketingFlow = {
  eyebrow: "Flujo operativo",
  title: "Del pedido al cobro sin perder contexto.",
  description:
    "Hostly está pensado para que cada paso del servicio tenga continuidad: la mesa, la comanda, cocina, barra y caja leen la misma operación.",
  steps: [
    {
      step: "01",
      title: "Toma el pedido",
      description: "El camarero abre la mesa, añade productos y ve la cuenta sin cambiar de herramienta.",
    },
    {
      step: "02",
      title: "Envía a cocina y barra",
      description: "Cada línea llega a su estación con estado, tiempo y prioridad visibles.",
    },
    {
      step: "03",
      title: "Sigue la sala",
      description: "Mesas, reservas y estados ayudan al equipo a entender qué necesita atención.",
    },
    {
      step: "04",
      title: "Cobra y cierra",
      description: "La cuenta se revisa, se cobra y queda conectada al cierre operativo del día.",
    },
  ] satisfies MarketingFlowStep[],
};

export const marketingAi = {
  eyebrow: "IA prudente",
  title: "IA útil, sin prometer magia.",
  description:
    "Hostly incorpora IA donde reduce trabajo real: importar una carta desde una foto, ordenar productos y ayudar a revisar información antes de publicarla. Las automatizaciones avanzadas llegarán solo cuando aporten control, no ruido.",
  features: [
    {
      icon: UtensilsCrossed,
      title: "Importar carta por foto",
      description:
        "Convierte una carta existente en productos revisables antes de publicarlos.",
      badge: "Disponible en carta",
    },
    {
      icon: ClipboardList,
      title: "Revisión antes de publicar",
      description:
        "La IA ayuda a ordenar datos, pero el restaurante mantiene el control final.",
      badge: "Control humano",
    },
    {
      icon: BrainCircuit,
      title: "Asistencia operativa",
      description:
        "Lecturas y sugerencias futuras sobre ventas, márgenes y trabajo diario.",
      badge: "En evolución",
    },
    {
      icon: Package,
      title: "Inventario inteligente",
      description:
        "Camino natural hacia compras, stock y consumo conectados con la carta.",
      badge: "Roadmap",
    },
  ] satisfies MarketingAiFeature[],
};

export const marketingBusinessTypes = {
  eyebrow: "Tipos de negocio",
  title: "Para negocios donde el servicio no se queda quieto.",
  description:
    "Hostly encaja especialmente bien cuando hay mesas, barra, terraza, equipos moviéndose y decisiones rápidas durante el servicio.",
  items: [
    {
      icon: UtensilsCrossed,
      title: "Restaurantes con sala",
      description: "Servicio por mesas, comandas y cobros coordinados.",
    },
    {
      icon: Store,
      title: "Bares y cafeterías",
      description: "Venta rápida, barra y tickets claros.",
    },
    {
      icon: Layers,
      title: "Terrazas y beach clubs",
      description: "Espacios visuales, zonas y equipos en movimiento.",
    },
    {
      icon: Users,
      title: "Pequeños grupos",
      description: "Operación consistente sin convertir Hostly en un ERP pesado.",
    },
  ] satisfies MarketingCard[],
};

export const marketingDifferentiators = {
  eyebrow: "Diferenciadores",
  title: "Profesional por dentro. Fácil de usar en pleno servicio.",
  description:
    "Hostly no intenta impresionar con complejidad: busca que el restaurante gane claridad, velocidad y control desde el primer uso.",
  items: [
    {
      icon: Timer,
      title: "Hecho para servicio real.",
      description: "La interfaz prioriza acciones frecuentes, lectura rápida y decisiones bajo presión.",
    },
    {
      icon: Layers,
      title: "Visual sin ser complejo.",
      description: "Plano, mesas y estados ayudan a entender la sala sin convertirla en una herramienta pesada.",
    },
    {
      icon: Zap,
      title: "Rápido para el equipo, útil para gerencia.",
      description: "El camarero trabaja rápido y el encargado conserva contexto para controlar la operación.",
    },
    {
      icon: BarChart3,
      title: "Preparado para crecer.",
      description: "La base permite avanzar hacia inventario, compras e inteligencia operativa sin perder simplicidad.",
    },
  ] satisfies MarketingCard[],
};

export const marketingProductShowcase = {
  eyebrow: "Mockups de producto",
  title: "Una experiencia pensada para tablet, móvil y escritorio.",
  description:
    "La web pública debe enseñar producto: TPV táctil, plano de mesas, comandas y KDS trabajando como una misma operación.",
};

export const marketingTestimonials: MarketingTestimonial[] = [
  {
    quote:
      "Necesito que el equipo vea la mesa, la comanda y el cobro sin cambiar de herramienta.",
    name: "Restaurante con sala y terraza",
    role: "Servicio por mesas",
    venue: "Operación diaria",
  },
  {
    quote:
      "La carta cambia cada semana y debe seguir conectada con TPV, cocina y productos.",
    name: "Gastrobar independiente",
    role: "Carta y productos",
    venue: "Configuración comercial",
  },
  {
    quote:
      "Tenemos comedor, barra, terraza y eventos. El mapa visual tiene que adaptarse a cada espacio.",
    name: "Hotel o beach club",
    role: "Multi-espacio",
    venue: "Visión Hostly",
  },
];

export const marketingFinalCta = {
  title: "Empieza con un TPV que tu equipo entiende.",
  description:
    "Monta tu restaurante, organiza mesas, conecta carta y empieza a operar con más claridad desde el primer servicio.",
  primaryCta: { label: "Solicitar demo", href: demoMailHref },
  secondaryCta: { label: "Escribir a hola@hostlyapp.app", href: "mailto:hola@hostlyapp.app" },
};

export const marketingFooter = {
  product: [
    { label: "TPV táctil", href: "#producto" },
    { label: "Mesas y plano", href: "#producto" },
    { label: "Cocina / KDS", href: "#producto" },
    { label: "Carta y productos", href: "#producto" },
    { label: "IA prudente", href: "#ia" },
  ],
  company: [
    { label: "Flujo operativo", href: "#flujo" },
    { label: "Tipos de negocio", href: "#negocios" },
    { label: "Contacto", href: "mailto:hola@hostlyapp.app" },
  ],
  legal: [
    { label: "Privacidad", href: "#" },
    { label: "Términos", href: "#" },
    { label: "Cookies", href: "#" },
  ],
  contactEmail: "hola@hostlyapp.app",
  copyright: "© Hostly. TPV SaaS para hostelería real.",
};
