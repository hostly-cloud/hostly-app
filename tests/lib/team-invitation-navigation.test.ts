import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const employeesSource = readFileSync(
  "app/dashboard/empleados/employees-page-content.tsx",
  "utf8",
);
const invitationsSource = readFileSync(
  "app/dashboard/invitaciones/page.tsx",
  "utf8",
);
const teamStyles = readFileSync(
  "app/dashboard/dashboard-viewport-fit-secondary.css",
  "utf8",
);

test("employees exposes the invitation flow as its primary action", () => {
  assert.match(employeesSource, /href="\/dashboard\/invitaciones"/);
  assert.match(employeesSource, /Invitar empleado/);
  assert.match(employeesSource, /hostly-employees-invite-link/);
});

test("invitations returns to the team workspace and uses the primary action system", () => {
  assert.match(invitationsSource, /backHref="\/dashboard\/configuracion\/empleados"/);
  assert.match(invitationsSource, /backLabel="Volver al equipo"/);
  assert.match(invitationsSource, /variant="primary"/);
  assert.doesNotMatch(invitationsSource, /#16a34a/);
});

test("the invitation workspace has a dedicated mobile layout", () => {
  assert.match(teamStyles, /\.hostly-invites-workspace/);
  assert.match(
    teamStyles,
    /\.hostly-invites-workspace \{ grid-template-columns: minmax\(0, 1fr\); \}/,
  );
  assert.match(teamStyles, /\.hostly-invites-submit \{ width: 100%; \}/);
});
