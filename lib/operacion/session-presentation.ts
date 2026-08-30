import type { ActiveSessionDocument } from "@/lib/realtime/active-sessions";

const ROUTE_SEGMENT_LABELS: Record<string, string> = {
  analisis: "Análisis",
  ventas: "Ventas",
  carta: "Carta",
  categorias: "Categorías",
  cocteleria: "Coctelería",
  compras: "Compras",
  configuracion: "Configuración",
  empleados: "Empleados",
  empresa: "Empresa",
  escandallos: "Escandallos",
  espacios: "Espacios",
  estaciones: "Estaciones",
  familias: "Familias",
  "familias-producto": "Familias de producto",
  "facturas-costes": "Facturas y costes",
  "facturas-proveedor": "Facturas de proveedor",
  importacion: "Importación",
  "ia-importacion": "Importación inteligente",
  "import-workspace": "Importar carta",
  importar: "Importar",
  impresoras: "Impresoras",
  integraciones: "Integraciones",
  inventario: "Inventario",
  invitaciones: "Invitaciones",
  mermas: "Mermas",
  mesas: "Mesas",
  modificadores: "Modificadores",
  nueva: "Nueva",
  nuevo: "Nuevo",
  onboarding: "Primeros pasos",
  operacion: "Operación",
  barra: "Barra",
  cocina: "Cocina",
  reservas: "Reservas",
  sala: "Sala",
  sesiones: "Sesiones",
  tpv: "TPV",
  "pedidos-compra": "Pedidos de compra",
  productos: "Productos",
  recepciones: "Recepciones",
  reportes: "Informes",
  stock: "Stock",
  usuarios: "Usuarios",
  "validacion-inteligente": "Validación inteligente",
};

export function sessionUserLabel(session: ActiveSessionDocument): string {
  return session.userName?.trim() || "Usuario";
}

export function sessionRoleLabel(role?: string): string {
  switch (role?.trim().toLowerCase()) {
    case "owner":
      return "Propietario";
    case "admin":
      return "Administrador";
    case "manager":
      return "Encargado";
    case "waiter":
    case "camarero":
      return "Camarero";
    case "staff":
      return "Equipo";
    default:
      return "Equipo";
  }
}

export function sessionRouteLabel(route?: string): string {
  const pathname = route?.trim().split(/[?#]/, 1)[0];
  if (!pathname) return "Hostly";

  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "dashboard") segments.shift();
  if (segments.length === 0) return "Dashboard";

  const labels: string[] = [];
  for (const segment of segments) {
    const label = ROUTE_SEGMENT_LABELS[segment.toLowerCase()];
    if (!label) break;
    labels.push(label);
  }
  return labels.length > 0 ? labels.join(" · ") : "Hostly";
}
