import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  findHostlyHelpIntent,
  shouldShowHostlyHelpAssistant,
} from "../../lib/assistant/hostly-help-intents";

describe("findHostlyHelpIntent", () => {
  test("lleva las preguntas solicitadas a sus rutas canónicas", () => {
    assert.equal(
      findHostlyHelpIntent("¿Cómo puedo enlazar la impresora?")?.href,
      "/dashboard/configuracion/impresoras",
    );
    assert.equal(
      findHostlyHelpIntent("¿Cómo puedo meter la foto de un producto?")?.href,
      "/dashboard/configuracion/carta/productos",
    );
    assert.equal(
      findHostlyHelpIntent("Quiero hacer una foto a la carta e importarla")?.href,
      "/dashboard/configuracion/carta/importacion",
    );
  });

  test("no ofrece una ruta sin la capacidad necesaria", () => {
    const result = findHostlyHelpIntent(
      "enlazar impresora",
      (capability) => capability !== "settings.manage",
    );
    assert.equal(result, null);
  });

  test("no inventa respuestas para una pregunta desconocida", () => {
    assert.equal(findHostlyHelpIntent("pronóstico del tiempo"), null);
  });
});

describe("shouldShowHostlyHelpAssistant", () => {
  test("no tapa controles de TPV, KDS o mesas", () => {
    assert.equal(shouldShowHostlyHelpAssistant("/dashboard/operacion/tpv"), false);
    assert.equal(shouldShowHostlyHelpAssistant("/dashboard/operacion/cocina"), false);
    assert.equal(shouldShowHostlyHelpAssistant("/dashboard/mesas/mesa-1"), false);
  });

  test("se muestra en dashboard y configuración", () => {
    assert.equal(shouldShowHostlyHelpAssistant("/dashboard"), true);
    assert.equal(shouldShowHostlyHelpAssistant("/dashboard/configuracion/impresoras"), true);
  });
});
