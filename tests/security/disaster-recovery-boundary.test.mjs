import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const bootstrapRoute = "app/api/internal/dr-bootstrap-20260905/route.ts";
const runbookPath = "docs/operations/disaster-recovery.md";

test("one-time disaster recovery bootstrap endpoint is not shipped", () => {
  assert.equal(existsSync(bootstrapRoute), false);
});

test("disaster recovery runbook preserves the admin/runtime security boundary", () => {
  assert.equal(existsSync(runbookPath), true);
  const runbook = readFileSync(runbookPath, "utf8");
  assert.match(runbook, /no deben\*\* administrar la configuraci[oó]n de Firestore/i);
  assert.match(runbook, /--enable-pitr/);
  assert.match(runbook, /--delete-protection/);
  assert.match(runbook, /--recurrence=daily/);
  assert.match(runbook, /--recurrence=weekly/);
  assert.match(runbook, /--retention=14w/);
  assert.match(runbook, /databases clone/);
  assert.match(runbook, /No crear endpoints HTTP permanentes/i);
});
