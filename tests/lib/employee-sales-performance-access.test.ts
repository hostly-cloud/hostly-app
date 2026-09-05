import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessDashboardPath,
  requiredCapabilityForDashboardPath,
} from "@/lib/auth/hostly-capabilities";

test("employee performance stays behind employees.manage", () => {
  const path = "/dashboard/empleados/rendimiento";
  assert.equal(requiredCapabilityForDashboardPath(path), "employees.manage");
  assert.equal(canAccessDashboardPath("manager", path), true);
  assert.equal(canAccessDashboardPath("waiter", path), false);
  assert.equal(canAccessDashboardPath("kitchen", path), false);
});
