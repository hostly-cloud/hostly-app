import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolveConfigScrollOwner } from "../../lib/configuracion/config-nav";

describe("Configuration scroll ownership", () => {
  it("lets the hub grow with the document", () => {
    assert.equal(resolveConfigScrollOwner("/dashboard/configuracion"), "document");
  });

  it("keeps Editor V2 immersive", () => {
    assert.equal(
      resolveConfigScrollOwner("/dashboard/configuracion/espacios/editor-v2"),
      "viewport",
    );
  });

  it("preserves internal scrolling for bounded workbenches", () => {
    const paths = [
      "/dashboard/configuracion/carta/productos",
      "/dashboard/configuracion/carta/escandallos",
      "/dashboard/configuracion/carta/import-workspace",
      "/dashboard/configuracion/empleados",
      "/dashboard/configuracion/empresa",
      "/dashboard/configuracion/espacios/zonas",
    ];

    for (const path of paths) {
      assert.equal(resolveConfigScrollOwner(path), "internal", path);
    }
  });

  it("uses the complete content pane for standard configuration pages", () => {
    const paths = [
      "/dashboard/configuracion/estaciones",
      "/dashboard/configuracion/impresoras",
      "/dashboard/configuracion/impresoras/cola",
      "/dashboard/configuracion/carta/familias",
      "/dashboard/configuracion/carta/categorias",
      "/dashboard/configuracion/carta/categorias/pizzas/ordenar",
      "/dashboard/configuracion/modificadores",
      "/dashboard/configuracion/familias-producto",
      "/dashboard/configuracion/carta/importacion",
    ];

    for (const path of paths) {
      assert.equal(resolveConfigScrollOwner(path), "content", path);
    }
  });

  it("scopes fixed list geometry to internal-scroll workbenches", () => {
    const css = readFileSync("app/dashboard/dashboard-viewport-fit.css", "utf8");
    const listContractStart = css.indexOf("/* List workbenches:");
    const contentContractStart = css.indexOf("/* Standard pages:");

    assert.ok(listContractStart >= 0);
    assert.ok(contentContractStart > listContractStart);

    const listContract = css.slice(listContractStart, contentContractStart);
    assert.match(listContract, /data-hostly-config-scroll-owner="internal"/);
    assert.doesNotMatch(listContract, /\[data-hostly-config-shell\]/);
    assert.match(
      css,
      /\[data-hostly-config-scroll-owner="content"\] \[data-hostly-config-content\][\s\S]*overflow-y: auto;/,
    );
    assert.match(
      css,
      /\[data-hostly-config-scroll-owner="content"\][\s\S]*\.hostly-data-table-viewport--embedded[\s\S]*overflow: visible !important;/,
    );
    assert.match(
      css,
      /\[data-hostly-config-scroll-owner="internal"\]\s+main\.hostly-module-shell--mobile:has\(\.hostly-data-table--categorias\)[\s\S]*?\.hostly-mobile-list-shell/,
    );
    assert.doesNotMatch(
      css,
      /\[data-hostly-config-shell\]\s+main\.hostly-module-shell--mobile:has\(\.hostly-data-table--categorias\)[\s\S]*?\.hostly-mobile-list-shell/,
    );
  });
});
