import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BrainCircuit,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Layers,
  MessageSquareWarning,
  Package,
  Receipt,
  ShoppingCart,
  Sparkles,
  Timer,
  TrendingDown,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
} from "lucide-react";

export type MarketingNavItem = {
  label: string;
  href: string;
};

export type MarketingFeatureCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  detail: string;
};

export type MarketingProblem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type MarketingBenefit = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type MarketingTestimonial = {
  quote: string;
  name: string;
  role: string;
  venue: string;
};

export type MarketingAiFeature = {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
};

export const marketingNav: MarketingNavItem[] = [
  { label: "Producto", href: "#producto" },
  { label: "Solución", href: "#solucion" },
  { label: "IA", href: "#ia" },
  { label: "Beneficios", href: "#beneficios" },
];

export const marketingHero = {
  eyebrow: "Plataforma operativa para hostelería",
  headline: "Gestiona todo tu restaurante desde una sola plataforma.",
  subcopy:
    "TPV, cocina, stock, reservas, compras, análisis e inteligencia artificial. Un solo sistema para equipos exigentes.",
  primaryCta: { label: "Empezar", href: "/login" },
  secondaryCta: { label: "Ver demo", href: "#producto" },
  trustLine: "Diseñado para grupos, independientes y operaciones multi-sala.",
};

export const marketingProblems: MarketingProblem[] = [
  {
    icon: Layers,
    title: "Demasiados sistemas",
    description: "TPV, Excel, WhatsApp y apps sueltas que no hablan entre sí.",
  },
  {
    icon: ChefHat,
    title: "Errores en cocina",
    description: "Comandas perdidas, tiempos impredecibles y pase desordenado.",
  },
  {
    icon: TrendingDown,
    title: "Pérdidas de stock",
    description: "Compras a ciegas, mermas invisibles y escandallos desactualizados.",
  },
  {
    icon: MessageSquareWarning,
    title: "Mala comunicación",
    description: "Sala, barra y cocina trabajan con información distinta.",
  },
  {
    icon: CalendarDays,
    title: "Reservas caóticas",
    description: "Capacidad mal repartida y mesas que no reflejan la realidad.",
  },
];

export const marketingSolutionIntro = {
  eyebrow: "Un solo sistema",
  title: "Operativa, finanzas y servicio conectados.",
  description:
    "Hostly centraliza lo que hoy vive en cinco herramientas distintas. Menos fricción, más control y una experiencia premium para tu equipo.",
};

export const marketingFeatures: MarketingFeatureCard[] = [
  {
    icon: Receipt,
    title: "TPV inteligente",
    description: "Cobros rápidos, mesas, descuentos y operativa táctil impecable.",
    detail: "Pensado para servicio intenso",
  },
  {
    icon: ChefHat,
    title: "Cocina / KDS",
    description: "Comandas claras, tiempos visibles y pase coordinado en tiempo real.",
    detail: "Menos errores en hora punta",
  },
  {
    icon: Package,
    title: "Stock en tiempo real",
    description: "Existencias, alertas y movimientos con trazabilidad operativa.",
    detail: "Visibilidad total del almacén",
  },
  {
    icon: ShoppingCart,
    title: "Compras",
    description: "Pedidos, recepciones y proveedores alineados con tu consumo real.",
    detail: "Compras con contexto",
  },
  {
    icon: ClipboardList,
    title: "Escandallos",
    description: "Costes por plato, márgenes y rentabilidad sin hojas sueltas.",
    detail: "Decisiones con margen real",
  },
  {
    icon: CalendarDays,
    title: "Reservas",
    description: "Capacidad, mesas y servicio coordinados desde un solo mapa.",
    detail: "Sala siempre sincronizada",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description: "Ventas, productos, franjas horarias y rendimiento del equipo.",
    detail: "Datos accionables al instante",
  },
  {
    icon: Sparkles,
    title: "IA",
    description: "Importación de carta, sugerencias y automatización operativa.",
    detail: "El futuro, ya integrado",
  },
];

export const marketingAi = {
  eyebrow: "Inteligencia operativa",
  title: "El futuro operativo del restaurante, hoy.",
  description:
    "Hostly combina datos reales con IA aplicada: menos carga manual, más precisión en carta, stock y decisiones diarias.",
  features: [
    {
      icon: UtensilsCrossed,
      title: "Importar carta por foto",
      description: "Sube tu carta y estructura productos, categorías y precios en minutos.",
      badge: "Disponible",
    },
    {
      icon: BrainCircuit,
      title: "Análisis inteligente",
      description: "Detecta patrones de venta, márgenes y oportunidades de mejora.",
      badge: "Disponible",
    },
    {
      icon: Package,
      title: "Stock inteligente",
      description: "Sugerencias de inventario basadas en carta, consumo y estacionalidad.",
      badge: "Disponible",
    },
    {
      icon: Zap,
      title: "Automatizaciones",
      description: "Alertas, reposiciones y flujos operativos sin intervención manual.",
      badge: "Próximamente",
    },
    {
      icon: Timer,
      title: "Voz y comandas",
      description: "Captura natural de pedidos y asistencia en servicio de sala.",
      badge: "Roadmap",
    },
  ] satisfies MarketingAiFeature[],
};

export const marketingProductShowcase = {
  eyebrow: "Producto",
  title: "Potencia visual. Control real.",
  description:
    "Una plataforma que se siente premium en desktop, tablet y móvil. Mockups orientativos del ecosistema Hostly.",
  desktopTabs: ["Analytics", "TPV", "Cocina", "Mesas"],
  mobileTabs: ["Camarero", "Comandas", "Reservas", "Métricas"],
};

export const marketingBenefits: MarketingBenefit[] = [
  {
    icon: Zap,
    title: "Más rapidez",
    description: "Menos pasos entre pedido, cocina y cobro.",
  },
  {
    icon: Wallet,
    title: "Ahorro real",
    description: "Compras y stock alineados con lo que realmente vendes.",
  },
  {
    icon: Users,
    title: "Mejor servicio",
    description: "Equipos coordinados y clientes mejor atendidos.",
  },
  {
    icon: BarChart3,
    title: "Control total",
    description: "Visibilidad de operación, costes y rendimiento.",
  },
  {
    icon: Layers,
    title: "Operaciones centralizadas",
    description: "Un solo panel para dueños, gerencia y equipo.",
  },
  {
    icon: ChefHat,
    title: "Menos errores",
    description: "Comunicación clara entre sala, barra y cocina.",
  },
];

export const marketingTestimonials: MarketingTestimonial[] = [
  {
    quote:
      "Pasamos de cuatro herramientas a una sola. El servicio es más fluido y por fin vemos márgenes reales cada semana.",
    name: "Elena Morales",
    role: "Directora de operaciones",
    venue: "Grupo Lateral · Madrid",
  },
  {
    quote:
      "La importación de carta nos ahorró días de configuración. El equipo lo entendió en la primera sesión.",
    name: "Marc Vilalta",
    role: "Propietario",
    venue: "Saó Gastrobar · Barcelona",
  },
  {
    quote:
      "Hostly se siente como software caro, pero es práctico desde el minuto uno. Cocina y sala por fin van a la par.",
    name: "Lucía Fernández",
    role: "Jefa de sala",
    venue: "Marina 12 · Valencia",
  },
];

export const marketingFinalCta = {
  title: "Empieza a operar con claridad.",
  description:
    "Configura tu restaurante, invita a tu equipo y centraliza TPV, cocina, stock y reservas en una plataforma premium.",
  primaryCta: { label: "Empezar gratis", href: "/login" },
  secondaryCta: { label: "Hablar con ventas", href: "mailto:hola@hostlyapp.app" },
};

export const marketingFooter = {
  product: [
    { label: "TPV", href: "#solucion" },
    { label: "Cocina / KDS", href: "#solucion" },
    { label: "Stock", href: "#solucion" },
    { label: "Reservas", href: "#solucion" },
    { label: "IA", href: "#ia" },
  ],
  company: [
    { label: "Sobre Hostly", href: "#beneficios" },
    { label: "Clientes", href: "#testimonios" },
    { label: "Contacto", href: "mailto:hola@hostlyapp.app" },
  ],
  legal: [
    { label: "Privacidad", href: "#" },
    { label: "Términos", href: "#" },
    { label: "Cookies", href: "#" },
  ],
  contactEmail: "hola@hostlyapp.app",
  copyright: "© Hostly. Plataforma operativa para hostelería.",
};
