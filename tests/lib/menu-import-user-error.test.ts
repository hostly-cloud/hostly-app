import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  MENU_IMPORT_GENERIC_ERROR,
  resolveMenuImportUserError,
} from "../../lib/carta/menu-import-user-error";

describe("resolveMenuImportUserError", () => {
  test("mantiene códigos operativos con una explicación útil", () => {
    assert.equal(
      resolveMenuImportUserError("NO_PRODUCTS_DETECTED"),
      "No hemos podido detectar productos claros en esta carta. Sube una imagen más nítida o crea productos manualmente.",
    );
    assert.equal(
      resolveMenuImportUserError("ANALYZING_IN_PROGRESS"),
      "El borrador ya se está procesando. Espera unos segundos e inténtalo de nuevo.",
    );
  });

  test("oculta errores de credenciales, permisos y proyectos", () => {
    assert.equal(
      resolveMenuImportUserError("Could not load the default credentials. Browse to cloud.google.com"),
      MENU_IMPORT_GENERIC_ERROR,
    );
    assert.equal(
      resolveMenuImportUserError("PERMISSION_DENIED: project 384635902347"),
      MENU_IMPORT_GENERIC_ERROR,
    );
    assert.equal(resolveMenuImportUserError("PROCESS_FAILED"), MENU_IMPORT_GENERIC_ERROR);
  });
});
