import assert from "node:assert/strict";
import test from "node:test";
import type { ActiveSessionDocument } from "../../lib/realtime/active-sessions";
import {
  sessionRoleLabel,
  sessionRouteLabel,
  sessionUserLabel,
} from "../../lib/operacion/session-presentation";

const SESSION: ActiveSessionDocument = {
  id: "document-secret",
  restaurantId: "restaurant-secret",
  sessionId: "session-secret",
  deviceId: "device-secret",
  userId: "user-secret",
  online: true,
  lastSeenAt: 2,
  createdAt: 1,
};

test("la sesión nunca presenta el UID como nombre", () => {
  assert.equal(sessionUserLabel(SESSION), "Usuario");
  assert.equal(sessionUserLabel({ ...SESSION, userName: "  Ana  " }), "Ana");
});

test("los roles se muestran en lenguaje de negocio", () => {
  assert.equal(sessionRoleLabel("owner"), "Propietario");
  assert.equal(sessionRoleLabel("manager"), "Encargado");
  assert.equal(sessionRoleLabel("unknown-internal-role"), "Equipo");
});

test("las rutas se convierten en nombres de pantallas sin exponer IDs", () => {
  assert.equal(
    sessionRouteLabel("/dashboard/configuracion/carta/productos?tab=all"),
    "Configuración · Carta · Productos",
  );
  assert.equal(
    sessionRouteLabel("/dashboard/inventario/pedidos-compra/order-secret"),
    "Inventario · Pedidos de compra",
  );
  assert.equal(sessionRouteLabel("/dashboard"), "Dashboard");
});
