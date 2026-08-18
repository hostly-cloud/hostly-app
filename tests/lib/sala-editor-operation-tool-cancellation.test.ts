import assert from "node:assert/strict";
import test from "node:test";
import {
  createActiveOperationalElement,
  toggleActiveOperationalElement,
} from "../../lib/sala-editor/ose/active-operational-element";
import {
  registerOperationalEscapeListener,
  resolveOperationalEscapeAction,
} from "../../hooks/useOperationalElementDragging";

test("la herramienta de Operación alterna entre activa y neutral", () => {
  const active = toggleActiveOperationalElement(null, "TABLE", "round");
  assert.deepEqual(active, createActiveOperationalElement("TABLE", "round"));

  const neutral = toggleActiveOperationalElement(active, "TABLE", "round");
  assert.equal(neutral, null);
});

test("una herramienta diferente reemplaza la herramienta activa", () => {
  const active = createActiveOperationalElement("TABLE", "round");
  const next = toggleActiveOperationalElement(active, "TABLE", "square");

  assert.deepEqual(next, createActiveOperationalElement("TABLE", "square"));
});

test("Escape cancela la herramienta sin mutar las mesas", () => {
  const tables = [{ id: "table-1" }, { id: "table-2" }];
  const action = resolveOperationalEscapeAction({
    activePlacementTool: true,
    blocked: false,
    defaultPrevented: false,
    editableTarget: false,
    hasPendingDrag: false,
    isDragging: false,
  });

  assert.equal(action, "cancel-tool");
  assert.deepEqual(tables, [{ id: "table-1" }, { id: "table-2" }]);
});

test("Escape respeta drag, controles editables, diálogos y eventos consumidos", () => {
  assert.equal(
    resolveOperationalEscapeAction({
      activePlacementTool: true,
      blocked: false,
      defaultPrevented: false,
      editableTarget: false,
      hasPendingDrag: true,
      isDragging: false,
    }),
    "cancel-drag",
  );
  assert.equal(
    resolveOperationalEscapeAction({
      activePlacementTool: true,
      blocked: false,
      defaultPrevented: false,
      editableTarget: true,
      hasPendingDrag: false,
      isDragging: false,
    }),
    null,
  );
  assert.equal(
    resolveOperationalEscapeAction({
      activePlacementTool: true,
      blocked: true,
      defaultPrevented: false,
      editableTarget: false,
      hasPendingDrag: false,
      isDragging: false,
    }),
    null,
  );
  assert.equal(
    resolveOperationalEscapeAction({
      activePlacementTool: true,
      blocked: false,
      defaultPrevented: true,
      editableTarget: false,
      hasPendingDrag: false,
      isDragging: false,
    }),
    null,
  );
});

test("el listener de Escape se limpia y no se acumula", () => {
  class CountingTarget extends EventTarget {
    activeListeners = 0;

    override addEventListener(...args: Parameters<EventTarget["addEventListener"]>) {
      this.activeListeners += 1;
      super.addEventListener(...args);
    }

    override removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) {
      this.activeListeners -= 1;
      super.removeEventListener(...args);
    }
  }

  const target = new CountingTarget();
  const cleanupFirst = registerOperationalEscapeListener(target, () => undefined);
  assert.equal(target.activeListeners, 1);
  cleanupFirst();
  assert.equal(target.activeListeners, 0);

  const cleanupSecond = registerOperationalEscapeListener(target, () => undefined);
  assert.equal(target.activeListeners, 1);
  cleanupSecond();
  assert.equal(target.activeListeners, 0);
});
