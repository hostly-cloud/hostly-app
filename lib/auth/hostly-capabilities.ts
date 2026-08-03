/**
 * Capacidades operacionales Hostly (frontend + Firestore rules Fase 5B).
 *
 * Matriz replicada parcialmente en firestore.rules (helpers normalizedRole/canManage*).
 * Pendiente: orders/payments/KDS writes en rules.
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
  | "inventory.view"
  | "inventory.edit"
  | "purchases.view"
  | "purchases.manage"
  | "supplier_invoices.manage"
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

export const CAPABILITY_DENIED_MESSAGE =
  "No tienes permiso para esta acción";

const ALL_CAPABILITIES: readonly HostlyCapability[] = [
  "tpv.sell",
  "tpv.cancel_line",
  "tpv.discount",
  "tpv.charge",
  "tpv.refund",
  "tpv.join_tables",
  "kds.manage",
  "inventory.view",
  "inventory.edit",
  "purchases.view",
  "purchases.manage",
  "supplier_invoices.manage",
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
  "inventory.view",
  "inventory.edit",
  "purchases.view",
  "purchases.manage",
  "supplier_invoices.manage",
  "analytics.view",
];

const WAITER_CAPABILITIES: readonly HostlyCapability[] = [
  "tpv.sell",
  "tpv.cancel_line",
  "tpv.charge",
];

const KITCHEN_CAPABILITIES: readonly HostlyCapability[] = ["kds.manage"];

const VIEWER_CAPABILITIES: readonly HostlyCapability[] = ["analytics.view"];

export const HOSTLY_ROLE_CAPABILITIES: Readonly<
  Record<HostlyRole, readonly HostlyCapability[]>
> = {
  owner: ALL_CAPABILITIES,
  admin: ALL_CAPABILITIES,
  manager: MANAGER_CAPABILITIES,
  waiter: WAITER_CAPABILITIES,
  kitchen: KITCHEN_CAPABILITIES,
  viewer: VIEWER_CAPABILITIES,
};

export const HOSTLY_CAPABILITY_LABELS: Readonly<
  Record<HostlyCapability, string>
> = {
  "tpv.sell": "Vender en TPV",
  "tpv.cancel_line": "Cancelar líneas",
  "tpv.discount": "Aplicar descuentos",
  "tpv.charge": "Cobrar mesas",
  "tpv.refund": "Devoluciones",
  "tpv.join_tables": "Unir/separar mesas",
  "kds.manage": "Gestionar KDS",
  "inventory.view": "Ver inventario",
  "inventory.edit": "Editar inventario",
  "purchases.view": "Ver compras",
  "purchases.manage": "Gestionar compras",
  "supplier_invoices.manage": "Registrar facturas proveedor",
  "analytics.view": "Ver analítica",
  "settings.manage": "Gestionar configuración",
  "users.manage": "Gestionar usuarios",
};

/** Normaliza roles Firebase/legacy a rol Hostly operacional. */
export function normalizeHostlyRole(role: unknown): HostlyRole | null {
  return normalizeAuthorizationRole(role);
}

export function normalizeHostlyRoleFromProfile(
  role: UserRestaurantRole | unknown,
): HostlyRole | null {
  return normalizeHostlyRole(role);
}

export function getCapabilitiesForRole(role: unknown): Set<HostlyCapability> {
  const normalized = normalizeHostlyRole(role);
  if (!normalized) return new Set();
  return new Set(HOSTLY_ROLE_CAPABILITIES[normalized]);
}

export function hasCapability(
  roleOrUser: unknown | HostlyUserContext,
  capability: HostlyCapability,
): boolean {
  const role =
    typeof roleOrUser === "object" &&
    roleOrUser != null &&
    "role" in (roleOrUser as HostlyUserContext)
      ? (roleOrUser as HostlyUserContext).role
      : roleOrUser;

  return getCapabilitiesForRole(role).has(capability);
}

export function canUser(
  userContext: HostlyUserContext | null | undefined,
  capability: HostlyCapability,
): boolean {
  if (!userContext) return false;
  return hasCapability(userContext.role, capability);
}

export function requireCapabilityLabel(capability: HostlyCapability): string {
  return HOSTLY_CAPABILITY_LABELS[capability] ?? capability;
}

export function listCapabilitiesForRole(role: unknown): HostlyCapability[] {
  return [...getCapabilitiesForRole(role)];
}
