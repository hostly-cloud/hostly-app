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

export const demoMailHref = "mailto:hola@hostlyapp.app?subject=Quiero%20ver%20Hostly%20en%20accion";

export const marketingNav: MarketingNavItem[] = [
  { label: "Producto", href: "#producto" },
  { label: "Flujo", href: "#flujo" },
  { label: "IA", href: "#ia" },
  { label: "Negocios", href: "#negocios" },
];

export const marketingHero = {
  eyebrow: "Hostly · Nueva generación de software para restaurantes",
  headline: "El restaurante entero, bajo control.",
  subcopy:
    "Una plataforma SaaS nacida para la hostelería que viene: TPV, cocina, barra, reservas, carta, productos, pagos e IA conectados con una experiencia visual, rápida y actual.",
  primaryCta: { label: "Ver Hostly en acción", href: demoMailHref },
  secondaryCta: { label: "Explorar el producto", href: "#producto" },
  trustLine:
    "Menos clics. Menos esperas. Más servicio.",
  proofPoints: ["TPV", "Cocina", "Barra", "Reservas", "Productos", "Analítica", "IA"],
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

export const marketingProductIntro = {
  eyebrow: "Producto",
  title: "Software nuevo para una forma nueva de gestionar hostelería.",
  description:
    "Hostly se está construyendo desde cero como SaaS moderno para restaurantes: visual, táctil, conectado y preparado para incorporar IA sin obligar al equipo a cambiar su forma natural de trabajar.",
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
  eyebrow: "IA nativa",
  title: "IA integrada desde el diseño, no añadida después.",
  description:
    "Hostly nace en una generación de software donde la IA forma parte de la plataforma. La usamos para reducir tareas reales, ordenar información y ayudar a tomar mejores decisiones manteniendo siempre el control en el restaurante.",
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
  eyebrow: "Nueva generación",
  title: "Hostly no moderniza un sistema antiguo. Empieza de nuevo.",
  description:
    "La ventaja de llegar ahora es poder diseñar el producto alrededor de cómo trabajan hoy los restaurantes y de lo que necesitarán mañana: SaaS, tiempo real, móvil, tactilidad, datos conectados e IA.",
  items: [
    {
      icon: Timer,
      title: "Hecho para servicio real.",
      description: "La interfaz prioriza acciones frecuentes, lectura rápida y decisiones bajo presión.",
    },
    {
      icon: Layers,
      title: "Diseño de nueva generación.",
      description: "Jerarquía visual, espacios claros y una experiencia coherente en TPV, tablet, móvil y escritorio.",
    },
    {
      icon: Zap,
      title: "SaaS conectado desde el origen.",
      description: "La plataforma comparte contexto entre operación, gestión y analítica en lugar de funcionar como módulos aislados.",
    },
    {
      icon: BrainCircuit,
      title: "Preparado para la era de la IA.",
      description: "La arquitectura permite incorporar inteligencia útil progresivamente sin convertir el producto en algo más complejo.",
    },
  ] satisfies MarketingCard[],
};

export const marketingProductShowcase = {
  eyebrow: "Hostly en acción",
  title: "Un software de hostelería que se siente actual desde el primer toque.",
  description:
    "TPV táctil, plano de mesas, comandas y KDS trabajando como una misma operación en tablet, móvil y escritorio.",
};

export const marketingFinalCta = {
  title: "La nueva generación de hostelería empieza por una operación mejor.",
  description:
    "Descubre Hostly y comprueba cómo una plataforma SaaS moderna puede reducir pasos, errores y tiempo perdido durante el servicio.",
  primaryCta: { label: "Ver Hostly en acción", href: demoMailHref },
  secondaryCta: { label: "Escribir a hola@hostlyapp.app", href: "mailto:hola@hostlyapp.app" },
};

export const marketingFooter = {
  product: [
    { label: "TPV táctil", href: "#producto" },
    { label: "Mesas y plano", href: "#producto" },
    { label: "Cocina / KDS", href: "#producto" },
    { label: "Carta y productos", href: "#producto" },
    { label: "IA", href: "#ia" },
  ],
  company: [
    { label: "Flujo operativo", href: "#flujo" },
    { label: "Tipos de negocio", href: "#negocios" },
    { label: "Contacto", href: "mailto:hola@hostlyapp.app" },
  ],
  contactEmail: "hola@hostlyapp.app",
  copyright: "© Hostly. Nueva generación de software para restaurantes.",
};
