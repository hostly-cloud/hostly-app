/**
 * Política RBAC canónica de Hostly.
 *
 * Esta matriz es la única fuente TypeScript para frontend y backend. Las
 * reglas de Firestore reflejan las mismas familias de permisos y siguen
 * siendo la última barrera para escrituras directas desde cliente.
 */

import type { UserRestaurantRole } from "@/lib/firestore/user-restaurant-profile";
import { normalizeAuthorizationRole } from "@/lib/auth/profile-authorization-policy";

export type HostlyCapability =
  | "tpv.sell"
  | "tpv.cancel_line"
  | "tpv.discount"
  | "tpv.charge"
  | "tpv.refund"
  | "tpv.join_tables"
  | "kds.manage"
  | "reservations.manage"
  | "operations.audit"
  | "catalog.manage"
  | "inventory.view"
  | "inventory.edit"
  | "purchases.view"
  | "purchases.manage"
  | "supplier_invoices.manage"
  | "employees.manage"
  | "analytics.view"
  | "settings.manage"
  | "users.manage";

export type HostlyRole =
  | "owner"
  | "admin"
  | "manager"
  | "waiter"
  | "kitchen"
  | "viewer";

export type HostlyUserContext = {
  role?: unknown;
  userId?: string | null;
};

export const CAPABILITY_DENIED_MESSAGE = "No tienes permiso para esta acción";

export const ALL_HOSTLY_CAPABILITIES: readonly HostlyCapability[] = [
  "tpv.sell",
  "tpv.cancel_line",
  "tpv.discount",
  "tpv.charge",
  "tpv.refund",
  "tpv.join_tables",
  "kds.manage",
  "reservations.manage",
  "operations.audit",
  "catalog.manage",
  "inventory.view",
  "inventory.edit",
  "purchases.view",
  "purchases.manage",
  "supplier_invoices.manage",
  "employees.manage",
  "analytics.view",
  "settings.manage",
  "users.manage",
] as const;

const MANAGER_CAPABILITIES: readonly HostlyCapability[] = [
  "tpv.sell",
  "tpv.cancel_line",
  "tpv.discount",
  "tpv.charge",
  "tpv.refund",
  "tpv.join_tables",
  "kds.manage",
  "reservations.manage",
  "operations.audit",
  "catalog.manage",
  "inventory.view",
  "inventory.edit",
  "purchases.view",
  "purchases.manage",
  "supplier_invoices.manage",
  "employees.manage",
  "analytics.view",
];

const WAITER_CAPABILITIES: readonly HostlyCapability[] = [
  "tpv.sell",
  "tpv.cancel_line",
  "tpv.charge",
  "reservations.manage",
];

const KITCHEN_CAPABILITIES: readonly HostlyCapability[] = ["kds.manage"];
const VIEWER_CAPABILITIES: readonly HostlyCapability[] = ["analytics.view"];

export const HOSTLY_ROLE_CAPABILITIES: Readonly<Record<HostlyRole, readonly HostlyCapability[]>> = {
  owner: ALL_HOSTLY_CAPABILITIES,
  admin: ALL_HOSTLY_CAPABILITIES,
  manager: MANAGER_CAPABILITIES,
  waiter: WAITER_CAPABILITIES,
  kitchen: KITCHEN_CAPABILITIES,
  viewer: VIEWER_CAPABILITIES,
};

export const HOSTLY_CAPABILITY_LABELS: Readonly<Record<HostlyCapability, string>> = {
  "tpv.sell": "Vender en TPV",
  "tpv.cancel_line": "Cancelar líneas",
  "tpv.discount": "Aplicar descuentos",
  "tpv.charge": "Cobrar mesas",
  "tpv.refund": "Devoluciones",
  "tpv.join_tables": "Unir/separar mesas",
  "kds.manage": "Gestionar cocina y KDS",
  "reservations.manage": "Gestionar reservas",
  "operations.audit": "Supervisar actividad y sesiones",
  "catalog.manage": "Gestionar carta y productos",
  "inventory.view": "Ver inventario",
  "inventory.edit": "Editar inventario",
  "purchases.view": "Ver compras",
  "purchases.manage": "Gestionar compras",
  "supplier_invoices.manage": "Registrar facturas de proveedor",
  "employees.manage": "Gestionar empleados",
  "analytics.view": "Ver analítica",
  "settings.manage": "Gestionar configuración",
  "users.manage": "Gestionar usuarios y accesos",
};

/** Normaliza roles Firebase/legacy a rol Hostly operacional sin escalar desconocidos. */
export function normalizeHostlyRole(role: unknown): HostlyRole | null {
  return normalizeAuthorizationRole(role);
}

export function normalizeHostlyRoleFromProfile(role: UserRestaurantRole | unknown): HostlyRole | null {
  return normalizeHostlyRole(role);
}

export function getCapabilitiesForRole(role: unknown): Set<HostlyCapability> {
  const normalized = normalizeHostlyRole(role);
  if (!normalized) return new Set();
  return new Set(HOSTLY_ROLE_CAPABILITIES[normalized]);
}

export function hasCapability(roleOrUser: unknown | HostlyUserContext, capability: HostlyCapability): boolean {
  const role =
    typeof roleOrUser === "object" && roleOrUser != null && "role" in (roleOrUser as HostlyUserContext)
      ? (roleOrUser as HostlyUserContext).role
      : roleOrUser;
  return getCapabilitiesForRole(role).has(capability);
}

export function canUser(userContext: HostlyUserContext | null | undefined, capability: HostlyCapability): boolean {
  return Boolean(userContext && hasCapability(userContext.role, capability));
}

export function requireCapabilityLabel(capability: HostlyCapability): string {
  return HOSTLY_CAPABILITY_LABELS[capability] ?? capability;
}

export function listCapabilitiesForRole(role: unknown): HostlyCapability[] {
  return [...getCapabilitiesForRole(role)];
}

const DASHBOARD_ACCESS: readonly { prefix: string; capability: HostlyCapability }[] = [
  { prefix: "/dashboard/configuracion/empleados", capability: "employees.manage" },
  { prefix: "/dashboard/empleados", capability: "employees.manage" },
  { prefix: "/dashboard/usuarios", capability: "users.manage" },
  { prefix: "/dashboard/invitaciones", capability: "users.manage" },
  { prefix: "/dashboard/onboarding", capability: "settings.manage" },
  { prefix: "/dashboard/configuracion/carta", capability: "catalog.manage" },
  { prefix: "/dashboard/validacion-inteligente", capability: "catalog.manage" },
  { prefix: "/dashboard/productos", capability: "catalog.manage" },
  { prefix: "/dashboard/escandallos", capability: "catalog.manage" },
  { prefix: "/dashboard/inventario", capability: "inventory.view" },
  { prefix: "/dashboard/stock", capability: "inventory.view" },
  { prefix: "/dashboard/mermas", capability: "inventory.edit" },
  { prefix: "/dashboard/compras", capability: "purchases.view" },
  { prefix: "/dashboard/recepciones", capability: "purchases.manage" },
  { prefix: "/dashboard/facturas-costes", capability: "supplier_invoices.manage" },
  { prefix: "/dashboard/analisis", capability: "analytics.view" },
  { prefix: "/dashboard/reportes", capability: "analytics.view" },
  { prefix: "/dashboard/metrics", capability: "analytics.view" },
  { prefix: "/dashboard/operacion/activity", capability: "operations.audit" },
  { prefix: "/dashboard/operacion/sesiones", capability: "operations.audit" },
  { prefix: "/dashboard/operacion/reservas", capability: "reservations.manage" },
  { prefix: "/dashboard/operacion/cocteleria", capability: "kds.manage" },
  { prefix: "/dashboard/operacion/cocina", capability: "kds.manage" },
  { prefix: "/dashboard/operacion/barra", capability: "kds.manage" },
  { prefix: "/dashboard/cocina", capability: "kds.manage" },
  { prefix: "/dashboard/operacion/sommelier", capability: "tpv.sell" },
  { prefix: "/dashboard/operacion/tpv", capability: "tpv.sell" },
  { prefix: "/dashboard/operacion/sala", capability: "tpv.sell" },
  { prefix: "/dashboard/sala", capability: "tpv.sell" },
  { prefix: "/dashboard/carta", capability: "tpv.sell" },
  { prefix: "/dashboard/mesas", capability: "tpv.sell" },
  { prefix: "/dashboard/tables", capability: "tpv.sell" },
  { prefix: "/dashboard/orders", capability: "tpv.sell" },
  { prefix: "/dashboard/caja", capability: "tpv.charge" },
  { prefix: "/dashboard/configuracion", capability: "settings.manage" },
  { prefix: "/dashboard/config", capability: "settings.manage" },
];

export function requiredCapabilityForDashboardPath(pathname: string): HostlyCapability | null {
  const path = String(pathname || "").split("?")[0]?.replace(/\/$/, "") || "/";
  const match = DASHBOARD_ACCESS.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
  return match?.capability ?? null;
}

export function canAccessDashboardPath(role: unknown, pathname: string): boolean {
  const required = requiredCapabilityForDashboardPath(pathname);
  return required == null || hasCapability(role, required);
}
