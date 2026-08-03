import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import {
  canPublishSalaEditorMap,
  SALA_EDITOR_PUBLISH_CAPABILITY,
  SALA_EDITOR_PUBLISH_FORBIDDEN_ERROR,
} from "@/lib/server/sala-editor/require-sala-editor-publish-capability";

describe("sala-editor publish capability (settings.manage)", () => {
  test("capability canónica es settings.manage", () => {
    assert.equal(SALA_EDITOR_PUBLISH_CAPABILITY, "settings.manage");
    assert.equal(SALA_EDITOR_PUBLISH_FORBIDDEN_ERROR, "SETTINGS_MANAGE_REQUIRED");
  });

  test("owner y admin pueden publicar", () => {
    assert.equal(canPublishSalaEditorMap("owner"), true);
    assert.equal(canPublishSalaEditorMap("propietario"), true);
    assert.equal(canPublishSalaEditorMap("admin"), true);
    assert.equal(canPublishSalaEditorMap("administrator"), true);
  });

  test("manager/encargado no tienen settings.manage en el modelo actual", () => {
    assert.equal(canPublishSalaEditorMap("manager"), false);
    assert.equal(canPublishSalaEditorMap("gerente"), false);
    assert.equal(canPublishSalaEditorMap("encargado"), false);
  });

  test("roles operativos denegados", () => {
    for (const role of [
      "waiter",
      "camarero",
      "kitchen",
      "cocina",
      "bar",
      "viewer",
      "staff",
      "staff_tpv",
      null,
      undefined,
      "",
    ]) {
      assert.equal(
        canPublishSalaEditorMap(role),
        false,
        `expected deny for role=${String(role)}`,
      );
    }
  });

  test("POST publish exige SETTINGS_MANAGE; GET published no", () => {
    const publishSrc = readFileSync(
      "app/api/sala-editor/publish/route.ts",
      "utf8",
    );
    const publishedSrc = readFileSync(
      "app/api/sala-editor/published/route.ts",
      "utf8",
    );
    assert.match(publishSrc, /SETTINGS_MANAGE_REQUIRED|canPublishSalaEditorMap/);
    assert.match(publishSrc, /settings\.manage|SALA_EDITOR_PUBLISH/);
    assert.doesNotMatch(publishedSrc, /SETTINGS_MANAGE|settings\.manage|canPublishSalaEditorMap/);
    assert.match(publishedSrc, /requireAuthenticatedRestaurant/);
  });
});
