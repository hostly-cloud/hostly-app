import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ALL_HOSTLY_CAPABILITIES,
  canAccessDashboardPath,
  getCapabilitiesForRole,
  hasCapability,
  requiredCapabilityForDashboardPath,
} from "../../lib/auth/hostly-capabilities";

test("owner y admin conservan todas las capacidades", () => {
  for (const role of ["owner", "admin"] as const) {
    assert.deepEqual(
      [...getCapabilitiesForRole(role)].sort(),
      [...ALL_HOSTLY_CAPABILITIES].sort(),
    );
  }
});

test("manager opera el restaurante sin administrar cuentas ni configuración sensible", () => {
  for (const capability of [
    "tpv.sell",
    "tpv.refund",
    "kds.manage",
    "reservations.manage",
    "operations.audit",
    "catalog.manage",
    "inventory.edit",
    "purchases.manage",
    "employees.manage",
    "analytics.view",
  ] as const) {
    assert.equal(hasCapability("manager", capability), true, capability);
  }
  assert.equal(hasCapability("manager", "settings.manage"), false);
  assert.equal(hasCapability("manager", "users.manage"), false);
});

test("waiter solo recibe capacidades de sala, cobro y reservas", () => {
  assert.equal(hasCapability("waiter", "tpv.sell"), true);
  assert.equal(hasCapability("camarero", "reservations.manage"), true);
  assert.equal(hasCapability("waiter", "tpv.charge"), true);
  assert.equal(hasCapability("waiter", "tpv.refund"), false);
  assert.equal(hasCapability("waiter", "kds.manage"), false);
  assert.equal(hasCapability("waiter", "analytics.view"), false);
  assert.equal(hasCapability("waiter", "operations.audit"), false);
  assert.equal(hasCapability("waiter", "settings.manage"), false);
});

test("kitchen queda limitado a KDS y viewer a analítica", () => {
  assert.deepEqual([...getCapabilitiesForRole("kitchen")], ["kds.manage"]);
  assert.deepEqual([...getCapabilitiesForRole("viewer")], ["analytics.view"]);
  assert.equal(hasCapability("cocina", "kds.manage"), true);
  assert.equal(hasCapability("readonly", "analytics.view"), true);
});

test("roles desconocidos fallan cerrados", () => {
  assert.equal(getCapabilitiesForRole("superadmin").size, 0);
  assert.equal(hasCapability("", "settings.manage"), false);
  assert.equal(hasCapability(null, "tpv.sell"), false);
});

test("las rutas sensibles resuelven el permiso correcto", () => {
  assert.equal(requiredCapabilityForDashboardPath("/dashboard/operacion/reservas"), "reservations.manage");
  assert.equal(requiredCapabilityForDashboardPath("/dashboard/operacion/activity"), "operations.audit");
  assert.equal(requiredCapabilityForDashboardPath("/dashboard/operacion/sesiones"), "operations.audit");
  assert.equal(requiredCapabilityForDashboardPath("/dashboard/configuracion/carta/productos"), "catalog.manage");
  assert.equal(requiredCapabilityForDashboardPath("/dashboard/config/mesas"), "settings.manage");
  assert.equal(requiredCapabilityForDashboardPath("/dashboard/empleados"), "employees.manage");
  assert.equal(requiredCapabilityForDashboardPath("/dashboard/usuarios"), "users.manage");
});

test("el gate de rutas impide escalada por URL directa", () => {
  assert.equal(canAccessDashboardPath("waiter", "/dashboard/operacion/tpv"), true);
  assert.equal(canAccessDashboardPath("waiter", "/dashboard/operacion/reservas/clientes"), true);
  assert.equal(canAccessDashboardPath("waiter", "/dashboard/operacion/cocina"), false);
  assert.equal(canAccessDashboardPath("waiter", "/dashboard/analisis"), false);
  assert.equal(canAccessDashboardPath("manager", "/dashboard/configuracion/carta/productos"), true);
  assert.equal(canAccessDashboardPath("manager", "/dashboard/configuracion"), false);
  assert.equal(canAccessDashboardPath("viewer", "/dashboard/analisis/ventas"), true);
  assert.equal(canAccessDashboardPath("viewer", "/dashboard/operacion/activity"), false);
  assert.equal(canAccessDashboardPath("kitchen", "/dashboard/operacion/barra"), true);
  assert.equal(canAccessDashboardPath("kitchen", "/dashboard/caja"), false);
});

test("las APIs críticas usan capacidades específicas y no permisos prestados", () => {
  const reservations = readFileSync("app/api/reservations/operations/route.ts", "utf8");
  const employees = readFileSync("app/api/employees/operations/route.ts", "utf8");
  const employeeDocuments = readFileSync("app/api/employees/documents/route.ts", "utf8");
  const dashboardGate = readFileSync("components/auth/dashboard-gate.tsx", "utf8");

  assert.match(reservations, /reservations\.manage/);
  assert.doesNotMatch(reservations, /serverRoleHasCapability\(authCtx\.role, "tpv\.sell"\)/);
  assert.match(employees, /employees\.manage/);
  assert.match(employeeDocuments, /canManageUsers/);
  assert.match(dashboardGate, /canAccessDashboardPath/);
});
