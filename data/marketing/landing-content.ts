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
  { label: "Visión IA", href: "#ia" },
  { label: "Beneficios", href: "#beneficios" },
];

export const marketingHero = {
  eyebrow: "Plataforma operativa para hostelería",
  headline: "Controla tu restaurante desde un único sistema visual.",
  subcopy:
    "TPV, carta, mesas y operación conectados para que sala, barra y cocina trabajen con el mismo contexto.",
  primaryCta: { label: "Empezar con Hostly", href: "/login" },
  secondaryCta: { label: "Ver producto", href: "#producto" },
  trustLine: "Diseñado para restaurantes, terrazas, beach clubs, hoteles y negocios con varios espacios.",
};

export const marketingProblems: MarketingProblem[] = [
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
    icon: TrendingDown,
    title: "Carta desconectada",
    description: "Productos, precios, categorías y cocina cambian sin una base común.",
  },
  {
    icon: MessageSquareWarning,
    title: "Demasiados clics",
    description: "Cada paso extra entre pedido, cocina y cobro ralentiza la operación.",
  },
  {
    icon: CalendarDays,
    title: "Varios espacios, poco control",
    description: "Restaurantes con salas, terrazas o eventos necesitan una visión más visual.",
  },
];

export const marketingSolutionIntro = {
  eyebrow: "Sistema visual conectado",
  title: "TPV, carta, mesas y operación trabajando juntos.",
  description:
    "Hostly centraliza la operativa diaria en una plataforma SaaS diseñada para hostelería real: menos clics, más contexto y control desde la sala hasta la gestión.",
};

export const marketingFeatures: MarketingFeatureCard[] = [
  {
    icon: Receipt,
    title: "TPV táctil",
    description: "Venta, cobros, descuentos y mesas en un flujo rápido para horas punta.",
    detail: "Caja y sala",
  },
  {
    icon: UtensilsCrossed,
    title: "Carta y productos",
    description: "Platos, bebidas, categorías, precios y configuración comercial desde una base común.",
    detail: "Carta conectada",
  },
  {
    icon: Layers,
    title: "Mapas visuales",
    description: "Salón, terraza, barra o beach club representados de forma clara para operar mejor.",
    detail: "Vista de sala",
  },
  {
    icon: Users,
    title: "Operación por mesas",
    description: "Mesas, comandas, estados y equipo conectados con el mismo contexto operativo.",
    detail: "Servicio conectado",
  },
  {
    icon: ClipboardList,
    title: "Editor de espacios en evolución",
    description: "Hostly avanza hacia un editor visual por capas para terreno, estructura y operación.",
    detail: "Producto en desarrollo",
  },
  {
    icon: ChefHat,
    title: "Cocina y barra",
    description: "Comandas claras, estados visibles y pase coordinado entre equipos.",
    detail: "Menos errores",
  },
  {
    icon: Package,
    title: "Inventario y compras",
    description: "Stock, proveedores y consumo alineados con lo que se vende en el restaurante.",
    detail: "Control de costes",
  },
  {
    icon: Sparkles,
    title: "IA en evolución",
    description: "Hostly está preparado para incorporar asistencia inteligente donde aporte valor real.",
    detail: "Visión producto",
  },
];

export const marketingAi = {
  eyebrow: "Visión con IA",
  title: "Preparado para una operación más inteligente.",
  description:
    "La IA en Hostly se plantea como una capa práctica sobre datos reales del restaurante: primero ayuda donde reduce carga manual, después crecerá hacia flujos más asistidos.",
  features: [
    {
      icon: UtensilsCrossed,
      title: "Importar carta por foto",
      description: "Convierte cartas existentes en una base de productos más fácil de revisar y ordenar.",
      badge: "Disponible en carta",
    },
    {
      icon: BrainCircuit,
      title: "Análisis inteligente",
      description: "Lecturas y recomendaciones sobre ventas, márgenes y operación diaria.",
      badge: "En evolución",
    },
    {
      icon: Package,
      title: "Stock inteligente",
      description: "Sugerencias futuras basadas en carta, consumo y necesidades del negocio.",
      badge: "Visión producto",
    },
    {
      icon: Zap,
      title: "Automatizaciones",
      description: "Alertas y flujos operativos más asistidos, sin perder control humano.",
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
  eyebrow: "Producto visual",
  title: "TPV, carta y sala dentro de la misma operación.",
  description:
    "Hostly está diseñado para trabajar en desktop, tablet y móvil con una experiencia clara, rápida y pensada para servicio real.",
  desktopTabs: ["Operación", "TPV", "Cocina", "Mapa visual"],
  mobileTabs: ["Camarero", "Comandas", "Mesas", "Métricas"],
};

export const marketingBenefits: MarketingBenefit[] = [
  {
    icon: Zap,
    title: "Menos clics",
    description: "Flujos más directos entre pedido, cocina, mesa y cobro.",
  },
  {
    icon: Wallet,
    title: "Más control",
    description: "Información operativa y económica reunida en un solo sistema.",
  },
  {
    icon: Users,
    title: "Equipo coordinado",
    description: "Sala, barra y cocina trabajan con una lectura compartida del servicio.",
  },
  {
    icon: BarChart3,
    title: "Decisiones con datos",
    description: "Ventas, productos y rendimiento visibles para mejorar la gestión diaria.",
  },
  {
    icon: Layers,
    title: "Multi-espacio",
    description: "Pensado para negocios con salón, terraza, barra, hotel o beach club.",
  },
  {
    icon: ChefHat,
    title: "Menos fricción",
    description: "Menos saltos entre herramientas y menos pérdida de contexto.",
  },
];

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
  title: "Empieza a centralizar tu operación.",
  description:
    "Configura tu restaurante, invita a tu equipo y conecta TPV, carta, mesas y operación en una plataforma preparada para crecer.",
  primaryCta: { label: "Empezar con Hostly", href: "/login" },
  secondaryCta: { label: "Hablar con ventas", href: "mailto:hola@hostlyapp.app" },
};

export const marketingFooter = {
  product: [
    { label: "TPV", href: "#solucion" },
    { label: "Carta y productos", href: "#solucion" },
    { label: "Mapas visuales", href: "#producto" },
    { label: "Operación por mesas", href: "#solucion" },
    { label: "Cocina / KDS", href: "#solucion" },
    { label: "Visión IA", href: "#ia" },
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
  copyright: "© Hostly. Plataforma SaaS visual para hostelería.",
};
